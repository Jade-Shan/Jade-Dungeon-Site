# 迁移历史与关键修复

本项目是 `Jade-TRPG-api`（Node + 纯 JavaScript，无构建）的 TypeScript 重写版。
18 个接口于 2026-11-04 全部迁移完成，旧后端随后停用。

本文记录**迁移期间发现并修复的缺陷**，以及**当前代码为何这样写**。
这些内容原先散落在上级目录的迁移报告里，项目独立成仓后汇总到这里。

> 相关设计文档：
> [auth 迁 SQLite](design-auth-sqlite.md)、
> [blog/gallery 迁 SQLite](design-blog-gallery-sqlite.md)、
> [待办事项](todo-next.md)

---

## 一、从旧实现继承的缺陷（已修复）

这些都是旧后端**实际存在的 bug**，不是迁移引入的。列在这里是为了说明
当前代码某些写法的由来——改动它们之前请先看清原因。

### 1.1 位掩码组合失效：`HTTP_GET | HTTP_POST` 只绑 GET

框架的 `bindHandler()` 原先用 `if / else if`：

```typescript
if (HTTP_GET === (handler.method & HTTP_GET)) { bindHttpGet(...); }
else if (HTTP_POST === (handler.method & HTTP_POST)) { bindHttpPost(...); }
//  ↑ else 导致组合掩码时 POST 被静默丢弃
```

旧后端 18 个接口**全部**是 GET+POST 双绑（handler 写成普通函数时框架默认
`method = 1 | 2`），所以这个缺陷影响每一个待迁移接口。

**修复**：拆成两个独立 `if`。现在 `method: HTTP_GET | HTTP_POST` 会正确绑定两个方法。

### 1.2 HTTP 响应重复写出会终止进程

旧后端在生产环境抛过：

```
Error [ERR_HTTP_HEADERS_SENT]: Cannot write headers after they are sent to the client
    at ServerResponse.writeHead (node:_http_server:354:11)
    at IncomingMessage.<anonymous> (.../sandtable/map.js:132:24)
    at endReadableNT (node:internal/streams/readable:1698:12)
```

成因：`map.js` 的 parseImage 里，三个错误分支都写了
`if (!context.response.headersSent)`，**唯独成功分支漏了**。
15 秒超时先写了 504 并 `end()`，之后上游图片的 `end` 事件才到达，于是第二次
`writeHead` 抛错。栈里的 `endReadableNT` 正是「上游响应流结束」这个时机。

Node v22 实测的三种后果：

| 操作 | 后果 |
|------|------|
| 重复 `writeHead` | **同步抛 `ERR_HTTP_HEADERS_SENT`** |
| 重复 `end()` 不带数据 | 无错，静默忽略 |
| 重复 `end(data)` 带数据 | 发出 `ERR_STREAM_WRITE_AFTER_END`；本项目没有 `uncaughtException` 兜底，**会升级成未捕获异常、终止进程** |

**修复**：统一走 `sendOnce()`，同时检查 `writableEnded` 和 `headersSent`。
详见 CLAUDE.md 的「写响应必须用 `sendOnce`」一节——**这是本项目最重要的一条约定**。

### 1.3 sandtable 的 owner 校验可被任意绕过

```javascript
// 旧 map.js:244-252
let json = JSON.parse(data.params.jsonStr);   // 客户端传来的 JSON
if (owner == json.username) { /* 允许覆盖整张地图 */ }
```

身份完全来自**客户端自己声明的 `username`**，不校验 token、不查 auth 存储。
改一个字段就能冒充任意用户覆盖他人地图。

**修复**：`save-map` 改为从 token 推导身份（`service/sandtableService.ts` 的
`authorizeSceneWrite()`）。关键发现是**前端早就在传 token**——
`sandtable-editor.js` 把 `loginToken` 塞进了 `jsonStr`，但旧后端从没读过它
（全仓库 grep 零命中），所以修这个漏洞不需要改前端。

> 同类问题中 `request-move` 和 dice 三个接口仍是**可选校验**，
> 因为前端那几个调用是 GET 且不带 token。详见 [todo-next.md](todo-next.md) 的 1.1。

### 1.4 掷骰逻辑的三个缺陷

实测旧 `rollDice()`：

| 输入 | 旧行为 | 问题 |
|------|--------|------|
| `1d6` / `1d20` | **NaN**（20 次全中） | `/^1?d\d+$/` 同时匹配 `d6` 和 `1d6`，但 `s.substring(1)` 对 `"1d6"` 得到 `"d6"` 而非 `"6"`，`Math.random() * "d6"` → NaN |
| `3d6-2` | 算成 `3d6+2` | 用 `match(/(\d*d)?\d+/gi)` 扫描，**运算符根本没进匹配结果** |
| `d0` / `0d6` | 1 / 0 | 边界未校验 |

前两个是**算出错误结果**，不是功能缺失。`1d6` 更是最常用的写法之一。

**修复**：`parseRollCmd()` 改为先整体校验形状、再按符号切分：

```
^[+-]?(\d*[dD]\d+|\d+)([+-](\d*[dD]\d+|\d+))*$
```

不支持的运算符（`*` `/`）现在明确拒绝，而不是像旧实现那样把 `2d6*2` 悄悄算成 `2d6+2`。

### 1.5 月相图标恒为默认值

```javascript
// 旧 weatherapi.js:357
forecastDays[0].moonPhase = parseInt(oriData.forecast.forecastday[0].astro.moon_phase);
```

`astro.moon_phase` 的值是 `"Waxing Crescent"` 这类英文名称，`parseInt` 得到 `NaN`。
而 `transMoonPhaseFont()` 内部拿字符串做 `==` 比较，`NaN` 匹配不上任何分支，
于是**不管真实月相是什么，图标序号恒为默认值 5**。

旧后端更早的版本（`weatherapi.js:108`）是直接存字符串、不做 parseInt，所以工作正常——
`parseInt` 是后来加上的。

**修复**：去掉 `parseInt`，`IWeatherRec.moonPhase` 类型改为 `string`，
15 处空记录初始化的 `moonPhase: 1` 改为 `''`。

> 验证时踩了个坑：项目自带的测试夹具 `testData` 里 `moon_phase` 是 `"Waning Gibbous"`，
> **正好映射到 5**，与出 bug 时的默认值相同，用它根本区分不出修没修好。
> 最后用 8 个月相名称全量比对才确认。

### 1.6 分页数算错，末页打不开

```javascript
// 旧 blog.js:77-81
if (recCount < pageSize) { json.pageCount = 1; }
else { json.pageCount = parseInt((recCount + 1) / pageSize); }
```

实测（每页 10 条）：

```
条数   旧公式  正确
  36      3      4   ❌  ← 迁移时 teo 的实际条数
 179     18     18   ✅  ← u001 碰巧算对
 181     18     19   ❌
```

**这不是边界情况**：`teo` 有 36 篇文章，旧公式告诉前端只有 3 页，
所以第 4 页的 6 篇**当时就打不开**。`u001` 的 179 条碰巧算对，这个 bug 才一直没被发现。

**修复**：`blogService.ts` 的 `calcPageCount()` 改用 `Math.ceil`。

### 1.7 其他

| 问题 | 修复 |
|------|------|
| 密码明文存储，登录时直接字符串比对 | 改为 `crypto.scrypt` 加盐哈希 + `timingSafeEqual` 比较 |
| token 续期分支从未成功过（查 key 用了未定义变量、拿包装对象比字符串） | 修复并改为签发新 token 真正延长有效期，旧 token 一次性作废 |
| `date` 字段恒为空（硬写 `''`，其余天从未赋值） | 按 `forecastday[].date` 逐天填入 |
| `uv` 字段恒为 0（声明了但从未赋值） | 按 `day.uv` 逐天补齐 |
| `moonPhase`/`sunrise`/`sunset` 只有第 0 天 | 逐天补齐 |
| 三个调试用 cookie（`test01`/`test02`/`test03`）留在登录响应里 | 删除 |

---

## 二、迁移中引入又修掉的问题

记录这些是因为它们揭示了容易踩的坑。

### 2.1 OpenWeatherMap 数据源丢失

迁移天气模块时，`openweathermap.ts` 没有一起迁过来，`weather.ts` 改成了调
`createEmptyRecsOpenWeatherMap()` 填全 0 占位数据。后果是接口返回 200，
但**第 4、5 天预报全为 0，第 2、3 天风向固定 `'N'`**——静默数据错误，
不实际发请求看输出无法发现。

修复时顺带查清了一个重要事实：**WeatherAPI 免费账号只返回 3 天**
（请求 `days=5` 或 `10` 都只给 3 天，接口静默截断）。这就是老系统要聚合两个数据源的原因。
详见 [weather-data-sources.md](weather-data-sources.md)。

### 2.2 缓存污染

`weatherapi.ts` 的 60 分钟缓存返回的是**缓存对象本身**。合并 OpenWeatherMap 数据时
直接改写了它，导致后续**不传 `appKey2` 的请求也能看到上次合并进去的数据**。

修复：合并前先拷贝 `forecastDays`。

### 2.3 搬迁脚本把 45 组相册的时间戳写成了迁移时刻

两个旧模块存 `time` 的类型不一致：`blog.js` 做了 `parseInt` 存为 **number**，
而 `gallery.js` 直接用 `data.params.time` 存为 **string**。

搬迁脚本用 `Number.isFinite(rec.time)` 判断有效性，而它**不做类型转换**，
对字符串 `"1770588479999"` 返回 false，于是全部落到 `Date.now()` 兜底分支。

是迁移后的一致性校验发现的——按 `(author, created_at, title)` 查不到对应相册，
45 组全部报错。

> 教训：`Number.isFinite` 不等于「能转成有限数字」。要兼容字符串得先 `Number()` 再判断。
> 脚本里现在用显式的 `toEpoch()` 归一化。

---

### 2.4 build 脚本在生产环境报 `Permission denied`

迁移后首次部署到生产环境时：

```
> jade-dungeon-api@1.0.0 build
> tsc && tsc-alias
sh: 1: tsc-alias: Permission denied
```

成因：`tsc && tsc-alias` 依赖 npm 把 `node_modules/.bin` 加进 PATH，
而那要求 bin 指向的目标文件**有执行位**。`node_modules` 经 `tar`/`scp`
搬运后执行位丢失了。

> 本地完全看不出来——开发机在 WSL 的 `/mnt/d/` 挂载上，
> 权限一律显示 `rwxrwxrwx`，掩盖了真实状态。
> 要复现得把项目复制到真实的 Linux 文件系统再 `chmod -x`。

现象里有个值得注意的细节：报错只提 `tsc-alias`，说明 `tsc` 当时**有**执行位。
两者状态不一致，推测是 `tsc-alias` 后来才装、搬运方式与其余包不同。
但实测确认 `tsc` 在同样条件下也会失败，所以修复要覆盖两者。

**修复**：两步都改用 `node <脚本路径>` 显式调用，完全绕开执行位：

```json
"build": "node node_modules/typescript/bin/tsc && node node_modules/tsc-alias/dist/bin/index.js"
```

验证方式是剥掉 `node_modules/.bin` 下全部 10 个执行位，build 仍然成功、
别名正常改写、产物能启动。详见 CLAUDE.md 的「部署」一节。

## 三、框架的两处结构性改造

### 3.1 一文件一路由的限制（已解除）

| | 旧框架 | 本项目 |
|---|--------|--------|
| 模块导出 | `exports.handler` 是 **URL → 函数的对象**，一个文件可挂多个路由 | `export const handler` 是单个 `ICustomHandler` **或 `ICustomHandler[]`** |
| 路由发现 | `config.js` 的 `moduleNames` 显式列出 | 递归扫描 `routes/`，支持子目录 |
| 方法声明 | 不写 `method` 则 GET+POST 双绑 | 必须显式声明（位掩码可组合） |

改造前一个文件只能挂一个路由，`sandtable/map.js`（6 个路由 274 行）要拆成 6 个文件，
而且同一业务共用的辅助函数（场景三级寻址、owner 校验）无处安放。

选了「支持数组导出」而非「拆文件」，并顺带加了合法性校验与重复检测。
详见 CLAUDE.md 的「自动发现流程」。

### 3.2 Redis key 必须沿用旧拼写

sandtable 的数据仍在 Redis，key 前缀是 `jadedungeon::sandtable::*`。
**其中 `scence` 是旧后端的拼写错误**（正确应为 `scene`）：

```
jadedungeon::sandtable::scence::<campaignId>::<placeId>::<sceneId>
                        ^^^^^^ 拼写错误，必须沿用
```

迁移时沿用了这个错误拼写，因为当时两代后端读写同一个 Redis 实例。
旧后端已停用，但 **Redis 里存量场景数据的 key 就是这个拼写**，
改名要连带写迁移脚本遍历改 key，所以仍未处理。
**约束换了来源，不是消失了。**

曾是同类情况的 blog/gallery 响应字段 `ablum`（`album` 之误）
**2026-11-05 已经改正成 `album`** —— 它只是响应字段，表里本来就叫
`gallery_photo`，不涉及存量数据，所以旧后端停用后前后端一起改掉了。
唯一还留着 `ablum` 的是 `scripts/migrateBlogRedisToSqlite.ts`，它读的是旧数据本身。

**这两个的区别值得记住**：响应字段改了就改了，
**Redis key 改名要迁数据** —— 后者跟后端升不升级无关。

---

## 四、存储选择

| 模块 | 存储 | 原因 |
|------|------|------|
| auth | SQLite | 密码需要加盐哈希，Redis 的 string 形态不合适；且需要多会话 token 表 |
| blog / gallery | SQLite | Redis List 导致分页算错、无法按单篇查询、改一篇要重写整个列表、无法跨用户查询 |
| sandtable | **Redis** | 场景数据是整块 JSON，key-value 形态更合适 |

搬迁规模：blog 215 篇、gallery 45 组 274 张图片，数据库 2.99 MB。
Redis 原数据**保留未删**，便于回滚比对。

---

## 五、旧项目的环境信息（备查）

分仓后这些信息在本仓库里查不到了，记录于此：

| 项目 | 端口 | 启动方式 |
|------|------|---------|
| `Jade-TRPG-api` dev（旧后端，已停用） | 8038 | `bash startup-dev.sh` |
| `Jade-TRPG-api` rls（旧后端，已停用） | 8088 | `bash startup-rls.sh` |
| **本项目** dev | **8089** | `npm run dev`（需先 `nvm use`） |
| `Jade-Dungeon-page`（前端） | 8030 | `bash run-dev.sh` |

前端通过 `envs.js` 的 `apiRoot` 指向后端，该文件被 gitignore，
从 `envs.sample.js` 复制出 `envs-dev.js` 再由 `build-dev.sh` 落地。
样例里 dev 的 `apiRoot` 是 `//localhost:8082`，与实际端口都不一致，
本地联调需要自己改 `envs-dev.js` 或用 CLI `--port` 对齐。

旧后端的部署方式是 `tar` 打包 → `scp` 上传 → 服务器解压重启，没有 CI。

### 第三方天气 API 的凭据

两个供应商的账号与 key 原先记在 `Jade-TRPG-api/local-notes.md`（已 gitignore）。
**分仓后这个文件不在本仓库里**，需要另行保管。

对应关系（2026-11-04 实测确认，交换后两边都返回 401）：

| 接口参数 | 供应商 | key 长度 |
|---------|--------|---------|
| `appKey1` | weatherapi.com | 30 位 |
| `appKey2` | openweathermap | 32 位 |

> 那份笔记里有账号的**明文密码**，不要复制进任何会提交的文件。
> 天气接口的 key 走请求参数传入，不存在配置文件里。
