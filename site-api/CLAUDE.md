# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 这个项目是什么

个人网站 / TRPG 沙盘工具的后端服务，Node + Express + TypeScript。

它是 `Jade-TRPG-api`（Node + 纯 JavaScript、无构建）的重写版，
18 个接口于 2026-11-04 全部迁移完成，旧后端随后停用。
**迁移期间修掉的一批缺陷、以及当前代码某些写法的由来，见
[docs/migration-history.md](docs/migration-history.md)**——改动相关代码前值得先看。

配套的其他项目（各自独立仓库）：

| 项目 | 说明 |
|------|------|
| `Jade-Dungeon-page` | 前端页面（原生 JS + Less + Gulp 4，Canvas 2D 沙盘）。端口 8030 |
| `Jade-TRPG-api` | 旧后端，**已停用**，仅作为行为基准保留 |

前端通过 `envs.js` 的 `apiRoot` 指向本服务。该文件被 gitignore，
从 `envs.sample.js` 复制出 `envs-dev.js` 再由 `build-dev.sh` 落地。
样例里 dev 的 `apiRoot` 是 `//localhost:8082`，与本服务实际端口 8089 不一致，
本地联调要自己改 `envs-dev.js` 或用 CLI `--port` 对齐。

## 文档索引

| 文档 | 内容 |
|------|------|
| [docs/migration-history.md](docs/migration-history.md) | 迁移历史与关键修复。**解释了当前代码为何这样写** |
| [docs/todo-next.md](docs/todo-next.md) | 待办事项，按安全 / 正确性 / 功能 / 工程质量分档 |
| [docs/design-auth-sqlite.md](docs/design-auth-sqlite.md) | auth 模块的存储设计与 7 项决策 |
| [docs/design-blog-gallery-sqlite.md](docs/design-blog-gallery-sqlite.md) | blog / gallery 的表结构设计与搬迁过程 |
| [docs/weather-data-sources.md](docs/weather-data-sources.md) | 两个天气供应商的字段可得性与确定缺失的数据 |
| [docs/weather-useage.md](docs/weather-useage.md) | 天气接口的 curl 调用示例 |
| [docs/redis.md](docs/redis.md) | `ioredis` 与 `redis`（node-redis）的选型对比 |

## 部署

手工部署，没有 CI：`tar` 打包 → `scp` 上传 → 服务器解压重启。

打包时要注意：

- **不能覆盖服务器上的 SQLite 数据库文件**（`data/` 目录，含 auth / blog / gallery 数据）
- `config.properties` 不在仓库里（已 gitignore），服务器上那份要保留
- 必须跑完整的 `npm run build`，只跑 `tsc` 会让路径别名失效

### ⚠️ build 脚本故意不走 `node_modules/.bin`

```json
"build": "node node_modules/typescript/bin/tsc && node node_modules/tsc-alias/dist/bin/index.js"
```

写得啰嗦是有原因的。原本是 `tsc && tsc-alias`，依赖 npm 把 `node_modules/.bin`
加进 PATH——而那要求目标文件**有执行位**。生产环境曾因此报错：

```
> tsc && tsc-alias
sh: 1: tsc-alias: Permission denied
```

成因是 `node_modules` 经 `tar`/`scp` 搬运后执行位丢失。
实测复现：`chmod -x` 掉 bin 的目标文件，就会得到一模一样的 `Permission denied`。

用 `node <脚本路径>` 显式调用则**完全不依赖执行位**——
已验证剥掉 `node_modules/.bin` 下全部 10 个执行位后，build 仍然成功、
别名正常改写、产物能跑。

**不要把它改回 `tsc && tsc-alias`**，否则下次部署可能又踩。

> 如果还是遇到 `Permission denied`，根因在部署方式。两种彻底的解法：
> 在服务器上跑 `npm install`（而不是搬运 `node_modules`），
> 或 `npm rebuild` 重建 bin 链接与权限。

## 代码规范

- Node 版本 **v22.22.2**（`.nvmrc` 已指定，每个新 shell 先 `nvm use`）
- 缩进**统一用 tab**。曾出现过 `db/` 目录混入 2 空格缩进的情况，
  2026-11-04 已统一。eslint 目前**没有**缩进规则，查不出偏离（见 todo-next.md 的 4.1）
- 默认交流语言：简体中文

## 常用命令

```bash
# 开发（三者读同一份 config.properties，只有启动日志里的环境名不同）
npm run dev          # APP_ENV=dev
npm run dev:fat      # APP_ENV=fat
npm run dev:prd      # APP_ENV=prd

# TypeScript 编译到 dist/（tsc 编译 + tsc-alias 改写路径别名）
# 两步都用 node 显式调用，不依赖 node_modules/.bin 的执行位，详见「部署」一节
npm run build

# 运行编译后的代码（依赖 build 跑完整，不能只跑 tsc）
npm run start

# Lint 检查
npm run lint

# 类型检查（不产出文件）
npx tsc --noEmit
```

**跑任何命令前先 `nvm use`**：系统默认 Node 是 v10.15.3，本项目要求 v22.22.2。

曾出现过 `node_modules` 损坏的情况（`.bin/` 下全是 0 字节空文件、`typescript` / `tsx` 包缺失），
当时 `tsc` 和 `eslint` 会**静默「成功」退出但什么都没做**，退出码 0 完全不可信。
怀疑工具没真正执行时，先跑 `npx tsc --version`——有版本号输出才说明它在跑。
该问题已于 2026-11-03 修复。

**dev 端口是 8089**（由 `config.properties` 指定），不是 `src/main/ts/config.ts` 里的硬编码默认值 3000。

`npm run lint` 当前是**零问题**（2026-11-03 清理完毕）。新增代码请保持这个状态，
提交前跑一遍确认没引入新的告警。

## 路径别名 `@/`

源码统一用 `@/types`、`@/service/weather` 这类别名导入，`tsconfig.json` 里配置为：

```json
"paths": { "@/*": ["./src/main/ts/*"] }
```

注意这里**没有 `baseUrl`**。TypeScript 5.0 之后 `paths` 不再依赖它，而且 `baseUrl` 在
TS 7.0 会被移除（TS 6.0 起报废弃警告），所以路径直接写成相对 `tsconfig.json` 的 `./src/main/ts/*`。

**关键点：`tsc` 不会改写编译产物里的 `require()`。** 它只在类型检查阶段解析别名，
产物里仍是 `require("@/lib/redis")`，纯 node 无法解析。所以：

| 命令 | 别名如何生效 |
|------|------------|
| `npm run dev` | `tsx` 运行时读 `tsconfig.json` 的 `paths` 自行解析 |
| `npm run build` | 先 `tsc` 编译，再由 `tsc-alias` 把 `dist/` 里的别名改写成相对路径 |
| `npm run start` | 跑的是已改写好的 `dist/`，所以能正常加载 |

**不要把 `build` 脚本改成只有 `tsc`**，否则 `npm run start` 会报
`Cannot find module '@/lib/redis'`（报错指向第一个撞上的别名，实际所有别名都失效）。
也**不要把两步简写成 `tsc && tsc-alias`**——那依赖执行位，生产环境曾因此失败，见「部署」一节。

## 目录结构

TypeScript 源码在 **`src/main/ts/`** 下（2026-11-03 从 `src/` 迁入）：

```
src/main/ts/          ← rootDir，所有 .ts 源码
├── index.ts          → dist/index.js
├── config.ts         → dist/config.js
├── types.ts          → dist/types.js
├── common/           → dist/common/
├── lib/              → dist/lib/
├── middleware/       → dist/middleware/
├── routes/           → dist/routes/
└── service/          → dist/service/
static/               ← 静态文件，不参与编译
dist/                 ← 编译产物，结构扁平
```

因为 `rootDir` 指向 `src/main/ts`，**中间那层 `main/ts` 不会出现在产物里**，
`dist/` 的布局和源码目录一一对应。所以 `"start": "node dist/index.js"` 不受目录调整影响。

静态文件配置 `staticFile: [{ path: "/static", folder: "static" }]` 里的 `folder`
是**相对进程工作目录**（项目根）解析的，不是相对 `__dirname`，所以也不受影响。

## 架构概览

```
请求 → helmet / cors / json / urlencoded / cookie-parser → multer → 静态文件
     → 错误处理中间件 → 自动发现并绑定路由 → handler 处理
```

- **`src/main/ts/index.ts`** — 入口。用 `arg` 解析 CLI 参数（`--host`、`--port`、`--uploadPath`），调用 `initGlobalCfg(args)` 构建全局配置，连接 Redis，创建 Express 实例并调用 `initApp()` 挂载所有中间件和路由，最后监听端口。注册了 `SIGTERM`/`SIGINT` 优雅退出处理器。
- **`src/main/ts/config.ts`** — 全局配置工厂。模块加载时自动执行 `dotenv.config({ path: 'config.properties' })` 读入配置（单文件，不再按环境分文件）。导出 `initGlobalCfg(args)` 函数，合并 CLI 参数、环境变量和硬编码默认值，返回 `IGlobalCfg` 对象（含 server、Redis、静态文件、上传等配置）。
- **`src/main/ts/middleware/simpleHTTPServer.ts`** — Express 应用装配中心。导出 `initApp()` 和 `bindHandler()` 两个函数。`initApp()` 按顺序挂载：`helmet` → `cors` → `json/urlencoded` 解析 → `cookie-parser` → `multer` 上传 → 静态文件绑定 → 全局错误处理 → 自动发现并绑定路由。模块内的 `discoverHandlers()` 负责递归扫描路由目录、展开数组导出、校验与查重。`bindHandler()` 接收 `ICustomHandler[]` 数组，根据 `method` 位掩码分派到 GET/POST 绑定——两个 `if` 独立判断，所以 `HTTP_GET | HTTP_POST` 会同时绑上两个方法（2026-11-03 修复：原先是 `if / else if`，组合掩码时 POST 会被静默丢弃）。
- **`src/main/ts/types.ts`** — 全局类型定义。包含 `IGlobalCfg`（server/redis/path/upload 四段结构）、`IRequestContext`、`IRequestData`、`ICustomHandler`、`IWeatherRec` 以及 `HTTP_GET`/`HTTP_POST` 常量。
- **`src/main/ts/routes/`** — 业务路由 handler。每个文件 export `handler`，可以是单个 `ICustomHandler` 或 `ICustomHandler[]`，由 `simpleHTTPServer.ts` 在启动时递归扫描并自动注册（支持子目录分组）。新增路由只需在此目录下新建文件并 export `handler`，无需修改其他代码。
- **`src/main/ts/service/`** — 服务层。封装第三方 API 调用与业务逻辑，供 routes 调用。当前包含天气数据聚合服务。
- **`src/main/ts/db/`** — SQLite 数据层。`SqlitePool.ts` 是基于 `worker_threads` 的读写分离连接池（8 读 worker + 1 写 worker，读写各自独立连接，WAL 模式）；`worker.ts` 在独立线程里持有 `better-sqlite3` 连接并缓存 prepared statement；`index.ts` 提供连接池单例、建表与启动时清理过期 token。**仅 auth 模块使用**，其他模块仍走 Redis。
- **`src/main/ts/service/blogService.ts`** — 博客与相册。数据存 SQLite。负责分页归一化（`normalizePaging` / `calcPageCount`，旧实现的页数公式 `parseInt((n+1)/pageSize)` 算错了，36 条会算出 3 页）、表字段与响应字段的映射、以及相册写入的事务。内含 `withTransaction` 串行锁——写池只有 1 个 worker 共用连接，并发 `BEGIN` 会撞「cannot start a transaction within a transaction」。
- **`src/main/ts/scripts/`** — 手动执行的脚本，不参与服务启动。`migrateBlogRedisToSqlite.ts` 把 blog/gallery 从 Redis 搬到 SQLite（默认演练，需 `--write`）；`backfillExcerpt.ts` 回填文章摘要（加 `--all` 可重算全部）；`backupBlogData.ts` 备份数据与图片，取代旧后端的 `backup.js`。三个脚本都是**默认演练、需显式 `--write`** 才写数据。
- **`src/main/ts/service/diceService.ts`** — 骰子检定。`parseRollCmd()` 解析 `3d6+3-2` 这类表达式（**先整体校验形状再按符号切分**，旧实现用正则扫描导致运算符丢失）、`rollDice()` 掷骰、以及检定状态的 Redis Hash 读写。`msg` 的输出格式沿用旧实现，前端直接显示它。
- **`src/main/ts/service/sandtableService.ts`** — TRPG 沙盘的数据访问与权限校验。集中管理 `jadedungeon::sandtable::*` 的 key 生成（**`scence` 是拼写错误但保持原样** —— 理由不再是「怕旧后端读不到」，而是 Redis 里已经存着用这个拼写的数据，改名要连带迁移 key）、场景读写、移动请求的 Hash 操作，以及 `authorizeSceneWrite()`——身份从 token 推导而非信客户端传的 username。
- **`src/main/ts/service/authService.ts`** — 认证业务逻辑。scrypt 加盐哈希（`timingSafeEqual` 比较）、token 签发/解析/校验、注册与登录（密码登录 + token 续期两条路径）。token 用 `crypto.randomUUID()` 生成，**不要用 `common/jadeutils.ts` 的 `uuid()`**——后者基于 `Math.random()`，不是密码学安全的随机源。
- **`src/main/ts/lib/redis.ts`** — Redis 多连接管理（基于 `ioredis`）。用 `Map<string, Redis>` 管理多个命名连接（当前为 `trpg`、`blog`、`auth`），每个连接指向 `127.0.0.1:6379`。导出 `initRedis()`、`closeRedis()`、`closeAllRedis()`。连接失败不阻塞服务启动（`lazyConnect: true`），最多重试 3 次。
- **`src/main/ts/common/jadeutils.ts`** — 通用工具函数。当前提供 `uuid()` 生成 UUID v4 格式字符串。
- **`eslint.config.mjs`** — ESLint 配置文件。
- **`static/`** — 静态文件根目录，通过 `/static` 路径映射对外暴露。含 `html/` 和 `image/` 子目录。
- **`doc/redis.md`** — Redis 技术选型文档，详细对比 `ioredis` 与 `redis`（node-redis）的差异及本项目选型理由。

## 路由系统

### 现有路由

| 路由 | 文件 | 方法 | 说明 |
|------|------|------|------|
| `/` | `src/main/ts/routes/index.ts` | GET | 欢迎页，返回 JSON `{ message, version }` |
| `/api/weather/forecast` | `src/main/ts/routes/weather.ts` | GET | 天气预报，支持 `conky`（文本）和 `json` 两种输出格式 |
| `/api/auth/regist` | `src/main/ts/routes/auth.ts` | **POST** | 注册。数据存 SQLite，密码 scrypt 加盐哈希 |
| `/api/auth/login` | `src/main/ts/routes/auth.ts` | **POST** | 登录。支持用户名+密码、或凭 token 续期（续期会签发新 token 并作废旧的） |
| `/api/sandtable/load-map` | `routes/sandtable/map.ts` | GET+POST | 读场景数据 |
| `/api/sandtable/save-map` | `routes/sandtable/map.ts` | **POST** | 写场景。**强制校验 token**，owner 身份从 token 取 |
| `/api/sandtable/map-owner` | `routes/sandtable/map.ts` | GET+POST | 查战役归属 |
| `/api/sandtable/load-move-request` | `routes/sandtable/map.ts` | GET+POST | 读棋子移动请求（Redis Hash） |
| `/api/sandtable/request-move` | `routes/sandtable/map.ts` | GET+POST | 提交移动请求。token **可选**校验（前端未传，详见下） |
| `/api/sandtable/parseImage` | `routes/sandtable/parseImage.ts` | GET+POST | 图片代理，绕开 canvas 跨域限制。已加 SSRF 防护 |
| `/api/sandtable/roll-dice` | `routes/sandtable/dice.ts` | GET+POST | 掷骰。需 GM 先设阈值，且本轮未掷过 |
| `/api/sandtable/set-roll-threshold` | `routes/sandtable/dice.ts` | GET+POST | 设检定阈值。`username` 是**被设定的对象**，不是调用者 |
| `/api/sandtable/get-roll-result` | `routes/sandtable/dice.ts` | GET+POST | 查全场检定结果 |
| `/api/blog/loadByUser` | `routes/blog.ts` | GET+POST | 分页列文章，返回 `excerpt` 摘要，**不含正文** |
| `/api/blog/getArticle` | `routes/blog.ts` | GET+POST | **新增**。按 id 取单篇完整正文 |
| `/api/blog/save` | `routes/blog.ts` | GET+POST | 发文。不校验身份（按决策照搬） |
| `/api/blog/loadUserById` | `routes/blog.ts` | GET+POST | 硬编码假数据（按决策照搬） |
| `/api/blog/loadRecommendArticles` | `routes/blog.ts` | GET+POST | 硬编码假数据（按决策照搬）。**路径与字段名 2026-11-05 改掉了拼写**，见下 |
| `/api/gallery/loadByUser` | `routes/gallery.ts` | GET+POST | 分页列相册，**含图片列表** |
| `/api/gallery/getAlbum` | `routes/gallery.ts` | GET+POST | **新增**。按 id 取单组相册 |
| `/api/gallery/save` | `routes/gallery.ts` | GET+POST | 建相册。相册+图片走事务 |

**blog 列表为何不返回正文**：实测正文平均 34.7 KB、最长 1.3 MB，列表页带着它翻页很慢。
列表改为返回 `excerpt`（200 字纯文本摘要），完整正文走 `getArticle`。
相册则相反——text 很短、图片只是 URL、单组最多 19 张，而前端要显示缩略图，所以列表仍返回 `album`。

### 分页参数：`pageSize` 的下限是 1

`normalizePaging()` 把 `pageSize` 夹在 **1 ~ 65535**。

**下限原来是 10，2026-11-05 改成 1** —— 旧实现照搬了旧后端的下限 10，
结果前端相册页请求的 `pageSize=5` 被静默抬成 10：每页条数和页数都不是前端要的那个
（实测 `u001` 的 32 组相册，要 7 页、实际给 4 页）。
分页本身是自洽的（`pageCount` 按真实 `pageSize` 算，不会出空白页），
所以不报错、只是不听客户端的。上限 65535 留着，备份脚本靠它一次拿完。

### 摘要字段 `excerpt`

`blog_article.excerpt` 存的是**已剥离 Markdown 标记**的纯文本，上限 200 字符（超出加 `…`）。
在**写入时**生成（`saveArticle` 调 `makeExcerpt`），列表查询只读这一列，不碰大字段。

剥离逻辑在 `service/blogService.ts` 的 `makeExcerpt()`，用正则而非 Markdown 解析库——
实测 215 篇存量文章只用到 8 种语法（链接 35%、裸 URL 36%、引用 13%、图片 8%、
列表 6%、标题与粗体各 4%、分隔线与有序列表各 2%），斜体、代码块、HTML 标签、表格完全没出现。

两个处理决策：**图片整条删掉**（alt 文字多是 `![alt 青铜虎尊](url)` 这种标注，不是正文）、
**链接只留显示文字**。

**纯图片文章**（剥离后一个字都不剩、但原文有图片）摘要为 `IMAGE_ONLY_EXCERPT`
即 `（图片）`，实测 215 篇里有 1 篇（id=203，3 张图无文字）。
只有原文本身为空时摘要才是空串——靠剥离前记下的 `hadImage` 标志区分这两种情况。

改了 `makeExcerpt` 的逻辑后，要跑 `scripts/backfillExcerpt.ts --write --all` 重算全部。

**字段名有两套**：表用规范命名（`author` / `created_at` / `descr`），响应 JSON 沿用旧名
（`auth` / `time` / `desc`），映射集中在 `service/blogService.ts`。
图片列表字段 2026-11-05 已从 `ablum` 改正为 `album`，见下。

### 响应字段的拼写错误都改正了（2026-11-05）

旧后端已停用、前端只剩本仓库的 `site-page`，所以不用再「为了两代互通」沿用错拼写：

| 原拼写 | 现在 | 涉及 |
|-------|------|------|
| `loadRecommandArticles` / `recommands` | `loadRecommendArticles` / `recommends` | **URL + 字段名** |
| `ablum`（相册图片列表，`album` 之误） | `album` | 字段名 |

**改回旧拼写才会出错。** 看到 `recommends` / `album` 不要以为是写错了。

**唯一还留着 `ablum` 的地方：`scripts/migrateBlogRedisToSqlite.ts`。**
它读的是 Redis 里的存量旧数据，那边的 key 本来就叫 `ablum` ——
跟后端版本无关，改了一张图都读不到。文件里有注释钉着。

### 还没改的拼写：`scence`

`sandtableService.ts` 的 Redis key 前缀 `jadedungeon::sandtable::scence::*`
（`scene` 之误）**保持原样**。

**它的约束和上面那些不一样** —— 不是「怕旧后端读不到」，
而是 **Redis 里已经存着用这个拼写的场景数据**。改名要连带写迁移脚本遍历改 key，
跟后端升不升级没关系。要改就单独做一次，别顺手动。

**sandtable 的 token 校验策略**：`save-map` 强制校验——前端
`sandtable-editor.js` 早就把 `loginToken` 塞进 `jsonStr` 了（旧后端从没读过），所以不用改前端。
`request-move` 只能可选校验，因为前端那边是 GET 且不带 token，强制会打断功能；
要完全锁死需先改前端。

auth 两个接口**只绑 POST**（旧后端是 GET+POST 双绑）：密码走 GET 会留在 URL、
浏览器历史和访问日志里。已确认前端 `sandtable-index.js` 用的就是 POST。

### Handler 注册模式

路由采用**插件式自动发现**机制，而非 Express Router。
`export const handler` 可以是单个 `ICustomHandler`，**也可以是 `ICustomHandler[]`**。

单个端点：

```ts
// src/main/ts/routes/example.ts
import { ICustomHandler, IRequestContext, IRequestData, HTTP_GET } from '@/types';

export const handler: ICustomHandler = {
    urlPtn: '/api/example/endpoint',  // URL 匹配模式
    method: HTTP_GET,                  // HTTP_GET (1) / HTTP_POST (2) / 两者组合 HTTP_GET | HTTP_POST
    bindFunc: (context: IRequestContext, data: IRequestData) => {
        context.response.json({ code: 0, message: 'ok' });
    }
};
```

同一业务的多个端点放一个文件（2026-11-04 起支持，对应旧后端一个模块多个路由的组织方式）：

```ts
// src/main/ts/routes/sandtable/map.ts
export const handler: ICustomHandler[] = [
    { urlPtn: '/api/sandtable/load-map', method: HTTP_GET | HTTP_POST, bindFunc: ... },
    { urlPtn: '/api/sandtable/save-map', method: HTTP_POST,            bindFunc: ... },
    // ...同一文件内可共用权限校验、场景寻址等辅助函数
];
```

### 自动发现流程

`initApp()` 调用 `discoverHandlers()`，它会：

1. **递归**扫描 `src/main/ts/routes/`（通过 `__dirname/../routes` 解析），支持子目录分组
2. 过滤 `.ts`（开发期）和 `.js`（编译后），排除 `.d.ts`
3. `require` 每个文件，读取 `mod.handler`；是数组就展开，是单个就包成单元素数组
4. 校验每个 handler 含 `urlPtn` / `method` / `bindFunc`，不合法则打 `⚠️` 告警并跳过
5. 按 `method + urlPtn` 查重，重复的打 `⚠️` 告警并跳过——**先发现者生效**，顺序由文件路径字母序决定
6. 统一交给 `bindHandler(app, globalCfg, handlers)` 注册

启动日志会打印每个路由的来源文件，便于定位：

```
🔗 绑定路由: GET /  (index.ts)
🔗 绑定路由: GET,POST /api/sandtable/load-map  (sandtable/map.ts)
⚠️  路由重复: GET /api/x 同时由 a.ts 和 b.ts 注册，后者不会生效
```

**URL 与文件路径无关**，完全由 `urlPtn` 决定。子目录只是代码组织手段。

## 待办事项

迁移过程中发现但有意未处理的问题，汇总在 [docs/todo-next.md](docs/todo-next.md)，
按 P1 安全 / P2 正确性 / P3 功能缺口 / P4 工程质量 四档排列。

动手改相关模块前先看一眼，避免重复排查已知问题。几个优先级最高的：

- `request-move` 与 dice 三个接口的 token 校验是**可选**的，没带 token 就信客户端身份（需改前端才能锁死）
- `blog/save` / `gallery/save` **完全不校验身份**，任何人能以任意身份发文
- `parseImage` 的 SSRF 防护挡不住 DNS rebinding，且响应体无大小上限

## ⚠️ 临时：登录免验证开关 `AUTH_BYPASS`

**本地 `config.properties` 里当前是开着的**（2026-11-05 加，sandtable 联调用）。
开着的时候 `/api/auth/login` **对任意用户名 + 任意密码都返回成功**，
并按该用户名签发一个真 token。看到「怎么随便输都能登进去」不是 bug。

| | |
|---|---|
| 怎么关 | 删掉 `config.properties` 里的 `AUTH_BYPASS=true`（或改成 false）重启 |
| 怎么确认开着 | 启动日志有 `⚠️ 登录免验证已开启`；每次登录也打一条 ⚠️ |
| 生产会不会被带上 | 不会 —— `NODE_ENV=production` 时 `config.ts` 强制关掉，只打一条 🔒 |

三件事值得记住：

- **只影响 `/api/auth/login`。** 注册、token 续期、`verifyToken()` 都没改，
  所以 sandtable 的 `save-map` / `authorizeSceneWrite()` 照常按 token 里的
  用户名判 owner —— 伪造的 token 仍然被拒（实测返回 `not login`）
- **会在 `auth_user` 建占位行，`hash_algo='bypass'`。** 这是被迫的：
  `auth_token.username` 有外键指向 `auth_user`，而
  **better-sqlite3 默认 `foreign_keys = ON`**（和 sqlite3 命令行相反，那边默认 OFF），
  不建行签不出 token，会抛 `FOREIGN KEY constraint failed`。
  占位行的 `password_hash` 是随机字节，且 `loginByPassword()` 对
  `hash_algo='bypass'` **显式拒绝**，所以关掉开关后这些账号登不进来
- **已存在的真实用户不会被动。** `ensureBypassUser()` 先查再插，
  免验证登录一个真用户只会给他签 token，不改他的密码哈希（实测确认）

联调结束后除了关开关，建议顺手清掉占位行：

```bash
sqlite3 data/jade-dungeon.db "
  DELETE FROM auth_token WHERE username IN
    (SELECT username FROM auth_user WHERE hash_algo='bypass');
  DELETE FROM auth_user WHERE hash_algo='bypass';"
```

## ⚠️ 写响应必须用 `sendOnce`（重要）

**凡是手工写 HTTP 响应，一律用 `sendOnce()`，不要裸调 `writeHead` / `end`。**

```ts
import { sendOnce } from '@/middleware/simpleHTTPServer';

sendOnce(context.response, 200, {
	'Content-Type': 'application/json;charset=utf-8',
	...corsHeadersFor(context.globalCfg, context.request),
}, JSON.stringify(body));
```

### 为什么

重复写出响应会**终止进程**。旧后端在生产环境就这么崩过一次：

```
Error [ERR_HTTP_HEADERS_SENT]: Cannot write headers after they are sent to the client
    at ServerResponse.writeHead (node:_http_server:354:11)
    at IncomingMessage.<anonymous> (.../sandtable/map.js:132:24)
```

Node v22 实测的三种后果：

| 操作 | 后果 |
|------|------|
| 重复 `writeHead` | **同步抛 `ERR_HTTP_HEADERS_SENT`** |
| 重复 `end()` 不带数据 | 无错，静默忽略 |
| 重复 `end(data)` 带数据 | 发出 `ERR_STREAM_WRITE_AFTER_END` → **本应用没有兜底，升级为未捕获异常、进程终止** |

第三种尤其阴险：不会在当场同步抛错，看代码也察觉不到，只在特定时序下炸。

### 什么时候会撞上

只要一个请求有**两条以上可能写响应的路径**，就有竞态：

- **超时 + 正常返回**：超时分支已响应，慢回来的正常分支又响应一次 ← 旧后端就是这么崩的
- 流的 `end` 与 `error` 事件都触发
- `catch` 块响应后，`finally` 或外层又响应
- 多个异步回调各自响应

直线流程（取数 → 响应）不会撞上，但**用 `sendOnce` 没有代价**，统一用它不必每次判断。

### 守卫的两个标志

`sendOnce` 同时检查：

- `writableEnded` —— `end()` 是否已调用
- `headersSent` —— 头是否已发出（头发出但未 end 时仍可继续写 body）

只查 `headersSent` 是不够的——这正是迁移时 `parseImage` 残留的隐患：
`writeHead` 守住了但 `end(body)` 是裸的，照样会触发 `ERR_STREAM_WRITE_AFTER_END`。

### 现状：无例外

全应用的响应点**都已走 `sendOnce`**，没有例外。
`grep -rn "response\.end" src/main/ts/` 应当只命中 `sendOnce` 自身的实现（两行）——
如果命中了别的地方，说明有人绕过了守卫，要改回来。

这条可以直接当检查项用：

```bash
# 期望只有 2 行命中（sendOnce 的实现）
grep -rn "response\.end" src/main/ts/
```

### 请求生命周期

```
请求 → Express 中间件链 → bindHttpGet/bindHttpPost 构造 IRequestContext + IRequestData
     → handler.bindFunc(context, data)
     → 若 handler 未发送响应头，自动写 200 JSON + CORS 头
     → response.end()
```

## 类型系统

| 类型 | 位置 | 说明 |
|------|------|------|
| `IGlobalCfg` | `src/main/ts/types.ts` | 全局配置接口，所有字段 `readonly`：`{ server, redis?, path, upload? }` |
| `IRequestContext` | `src/main/ts/types.ts` | 传给每个 handler 的上下文：`{ globalCfg, application, request, response }` |
| `IRequestData` | `src/main/ts/types.ts` | 传给 handler 的数据载荷：`{ params: Record<string, string \| undefined>, cookies, files: IUploadedFile[] }`（2026-11-03 从 `any` 改为具体结构） |
| `ICustomHandler` | `src/main/ts/types.ts` | handler 定义：`{ urlPtn, method, bindFunc }` |
| `IWeatherRec` | `src/main/ts/types.ts` | 单日天气预报记录（location/date/weatherCode/temp/wind 等 18 个字段） |
| `HTTP_GET` / `HTTP_POST` | `src/main/ts/types.ts` | 位掩码常量（`1` / `2`），用于 `ICustomHandler.method` |

## 服务层

### 天气服务（`src/main/ts/service/`）

天气数据由两个第三方 API 聚合而成：

| 文件 | 职责 |
|------|------|
| `weather.ts` | 聚合入口。`getWeatherForecast()` 同时调用 WeatherAPI 和 OpenWeatherMap，合并结果后输出 `conky` 文本或 JSON |
| `weatherapi.ts` | WeatherAPI.com 客户端。获取 5 天预报（含当天），输出格式化文本 |
| `openweathermap.ts` | OpenWeatherMap 客户端。获取 5 天/3 小时预报，按天聚合，提供风向风速数据（带内存缓存，60 分钟过期） |
| `weatherTypes.ts` | 天气类型定义。含风向码表（`windDirtCodeMap`，16 方向 → 图标字符）、天气码表（`weatherCodeMap`，位掩码编码，每种天气对应 day/night 图标字符）、`IForecastDayRec` 接口 |

**天气码编码规则**：采用 16 位位掩码，每位代表一种天气现象，可组合表示复合天气（如"雷区有中或大雨" = `0b1000000010000000`）。

## 环境变量

配置是**单文件**的：只有 `config.properties` 一份（2026-11-04 从 `.env` 系列改名并合并，
原先的 `config.{dev,fat,prd}.properties` 已取消）。
不用 dotenv 默认的 `.env` 命名，是为了避免隐藏文件在文件管理器和 IDE 里被忽略。

| 文件 | git | 用途 |
|------|-----|------|
| `config.properties` | 已忽略 | 实际生效的配置，本地自行维护 |
| `config.sample.properties` | 已提交 | 模板。新环境把它复制成 `config.properties` 再改 |

路径相对**进程工作目录**解析，所以必须从项目根启动——`cd` 进子目录再跑会读不到配置，
会静默退回代码里的默认值（端口 3000）。

### 变量清单

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 监听端口。配置文件里是 8089 |
| `NODE_ENV` | `development` | 为 `development` 时错误响应带异常细节，否则只返回通用提示 |
| `REDIS_HOST` | `127.0.0.1` | Redis 地址，应用于全部三个命名连接 |
| `REDIS_PORT` | `6379` | Redis 端口，应用于全部三个命名连接 |
| `REDIS_NAME` | `jade-dungeon` | 连接标签，见下 |

另外两个变量不在配置文件里，但代码会读：`HOST`、`UPLOAD_PATH`（都可用 CLI 参数覆盖）。

**`REDIS_NAME` 是连接标签，不是 key 前缀。** 它作为 ioredis 的 `connectionName`，
实际连接名是 `<REDIS_NAME>:trpg` 这种形式，用于在 Redis 的 `CLIENT LIST` 里识别
是哪个服务、哪个环境连进来的。实测效果：

```
✅ Redis 已连接: 127.0.0.1:6379 (trpg as jade-dungeon-dev:trpg)
# Redis 侧 CLIENT LIST 可见：jade-dungeon-dev:trpg / :blog / :auth
```

它**不参与 Redis key 的拼接**，所以改它不影响数据读写
（key 一律是 `jadedungeon::<模块>::...` 前缀）。
如果将来想用它做环境隔离，要清楚那会让新旧两套环境看不到彼此的存量数据 ——
**约束来自 Redis 里已有的数据，不是来自已停用的旧后端。**

### `APP_ENV` 目前只影响日志

`APP_ENV` 由 npm scripts 注入（`dev` / `dev:fat` / `dev:prd` 分别注入 `dev` / `fat` / `prd`），
但配置合并成单文件后，**它只用在启动日志的那行 `🌍 当前环境: xxx`**，不再切换任何配置。

所以 `npm run dev`、`npm run dev:fat`、`npm run dev:prd` 三者读的是**同一份配置**，
行为完全一致，只有日志里打印的环境名不同。看到 `当前环境: prd` 不代表用的是生产配置。

`config.ts:13` 留着一行注释掉的按环境加载代码，将来要恢复多环境配置时取消注释即可。

### 优先级

CLI 参数（`--port` / `--host` / `--uploadPath`）> 配置文件 > 代码里的硬编码默认值。

### SQLite 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SQLITE_PATH` | `data/jade-dungeon.db` | 数据库文件。相对进程工作目录解析，目录不存在会自动创建 |
| `SQLITE_READ_POOL_SIZE` | `8` | 读取 worker 数量 |

**哪些模块用 SQLite**（2026-11-04 起）：

| 模块 | 存储 | 表 |
|------|------|-----|
| auth | SQLite | `auth_user`、`auth_token` |
| blog | SQLite | `blog_article` |
| gallery | SQLite | `gallery_album`、`gallery_photo` |
| sandtable | **Redis** | `jadedungeon::sandtable::*` |

sandtable 留在 Redis 是有意的——场景数据是整块 JSON，key-value 形态更合适。

### ⚠️ 改表结构要走 `COLUMN_MIGRATIONS`

`db/index.ts` 的 `SCHEMA` 用的是 `CREATE TABLE IF NOT EXISTS`，
它对**已经存在**的表完全不生效。所以往 `SCHEMA` 里加一个字段，
对已有数据的数据库是没用的——新字段不会出现。

加字段要两步做：

1. 在 `SCHEMA` 里加上该字段（新建的数据库直接就有）
2. 在 `COLUMN_MIGRATIONS` 数组里加一条 `ALTER TABLE` （已有的数据库补列）

启动时 `applyColumnMigrations()` 会查 `PRAGMA table_info` 判断列是否存在，
不存在才执行 ALTER——因为 SQLite 的 `ADD COLUMN` 不支持 `IF NOT EXISTS`。

`excerpt` 字段就是这样加的，可以照着写。

与 Redis 的容错策略不同：Redis 连不上只打警告、服务继续；
**SQLite 初始化失败会 `process.exit(1)`**，因为 auth 是其他模块的权限前提。

### Redis 配置

`initGlobalCfg()` 注册三个命名连接，地址与端口都取自 `config.properties`
（2026-11-04 前是硬编码的）：

| Key | 用途 | connectionName |
|-----|------|---------------|
| `trpg` | TRPG 业务数据 | `<REDIS_NAME>:trpg` |
| `blog` | 博客数据 | `<REDIS_NAME>:blog` |
| `auth` | 认证数据 | `<REDIS_NAME>:auth` |

三者**共用同一个 Redis 实例**，靠 key 前缀（`jadedungeon::<模块>::...`）隔离数据，
所以 `REDIS_HOST` / `REDIS_PORT` 只需配一组。

连接失败不阻塞服务启动（`lib/redis.ts` 里 catch 住了），只打 `⚠️` 告警。
这是有意的——Redis 挂了时不依赖它的接口（如天气）仍能提供服务。

## Node 版本

项目 `.nvmrc` 指定 **Node.js 22.22.2**。使用 `nvm use` 切换。

## 关键依赖

| 包 | 版本 | 用途 |
|----|------|------|
| `express` | ^4.21 | Web 框架 |
| `ioredis` | ^5.11 | Redis 客户端（多连接管理） |
| `dotenv` | ^16.4 | 环境变量加载 |
| `helmet` | ^8.0 | 安全头 |
| `cors` | ^2.8 | CORS 中间件 |
| `multer` | ^2.1 | 文件上传 |
| `arg` | ^5.0 | CLI 参数解析 |
| `lodash` | ^4.18 | 通用工具库 |
| `tsx` | ^4.19 | TypeScript 开发期执行引擎（watch 模式） |
| `typescript` | ^5.7 | TypeScript 编译器 |
| `eslint` | ^10.4 | 代码 Lint |
