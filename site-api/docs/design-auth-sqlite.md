# Auth 数据从 Redis 迁到 SQLite —— 实施计划

状态：**✅ 已实施完成**（2026-11-04）
拟定日期：2026-11-04

## 实施结果速览

7 项决策的最终选择与落地情况：

| # | 事项 | 决策 | 落地 |
|---|------|------|------|
| 1 | 驱动 | `better-sqlite3` | 配合已有的 `SqlitePool`（8 读 + 1 写 worker） |
| 2 | 密码哈希 | 加盐 scrypt | `crypto.scrypt`，64 字节哈希 + 16 字节盐，`timingSafeEqual` 比较 |
| 3 | 旧数据搬迁 | 那 5 个是测试账号，不搬 | 跳过搬迁脚本；`hash_algo='plain'` 兼容分支仍保留但当前无数据命中 |
| 4 | 并行期 | 无所谓 | 未做特殊处理，两边数据各自独立 |
| 5 | 会话模型 | 多会话 | `auth_token` 表不设 `UNIQUE(username)`，一个用户可有多个有效 token |
| 6 | token 续期 | 修好 | 修复旧实现的两个缺陷，并改为签发新 token 真正延长有效期 |
| 7 | HTTP 方法 | 收紧为仅 POST | `method: HTTP_POST`；已确认前端用的就是 POST，不会断 |

新增文件：

| 文件 | 职责 |
|------|------|
| `src/main/ts/db/index.ts` | 连接池单例、建表、启动时清理过期 token |
| `src/main/ts/service/authService.ts` | 密码哈希、token 签发/解析/校验、注册与登录逻辑 |
| `src/main/ts/routes/auth.ts` | 两个 POST 端点，数组导出形式 |

配置新增 `SQLITE_PATH`（默认 `data/jade-dungeon.db`）与 `SQLITE_READ_POOL_SIZE`（默认 8）。
`.gitignore` 已排除 `data/`、`*.db`、`*.db-wal`、`*.db-shm`、`*.sqlite`。

下面是实施前的调研与设计，保留备查。

## 一、为什么这个改动成本可控

调研后确认 auth 的存储是**孤立的**，这让迁移范围比预想的小很多。

### auth 数据没有其他模块读取

全仓库搜索 `jadedungeon::auth::` 和 `connect('auth')`，命中全部落在 `auth/login.js` 自己身上。
`blog`、`gallery`、`sandtable` 都不读 auth 的 key。

### sandtable 的权限校验根本没验 token

`Jade-TRPG-api/javascript/sandtable/map.js:252` 的 owner 判断是这样的：

```javascript
let json = JSON.parse(data.params.jsonStr);   // 客户端传来的 JSON
if (owner == json.username) { /* 允许写入 */ }
```

身份来自**客户端自己声明的 `username`**，既不校验 token、也不查 auth 存储。
所以 auth 换存储不会影响 sandtable 的现有行为。

> ⚠️ 这同时意味着 sandtable 的 owner 校验可被任意绕过——客户端改个 username 就能冒充他人。
> 这是旧系统的既有漏洞，不在本次计划范围内，但建议记一笔待办。

**结论**：auth 迁 SQLite 是单模块改造，不牵动其他业务。

## 二、必须先接受的一个后果

迁移后 **auth 数据不再与旧后端共享**。

此前的迁移原则是「两代后端读写同一个 Redis，数据格式必须兼容」。
auth 改用 SQLite 后这条对 auth 不再成立：

| 场景 | 结果 |
|------|------|
| 在旧后端（8038/8088）注册的账号 | 新后端查不到，需重新注册或做数据迁移 |
| 在旧后端登录拿到的 token | 新后端不认 |
| 在新后端注册的账号 | 旧后端查不到 |

如果迁移期间两代后端要并行提供服务，这会造成用户可见的割裂。
第六节给出了数据搬迁方案，但**单向搬迁无法解决双写并行**的问题。

需要确认：迁移期间旧后端的 auth 还要继续用吗？

## 三、驱动选型

两个候选，都不需要外部服务进程。

| | `node:sqlite`（内置） | `better-sqlite3`（npm） |
|---|---|---|
| 依赖 | 零，Node 22.5+ 自带 | 需 npm 安装 + 原生编译（node-gyp） |
| 实测可用性 | ✅ 本机 v22.22.2 已验证可读写 | 未测 |
| 稳定性 | ⚠️ 标记为 experimental，启动有 `ExperimentalWarning`，API 可能变 | 成熟，社区广泛使用多年 |
| 部署 | 跟着 Node 走，`tar`+`scp` 无额外负担 | 服务器需有编译工具链，或用预编译包 |
| API 风格 | 同步，`DatabaseSync` / `StatementSync` | 同步，API 更丰富 |

实测结果（本机 v22.22.2）：

```
✅ 可用，导出: DatabaseSync, StatementSync, constants, backup
读写测试: { a: 'hello' }
(node:xxxx) ExperimentalWarning: SQLite is an experimental feature and might change at any time
```

**倾向 `node:sqlite`**：这个项目部署方式是 `tar` 打包 + `scp` 上传，服务器上不跑 `npm install`，
原生编译的依赖会增加部署失败的风险。实验性警告可以用 `--no-warnings=ExperimentalWarning` 抑制，
且本次用到的只是最基础的 CRUD，API 变动风险有限。

但这是需要您拍板的取舍：**零部署负担 vs 稳定的 API 承诺**。

## 四、现有实现的问题（迁移时必须决定怎么处理）

读 `Jade-TRPG-api/javascript/auth/login.js` 时发现几处问题。换存储是顺手修掉它们的好时机，
但每一项都是行为变更，需要确认。

### 4.1 密码明文存储（严重）

```javascript
// 注册：直接把密码存进去
conn.set(genUserInfoRrdsKey(username), password);
// 登录：直接字符串比对
if (res.data == password) { /* 登录成功 */ }
```

密码以明文形式存储，泄露即全量失守。换 SQLite 时应改为**加盐哈希**。

Node 内置 `crypto.scrypt` 即可，无需额外依赖。建议存 `password_hash` + `salt` 两列。

兼容老数据的办法：建一列 `hash_algo`，旧数据标记为 `plain`，
用户下次成功登录时用明文校验通过后立即改写为哈希（渐进式升级）。

### 4.2 token 续期分支是坏的

```javascript
} else if (tokenObj.username && tokenObj.expire) {
    let value = await rdsUtil.connectV4('auth').call((conn) => {
        return conn.get(genUserTokenRrdsKey(username));   // ← username 在此分支未定义
    });
    if (value && value == token) {                        // ← value 是 {isSuccess,data,err} 包装对象
```

两处缺陷叠加：

1. `username` 在这个分支里是 `undefined`（该用 `tokenObj.username`），所以查的 key 是 `...userAuth::undefined`
2. `value` 是包装对象而非字符串，`value == token` 永不成立

结果：**凭 token 续期登录从来没成功过**，一律返回 `login expire`。

此外即便修好这两点，续期逻辑本身也无效——它把**原样的旧 token**重新存一遍，
而有效期是编码在 token 字符串里的，所以并没有延长。

### 4.3 单 token 设计

`jadedungeon::auth::userAuth::<username>` 一个用户只存一个 token，
在新设备登录会挤掉旧设备。SQLite 下可以轻松支持多会话（token 单独建表）。
是否要改成多会话需要确认——这会改变用户可感知的行为。

### 4.4 调试代码残留

`Jade-TRPG-api/javascript/auth/login.js:111~113` 往响应里塞了三个测试 cookie：

```javascript
context.response.cookie("test01", "value01k", {...});
context.response.cookie("test02", "value02k");
context.response.cookie("test03", "value03k");
```

迁移时直接去掉。

### 4.5 token 过期后无清理

Redis 版没给 token key 设 TTL，过期 token 永久驻留。
SQLite 版需要考虑清理策略（启动时清一次 + 定期清理，或查询时过滤）。

## 五、表结构设计（草案）

```sql
-- 用户表
CREATE TABLE IF NOT EXISTS auth_user (
    username      TEXT    PRIMARY KEY,
    password_hash TEXT    NOT NULL,
    salt          TEXT    NOT NULL,
    hash_algo     TEXT    NOT NULL DEFAULT 'scrypt',  -- 'plain' 表示从旧数据搬来的未升级明文
    created_at    INTEGER NOT NULL,                   -- epoch ms
    updated_at    INTEGER NOT NULL
);

-- token 表（支持多会话；若决定保持单会话，加 UNIQUE(username)）
CREATE TABLE IF NOT EXISTS auth_token (
    token      TEXT    PRIMARY KEY,                   -- 完整 token 字符串
    username   TEXT    NOT NULL,
    expire_at  INTEGER NOT NULL,                      -- epoch ms
    created_at INTEGER NOT NULL,
    FOREIGN KEY (username) REFERENCES auth_user(username) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_token_username ON auth_token(username);
CREATE INDEX IF NOT EXISTS idx_token_expire   ON auth_token(expire_at);
```

**token 格式保持不变**（`username|uuid|expire`），前端
`Jade-Dungeon-page/src/scripts/sandtable-index.js` 把它存进 cookie 后原样回传，
改格式会导致存量 cookie 失效。

## 六、Redis 存量数据搬迁

旧数据形态：

```
jadedungeon::auth::userInfo::<username>  → 明文密码
jadedungeon::auth::userAuth::<username>  → token 字符串
```

搬迁脚本的做法：

1. `SCAN` 匹配 `jadedungeon::auth::userInfo::*`，取出用户名与密码
2. 插入 `auth_user`，`hash_algo` 标为 `plain`、`password_hash` 填原明文、`salt` 留空
3. `SCAN` 匹配 `jadedungeon::auth::userAuth::*`，解析 token 的 expire 段，插入 `auth_token`
4. 已过期的 token 直接丢弃
5. **不删除 Redis 原数据**，保留以便回滚

> **实施结果：这个脚本最终没有写。** 决策 3 确认那 5 个是测试账号，
> 直接在新库重新注册即可，省掉了整套搬迁逻辑。
> `hash_algo='plain'` 的兼容分支代码仍保留在 `service/authService.ts` 里，
> 但当前没有数据会走到它。

### 存量数据实测（2026-11-04）

```
jadedungeon::auth::userInfo::*  → 5 个 key
jadedungeon::auth::userAuth::*  → 5 个 key
jadedungeon::*                  → 23 个 key（含 blog / sandtable 等其他模块）
```

**确实有 5 个账号的存量数据**，不是空库。所以第九节的决策 3 变成：
这 5 个是真实在用的账号，还是开发期的测试账号？

- 若是测试账号 → 跳过搬迁脚本，直接在新库重新注册，省掉整套脚本和 `plain` 兼容逻辑
- 若有真实账号 → 需要搬迁脚本 + `hash_algo='plain'` 的渐进式升级机制

这个差别影响不小：跳过搬迁能省掉第 4.1 节的兼容设计和第七节的步骤 6。

> 注：这些 key 的 value 是明文密码，排查时不要打印出来。

## 七、实施步骤

| 步骤 | 内容 | 产出 |
|------|------|------|
| 1 | 定下第九节的各项决策 | — |
| 2 | 加 `lib/sqlite.ts`：建库、建表、连接管理、优雅关闭 | 数据层基础设施 |
| 3 | 加 `config.properties` 的 `SQLITE_PATH` 配置项 | 数据库文件位置可配 |
| 4 | 加 `service/authService.ts`：注册、登录、token 签发/校验/续期，含密码哈希 | 业务逻辑 |
| 5 | 加 `routes/auth.ts`：两个端点，数组导出形式 | HTTP 层 |
| 6 | 写搬迁脚本（若第六节确认需要） | 数据搬迁 |
| 7 | 交叉验证：与旧后端同参数对比响应结构 | 验证 |

### 配套要改的地方

- `.gitignore` 加 `*.db` / `*.sqlite`（数据库文件不入库）
- `config.sample.properties` 加 `SQLITE_PATH` 并注释说明
- 部署脚本要注意：`tar` 打包时**不能覆盖服务器上的数据库文件**
- `CLAUDE.md` 的「Redis 数据层」一节要说明 auth 已不走 Redis

## 八、验证方案

本项目没有测试框架，依然靠手工验证。至少覆盖：

| 场景 | 预期 |
|------|------|
| 注册新用户 | 成功，SQLite 里出现记录，密码是哈希值不是明文 |
| 重复注册同名 | `username exists` |
| 正确密码登录 | 返回 token，`auth_token` 新增一行 |
| 错误密码登录 | `username or password err` |
| 缺少参数 | `miss username or password` |
| 凭有效 token 登录 | 成功（**这是旧版坏掉的分支，修复后应可用**） |
| 凭过期 token 登录 | `login expire` |
| 凭伪造 token 登录 | `login expire` |
| 搬迁来的 plain 账号首次登录 | 成功，且记录被升级为 scrypt 哈希 |
| 服务重启后 | 数据仍在（验证持久化路径正确） |

另外要确认响应 JSON 的字段名与旧版完全一致（`status` / `msg` / `username` / `token`），
否则前端 `userLogin()` 的回调会取不到值。

## 九、需要您决策的事项

| # | 事项 | 选项 |
|---|------|------|
| 1 | **驱动** | `node:sqlite`（零依赖，实验性）/ `better-sqlite3`（成熟，需编译） |
| 2 | **密码哈希** | 改为 scrypt 加盐（推荐）/ 保持明文（不推荐，但与旧版一致） |
| 3 | **旧数据搬迁** | Redis 里实测有 **5 个账号**。是真实账号（需搬迁脚本 + plain 兼容）还是测试账号（直接重新注册）？ |
| 4 | **并行期** | 迁移期间旧后端 auth 是否停用？（不停用则两边数据割裂） |
| 5 | **会话模型** | 保持单 token（新登录挤掉旧的）/ 改为多会话 |
| 6 | **token 续期** | 修复并支持续期（签发新 token 延长有效期）/ 维持现状（只能用密码登录） |
| 7 | **HTTP 方法** | 沿用 GET+POST 双绑 / 收紧为仅 POST（密码走 GET 会留在 URL 和访问日志里，建议收紧） |

第 2、7 项涉及安全，人家建议都改；但两者都会偏离「与旧后端行为一致」的迁移原则，所以请您定。

## 十一、实施说明（与计划的差异）

### token 的随机源换了

计划里没提到这点，实施时发现的问题：`common/jadeutils.ts` 的 `uuid()` 基于
`Math.random()`，**不是密码学安全的随机源**，用它生成 token 会让 token 可预测。

所以 `authService.ts` 用 `crypto.randomUUID()` 而非项目自带的 `uuid()`。
两者输出都是 36 字符带横线的格式，token 格式 `username|uuid|expire` 不变，前端不受影响。

> 项目里其他地方（如 sandtable 的 ID 生成）仍在用 `jadeutils.uuid()`。
> 那些场景对可预测性不敏感，没有一并改动。

### token 续期改为一次性

计划只说「修好续期」，实施时补了一条：**旧 token 在续期后立即失效**。

理由是如果旧 token 续期后仍有效，同一个 token 可以被无限期反复续期，
等于 100 天的有效期形同虚设。现在的行为是签发新 token 并删除旧的。

### 多语句事务未使用

计划第五节提到「注册用户 + 签发 token 需同时成功」可以用 `exec('BEGIN;...;COMMIT;')`。
实施时发现这两件事并不在同一个请求里——注册只插用户，登录才签发 token，
所以没有跨表原子性的需求，单语句足够。

### SQLite 初始化失败会终止启动

与 Redis 不同（连不上只打警告、服务继续），SQLite 初始化失败会 `process.exit(1)`。
因为 auth 是其他模块的权限前提，没有它服务起来也没意义。

### 启动时清理过期 token

计划第 4.5 节提到需要清理策略。实施为：启动时 `DELETE FROM auth_token WHERE expire_at < now`，
日常查询则一律带 `expire_at > now` 条件过滤。没有加定时任务——
个人站点重启频率足够，不值得引入定时器。

## 十二、验证记录（2026-11-04）

开发模式与编译产物两种运行方式下，11 个场景全部通过：

```
① 注册新用户          → {"status":"success","msg":"regist success","username":"..."}
② 重复注册同名        → {"status":"err","msg":"username exists"}
③ 缺参数注册          → {"status":"err","msg":"miss username or password"}
④ 正确密码登录        → success，token 格式 username|uuid|expire
⑤ 错误密码登录        → {"status":"err","msg":"username or password err"}
⑥ 凭有效 token 续期   → success，且返回的是**新** token（旧后端此分支从来没成功过）
⑦ 用已续期的旧 token  → {"status":"err","msg":"login expire"}（一次性生效）
⑧ 伪造 token          → login expire
⑨ 过期 token          → login expire
⑩ GET 方法            → HTTP 404（已收紧为仅 POST）
⑪ 多会话              → 同一用户连登 3 次全部 success，auth_token 表 4 行
```

数据库内容核查：

```
auth_user: [{"username":"...","hash_algo":"scrypt","hl":128,"sl":32}]
密码是明文吗: ✅ 不是明文（已哈希）
```

`hl=128` 是 64 字节哈希的十六进制长度，`sl=32` 是 16 字节盐的十六进制长度。

前端兼容性已确认：`sandtable-index.js` 的 `$.ajax` 用的是 `type: 'POST'`，
且读取 `data.username` / `data.token`，与新实现的响应字段一致，无需改动前端。

## 十三、本计划不包含的内容

- sandtable 的 owner 校验漏洞（客户端可伪造 username）——独立问题，建议另立任务
- blog / gallery / sandtable 的数据仍留在 Redis，不在本次范围
- 前端改造：token 格式不变，前端无需改动
