# 沙盘 campaign / place / scene 主键 id 化 —— 实施计划

状态：🟡 待审阅
拟定/更新日期：2026-11-08

## 背景与目标

沙盘的三级定位（campaign / place / scene）目前都是用户手填的文本，文本直接拼进
Redis 的 `scence` / `moveReq` / `rollDiceResult` key 里。本次把三级的定位键都换成
自增数字 id，名字降级为「显示名」。

具体目标：

1. 三级各建一张表：`sandtable_campaign`（已有，改结构）、`sandtable_place`（新增）、
   `sandtable_scene`（新增），各自以自增 `id` 为主键。
2. Redis key 的三段（campaign / place / scene）全部改用数字 id。
3. 前端三级定位参数从「名字」改成「数字 id」，另引入 `*Name` 变量做显示。

## 方案定稿：过渡方案（前端直接传数字 id，后端直接收数字 id）

这是**开发中间阶段的过渡方案**，不上生产、只做开发辅助页：

- 前端 `sandbox/index.html` 用 **6 个输入框**：campaignId / placeId / sceneId 三个
  数字 id 框 + campaignName / placeName / sceneName 三个名字框，全部由开发人员手填。
- 后端接口**直接收数字 id**，不做 name→id 翻译（比之前「后端翻译」的方案更简单）。
- **数据必存在**：开发人员保证输入的后端里真实存在的 id + 名字，前端不处理
  「不存在」「创建」的场景。
- 终点仍是正式方案二（用户只输名字 → 自动 resolve/create 拿 id），本过渡方案不是终点。

## 命名约定

三级定位统一「`XxxId`（数字，定位）+ `XxxName`（名字，显示）」：

| 层 | 数字 id（定位） | 名字（显示） |
|----|----------------|-------------|
| campaign | `campaignId` | `campaignName` |
| place | `placeId` | `placeName` |
| scene | `sceneId` | `sceneName` |

- 表字段：`id`（主键）、`campaign_name` / `place_name` / `scene_name`（名字）。
- 外键字段：`campaign_id` / `place_id`，存的是**数字 id**（指向父表主键），
  与「名字」无关。注意与 campaign 表「`campaign_id` 已改名 `campaign_name`」区分——
  place/scene 表里的 `campaign_id` 是外键，语义不同。
- 对外 URL 参数：`campaignId` / `placeId` / `sceneId` 现在**直接是数字 id**，
  名字走 `campaignName` / `placeName` / `sceneName` 参数（仅前端显示用，不进 API）。

## 表结构

### `sandtable_campaign`（改结构）

```sql
CREATE TABLE IF NOT EXISTS sandtable_campaign (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_name   TEXT    NOT NULL UNIQUE,
    owner           TEXT    NOT NULL,
    detail_info     TEXT    NOT NULL DEFAULT '',
    curr_place_id   INTEGER,
    curr_scene_id   INTEGER,
    curr_place_name TEXT,
    curr_scene_name TEXT,
    create_time     INTEGER NOT NULL,
    update_time     INTEGER NOT NULL
);
```

- `campaign_name` 是业务键/显示名，`UNIQUE`；`id` 是技术主键，进 Redis key。
- `curr_place_id` / `curr_place_name` / `curr_scene_id` / `curr_scene_name` 现在语义
  落地为「当前 place/scene 的 id + name」，分别对应下面两张新表的 `id` 和名字列。
  本次仍只建列、不读写。

### `sandtable_place`（新增）

```sql
CREATE TABLE IF NOT EXISTS sandtable_place (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    place_name  TEXT    NOT NULL DEFAULT '',
    detail_info TEXT    NOT NULL DEFAULT '',
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL,
    FOREIGN KEY (campaign_id) REFERENCES sandtable_campaign(id)
);
```

### `sandtable_scene`（新增）

```sql
CREATE TABLE IF NOT EXISTS sandtable_scene (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    place_id    INTEGER NOT NULL,
    scene_name  TEXT    NOT NULL DEFAULT '',
    detail_info TEXT    NOT NULL DEFAULT '',
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL,
    FOREIGN KEY (campaign_id) REFERENCES sandtable_campaign(id),
    FOREIGN KEY (place_id)    REFERENCES sandtable_place(id)
);
```

| 决策点 | 默认取值 | 说明 / 可改项 |
|--------|---------|--------------|
| 外键约束 | `FOREIGN KEY ...`（**无 `ON DELETE CASCADE`**） | 引用完整性由 FK 保证；级联删除由程序显式按 scene → place → campaign 顺序执行 |
| 可空性 | `campaign_id` / `place_id` `NOT NULL` | place 必属 campaign、scene 必属 place |
| 唯一性 | 不加（`campaign_name` 保持 `UNIQUE`） | place / scene 名字可跨 campaign 或同 campaign 重名，唯一性由 `id` 承担 |
| `place_name`/`scene_name` | `NOT NULL DEFAULT ''` | 名字可空、可重名，纯显示标签 |
| `scene.campaign_id` | **保留（冗余）** | 可由 `place_id → place.campaign_id` 推导；写入时须保证 `scene.campaign_id == place.campaign_id` |

## Redis key 变化

| 用途 | 旧（名字） | 新（数字 id） |
|------|-----------|--------------|
| 场景 | `scence::<campaign名>::<place名>::<scene名>` | `scence::<campaignId>::<placeId>::<sceneId>` |
| 移动请求 | `moveReq::<campaign名>::<place名>::<scene名>` | `moveReq::<campaignId>::<placeId>::<sceneId>` |
| 骰子结果 | `rollDiceResult::<campaign名>::<place名>::<scene名>` | `rollDiceResult::<campaignId>::<placeId>::<sceneId>` |

三段全是数字 id。`scence` 的拼写错误**保持原样**（Redis key 前缀，与本次无关）。

## 落地前提：本地开发库重建

`CREATE TABLE IF NOT EXISTS` 对已存在的表不生效，且改主键无法用 `ALTER TABLE` 表达。
本机已有 `site-api/data/jade-dungeon.db`，落地时**直接删掉重建**（未上线、无真实数据）。
生产首次部署即新表。`COLUMN_MIGRATIONS` 机制不适用（只支持 `ADD COLUMN`）。

## 后端改动清单

### 1. `db/index.ts`

`SCHEMA` 里新增 `sandtable_place`、`sandtable_scene` 两张表（见上）。三张表的建表
语句保持 `IF NOT EXISTS` 幂等。

### 2. `service/sandtableService.ts`

key 生成三段全 `number`：

```ts
export const genSceneKey = (campaignId: number, placeId: number, sceneId: number): string =>
    `jadedungeon::sandtable::scence::${campaignId}::${placeId}::${sceneId}`;

export const genMoveReqKey = (campaignId: number, placeId: number, sceneId: number): string =>
    `jadedungeon::sandtable::moveReq::${campaignId}::${placeId}::${sceneId}`;
```

`loadScene` / `saveScene` / `loadMoveRequests` / `setMoveRequest` / `delMoveRequest`
三段参数全部改 `number`。

**`getCampaignOwner` 改按数字 id 查**：

```ts
export const getCampaignOwner = async (campaignId: number): Promise<string | null> => {
    const row = await getSqlite().queryOne<{ owner: string }>(
        'SELECT owner FROM sandtable_campaign WHERE id = ?', [campaignId]);
    return row?.owner ?? null;
};
```

**`authorizeSceneWrite` 改成按 id 纯校验（去掉建战役逻辑）**：

```ts
export interface IAuthzResult {
    ok: boolean;
    username?: string;
    msg: string;
}

export const authorizeSceneWrite = async (campaignId: number, token?: string): Promise<IAuthzResult> => {
    const username = await verifyToken(token);
    if (!username) return { ok: false, msg: 'not login' };

    const owner = await getCampaignOwner(campaignId);
    if (owner === null) return { ok: false, msg: 'not found' };   // 数据必存在，不该发生
    if (owner !== username) return { ok: false, msg: 'not owner' };
    return { ok: true, username, msg: 'ok' };
};
```

**不再需要** `getCampaignId`（name→id 翻译）、`INSERT OR IGNORE` 建战役逻辑。
「创建战役/place/scene」是开发人员的线下动作（手动 INSERT 或临时脚本），不在接口里。

### 3. `service/diceService.ts`

`genRollResultKey` / `setRollThreshold` / `getRollRecord` / `saveRollResult` /
`loadRollResults` 的三段 `campaignId` / `placeId` / `sceneId` 全部改 `number`。

### 4. `routes/sandtable/map.ts` 与 `dice.ts`

`readSceneParams` 直接读三个数字 id（URL 参数是字符串，转 number 并校验正整数）：

```ts
const readSceneParams = (data: IRequestData) => {
    const campaignId = Number(data.params.campaignId);
    const placeId = Number(data.params.placeId);
    const sceneId = Number(data.params.sceneId);
    const ok = Number.isInteger(campaignId) && Number.isInteger(placeId) && Number.isInteger(sceneId)
        && campaignId > 0 && placeId > 0 && sceneId > 0;
    return { campaignId, placeId, sceneId, ok };
};
```

各接口：读路径直接 `loadScene(campaignId, placeId, sceneId)` 等；`map-owner` /
`save-map` 用 `getCampaignOwner(campaignId)` / `authorizeSceneWrite(campaignId, ...)`。
不再有任何 name→id 翻译。

## 前端改动清单

| 文件 | 改动 |
|------|------|
| [sandboxLogin.ts](site-page/src/main/ts/sandbox/sandboxLogin.ts) | 选场景页 6 个输入框：campaignId / placeId / sceneId（数字 id）+ campaignName / placeName / sceneName（名字）；`SCENE_KEYS` 扩成 6 个 URL 参数 |
| [sandboxApi.ts](site-page/src/main/ts/sandbox/sandboxApi.ts) | 三级定位参数 `campaignId` / `placeId` / `sceneId` 类型改 `number`（值=数字 id）；名字不进 API 参数 |
| [sandboxView.ts](site-page/src/main/ts/sandbox/sandboxView.ts) / [sandboxEditor.ts](site-page/src/main/ts/sandbox/sandboxEditor.ts) | 标题栏显示改用 `campaignName / placeName / sceneName`；调 `mapOwner` 等用数字 id |
| `sandbox/index.html` / `login.html` / `view.html` / `editor.html` | URL 参数从 3 个名字扩成 6 个（3 数字 id + 3 名字），页面读参同步 |
| 测试 `sandbox.*.test.ts` | 三级定位断言从「名字」改成「数字 id + name 分离」 |

## 边界行为变化

「数据不存在」在过渡方案下不处理（开发人员保证数据存在）。但代码层仍要兜底：

| 接口 | 数据不存在时 |
|------|-------------|
| `load-map` | error `'empty'` |
| `load-move-request` / `get-roll-result` | success + 空数组 |
| `map-owner` | owner 为 null（回 `'not found'` 或 `query success` + null） |
| `save-map` | `'not found'`（`authorizeSceneWrite` 按 id 查不到） |
| `request-move` / `set-roll-threshold` / `roll-dice` | error（`'empty'` 或 `'not found'`） |

这些是兜底，正常开发联调不会触发（数据都手动造好了）。

## 明确不改的事

- **不上生产**：这是开发辅助过渡方案，正式方案二（输入名字自动 resolve/create）另做。
- **`scence` 拼写不动**：Redis key 前缀，与本次无关。
- **权限仍是 campaign 级**：place/scene 表没有 owner 列，写权限跟着 campaign 的 owner。
- **`curr_*` 字段仍只建列不读写**：本次不实现「记录当前位置」逻辑。

## 过渡期造数据

开发人员手动造三级数据，**按 campaign → place → scene 的顺序** INSERT（外键约束要求）：

```sql
INSERT INTO sandtable_campaign (campaign_name, owner, detail_info, create_time, update_time)
    VALUES ('费伦大陆', 'gm', '', 0, 0);                          -- 拿到 campaign id
INSERT INTO sandtable_place (campaign_id, place_name, detail_info, create_time, update_time)
    VALUES (1, '深水城', '', 0, 0);                                -- 拿到 place id
INSERT INTO sandtable_scene (campaign_id, place_id, scene_name, detail_info, create_time, update_time)
    VALUES (1, 1, '港口', '', 0, 0);                               -- campaign_id 与 place.campaign_id 保持一致
```

建议写一个临时脚本 `scripts/seedSandtable.ts`（默认演练 + `--write`），省得每次手写 SQL。

## 文档同步

- `site-api/CLAUDE.md`：`sandtable_campaign` 描述改为三张表 id 主键；`sandtableService.ts`
  段落补「三级定位全数字 id、后端不再翻译、过渡方案直接收 id」。
- `site-api/docs/design-sandbox-campaign-sqlite.md`：状态改「已实施」，decision 反转。
- `docs/campaignid-naming-20261108.md`（根）：从「未来方向」更新为「本次过渡已动前端」。
- `scripts/migrateCampaignOwnerRedisToSqlite.ts`：表结构变了，脚本基本退役，同步字段名或标注废弃。

## 验证清单

1. `npx tsc --noEmit` + `npm run lint` 零告警（`site-api` 下）；`npm run build` 产物正常。
2. 删本地 `data/jade-dungeon.db` 重建，`npm run dev` 起服务，看启动日志建三张表成功。
3. 手动造三级数据（见上），`sandbox/index.html` 填 6 个框联调：save-map → map-owner →
   load-map / load-move-request / 骰子三接口。用 `redis-cli KEYS 'jadedungeon::sandtable::*'`
   确认 key 三段都是数字 id。
4. 前端 `site-page` 沙盘页面回归（6 输入框、标题栏显示三个名字、接口走数字 id）。
