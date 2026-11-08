# 沙盘战役归属（campaignOwner）从 Redis 迁到 SQLite —— 设计方案

状态：**🟡 待实施**
拟定日期：2026-11-08

## 背景

Redis 里的 `jadedungeon::sandtable::campaignOwner::<campaignId>` 是一个 String key，
存战役归属（owner 用户名，首个成功写入者）。这次把它迁到 SQLite，同时把「战役归属」
扩展成一张完整的战役表 `sandtable_campaign`（带描述、时间戳）。

场景数据 / 移动请求 / 骰子结果**仍留在 Redis**，它们的 key 都用 campaignId 定位：

```
jadedungeon::sandtable::scence::<campaignId>::<placeId>::<sceneId>
jadedungeon::sandtable::moveReq::<campaignId>::<placeId>::<sceneId>
jadedungeon::sandtable::rollDiceResult::<campaignId>::<placeId>::<sceneId>
```

所以 campaignId（即本表的 `campaign_id`）是**跨两套存储的业务键**，必须原样保留、必须唯一。

## 决策速览

| # | 事项 | 决策 |
|---|------|------|
| 1 | 主键 | `campaign_id` 直接用用户手填的战役名文本（原 campaignId），`TEXT PRIMARY KEY` |
| 2 | 去掉自增 id | 不引入技术主键，避免「自增 id + UNIQUE name」的双键冗余 |
| 3 | 描述字段 | `detail_info TEXT NOT NULL DEFAULT ''`（`desc` 是 SQL 关键字，且「详细信息」语义更明确） |
| 4 | 时间字段 | `create_time` / `update_time`，INTEGER epoch ms |
| 5 | owner 外键 | 不加。owner 是业务标记，删用户不应级联删战役 |
| 6 | owner 索引 | 暂不加，当前没有「按 owner 列战役」的查询 |
| 7 | 并发占有 | `INSERT OR IGNORE` + 重查，原子化「首个写入者占有」 |

## 表结构

```sql
CREATE TABLE IF NOT EXISTS sandtable_campaign (
    campaign_id TEXT    PRIMARY KEY,
    owner       TEXT    NOT NULL,
    detail_info TEXT    NOT NULL DEFAULT '',
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL
);
```

| 列 | 类型 | 说明 |
|----|------|------|
| `campaign_id` | `TEXT PRIMARY KEY` | 原 campaignId 文本，业务主键（隐含 UNIQUE + NOT NULL），关联 Redis 场景/移动/骰子 |
| `owner` | `TEXT NOT NULL` | 归属用户名 |
| `detail_info` | `TEXT NOT NULL DEFAULT ''` | 描述/详细信息 |
| `create_time` | `INTEGER NOT NULL` | 创建时间，epoch ms |
| `update_time` | `INTEGER NOT NULL` | 最后变更时间，epoch ms |

## 关键设计

### 1. `campaign_id` 做文本主键，不设自增 id

- **去掉冗余**：所有查询（`map-owner`、`authorizeSceneWrite`）都是「按手填文本找 owner」，
  命中 `campaign_id`。自增 id 从头到尾不参与任何查询、没有任何外键指向它。
- **迁移零映射损耗**：Redis key 里的 campaignId 直接变主键，迁移脚本不生成任何新值。
- **与先例一致**：`auth_user.username TEXT PRIMARY KEY` 已是文本主键。

代价（可接受）：文本主键不可变、比整数慢。但改 campaignId 本来就会让 Redis 里的
场景/移动/骰子失联（现状语义），且战役行数是个位数级，差异无感。

### 2. 并发占有用 `INSERT OR IGNORE` 原子化

原来的 `authorizeSceneWrite` 是「先 `GET` 看有没有 owner，没有再 `SET`」两步，
有 get-then-set 竞态。迁到 SQLite 后 `campaign_id` 是主键，改成：

```ts
const inserted = await getSqlite().run(
    `INSERT OR IGNORE INTO sandtable_campaign (campaign_id, owner, detail_info, create_time, update_time)
     VALUES (?, ?, '', ?, ?)`, [campaignId, username, now, now]);
const owner = await getCampaignOwner(campaignId);
```

`INSERT OR IGNORE` 撞主键冲突时静默跳过（`changes=0`），再查出来的就是真正的 owner。
并发首次写入同名战役时，后到者会拿到「已被别人占有 → not owner」，而不是误判成创建成功。

### 3. owner 不加外键、不建索引

- **不加外键**：owner 是「战役归属」业务标记，不是认证数据。删用户时战役应保留
  （owner 悬空可接受），外键 `ON DELETE CASCADE` 会连带删战役，是负收益。
- **不建 owner 索引**：`map-owner` 是「按 campaign_id 查 owner」，方向相反，owner 索引
  当前没有查询用到。将来做「我的战役列表」再加。

## 迁移脚本

`src/main/ts/scripts/migrateCampaignOwnerRedisToSqlite.ts`：

- 扫 `jadedungeon::sandtable::campaignOwner::*`，`GET` 每个 key 拿 owner。
- **campaign_id 用前缀截断**（`key.slice(PREFIX.length)`），不用 `split('::').pop()`——
  用户手填文本可能含 `::`。
- Redis 里没有描述和时间，`detail_info` 兜底空串、`create_time`/`update_time` 兜底迁移时刻。
- 幂等（按 `campaign_id` 判重）、默认演练、加 `--write` 才写、不删 Redis 原数据。

## 迁移后状态与边界

- sandtable 呈「**owner 在 SQLite + 场景/移动/骰子在 Redis**」的混合态，是有意的一步。
- `map-owner` / `save-map` 的对外行为不变（前端无需改动），只是归属数据落在 SQLite。
- 同名战役共享 owner 的既有语义不变：Redis 时代 key 相同 = 覆盖，SQLite 时代主键相同 = 同一行。
