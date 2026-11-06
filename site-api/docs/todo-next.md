# 待办事项

整理日期：2026-11-04
背景：18 个接口已全部从旧后端 `Jade-TRPG-api` 迁移完成（见 [迁移历史](migration-history.md)）。本文汇总迁移过程中
**发现但有意未处理**的问题，按优先级排列。

每项都写清了：问题是什么、为什么当时没做、动手时要改哪些文件、有什么前置依赖。

---

## P1 安全相关

### 1.1 `request-move` 与 dice 三个接口的 token 校验是可选的

**现状**：这四个接口带了 token 就校验、没带就**信客户端声明的 `username`**。

| 接口 | 文件 | 可被冒充的操作 |
|------|------|--------------|
| `request-move` | `routes/sandtable/map.ts` | 以他人身份提交棋子移动请求 |
| `roll-dice` | `routes/sandtable/dice.ts` | 冒充他人掷骰 |
| `set-roll-threshold` | `routes/sandtable/dice.ts` | 非 GM 也能给任意玩家设检定阈值 |
| `get-roll-result` | `routes/sandtable/dice.ts` | 只读，影响较小 |

未带 token 时服务端会打 `⚠️` 告警，但仍然放行。

**为什么没做**：前端 `sandtable-comm.js` 这几个调用都是 GET 且**不传 token**，
强制校验会直接打断沙盘功能。

**动手时要改**：

1. 前端 `sandtable-comm.js`（在 `Jade-Dungeon-page` 仓库，本仓库之外）—— 在
   `requestMoveTo` / `rollDice` / `setRollThreshold` / `getRollResult`
   的 URL 里加上 `&token=` + `cookieOperator('loginToken')`
2. 后端把 `resolveIdentity()` 的「没带 token 就放行」改成拒绝
3. `set-roll-threshold` 还要额外判断「调用者是否为该战役的 GM」——
   现在连 owner 校验都没有，任何登录用户都能给别人设阈值

**对照**：`save-map` 已经是强制校验了，因为前端 `sandtable-editor.js`
一直在 `jsonStr` 里传 `loginToken`（旧后端从没读过）。可以参考它的写法。

### 1.2 两个 save 接口完全不校验身份

**现状**：`blog/save` 和 `gallery/save` 的 `userId` 由客户端传，
**任何人都能以任意身份发文或建相册**。

**为什么没做**：决策时选了「照搬旧行为」。调用方是静态页的原生表单
（`static/html/blog/blog.html`、`gallery.html`），表单里没有 token 字段。

**动手时要改**：

1. 那两个静态页加隐藏字段带上 token，或改成 ajax 提交
2. `routes/blog.ts` / `routes/gallery.ts` 的 save 分支接上 `verifyToken()`，
   用 token 解出的用户名替代客户端传的 `userId`

**附带问题**：原生表单提交后浏览器会跳转到响应内容，而响应是 JSON，
用户会看到一行裸 `{"status":"success"}`。改成 ajax 能一并解决。

### 1.3 `parseImage` 的 SSRF 防护不完整

**现状**：`routes/sandtable/parseImage.ts` 已拦住**字面量**的内网地址
（私有网段、回环、链路本地）和非 http/https 协议。实测：

```
http://127.0.0.1:6379/                   → 403
http://169.254.169.254/latest/meta-data/ → 403
file:///etc/passwd                       → 400
```

**仍未处理的三项**：

| 风险 | 说明 |
|------|------|
| DNS rebinding | 只检查了字面量 IP。`http://127.0.0.1.nip.io/` 这类域名解析后才指向内网，现在拦不住 |
| 响应体无大小上限 | 超大图片会把整个 body 读进内存（`Buffer.concat`），可被用来打内存 |
| 不校验 HTTPS 证书 | `rejectUnauthorized: false` 沿用旧实现，便于取自签名证书的图源 |

**动手时要改**：前两项需要改 `parseImage.ts`——DNS rebinding 要在
`dns.lookup` 后再查一次 IP 段，大小上限要在累积 chunk 时判断并提前 `destroy()`。
第三项是有意保留的，改之前要确认图源里有没有自签名证书的站点。

---

## P2 正确性与体验

### 2.1 `outFormat=json` 的响应头是错的

**现状**：`routes/weather.ts` 算出了 `cType`（json 时为 `application/json`），
但成功分支**硬编码了 `'text/plan'`**，`cType` 只在错误分支用上。

```typescript
// routes/weather.ts 成功分支
sendOnce(context.response, 200, {
    'Content-Type': 'text/plan',   // ← 应该用 cType
    ...
```

返回体确实是 JSON，但 `Content-Type` 不对。curl 不受影响，浏览器直接访问会当纯文本显示。

顺带一提 `text/plan` 本身是 `text/plain` 的拼写错误，旧后端就有。

**动手时要改**：`routes/weather.ts` 一处。改 `text/plan` → `text/plain` 要留意
conky 那边会不会在意 Content-Type——它是命令行工具，大概不在意，但值得确认。

### 2.2 第 4、5 天缺 `uv` 与 `moonPhase`

**现状**：WeatherAPI 免费账号只给 3 天，第 4、5 天来自 OpenWeatherMap，
而**该数据源不提供 `uv` 和 `moonPhase`**，`sunrise`/`sunset` 也只有当天值。
所以那两天这几个字段是空的。详见
[weather-data-sources.md](weather-data-sources.md)。

**这不是 bug，是账号等级决定的。** 要补齐得：

- 订阅 OpenWeatherMap One Call 3.0（当前账号访问它返回 401），或
- 把 WeatherAPI 升到付费档（支持 14 天，届时第二个数据源就不需要了）

### 2.3 两个接口返回硬编码假数据

`blog/loadUserById` 和 `blog/loadRecommendArticles` 原样照搬了旧实现的假数据。
迁移时决策选了「照搬」。

现在有条件做成真查询了：

- `loadUserById` → 查 `auth_user` 表（auth 已迁 SQLite）
- `loadRecommendArticles` → `SELECT ... FROM blog_article ORDER BY created_at DESC LIMIT 2`，
  `idx_blog_time` 索引已经建好

但 `auth_user` 表里没有 `avatar` / `desc` / `group` / `homePageUrl` 这些字段，
要做成真查询得先扩表。

---

## P3 功能缺口

### 3.1 文章与相册没有编辑、删除接口

旧后端用 Redis List 存，改一条要重写整个列表（u001 那 7.69 MB），所以一直没做。
现在数据在 SQLite 里，`UPDATE ... WHERE id = ?` 就能改，具备实现条件了。

需要配套的权限校验（只能改自己的），依赖 1.2 先做完。

### 3.2 没有全文搜索

SQLite 有 FTS5 扩展，可以对 `blog_article.title` + `text` 建全文索引。
数据量不大（215 篇、2.99 MB），但正文平均 34.7 KB，全表 LIKE 扫描会慢。

### 3.3 相册存的是外部图片 URL，不是文件

`gallery_photo.url` 指向 `s41.ax1x.com` 这类外部图床。图源失效则图片丢失。
`scripts/backupBlogData.ts` 会把图片下载到本地做备份，但线上展示仍依赖图源。

---

## P4 工程质量

### 4.1 eslint 没有缩进规则

`eslint.config.mjs` 里没有任何 indent 相关规则，所以缩进偏离查不出来——
`db/` 目录当初就是这样混进 2 空格缩进的（2026-11-04 已统一为 tab）。

可以加：

```javascript
rules: { "@stylistic/indent": ["error", "tab"] }
```

需要装 `@stylistic/eslint-plugin`。该规则对对齐比较严格，可能会在现有代码里
报出一批新问题，加之前最好先跑一次看影响范围。

### 4.2 没有自动化测试

三个子项目都没有测试框架。迁移期间的验证全靠手工脚本
（写完即删）和 `curl` 比对。

正文指纹比对、掷骰范围校验、`sendOnce` 的并发守卫这类逻辑其实很适合单元测试。
若要补，`node:test`（Node 内置）比引入 jest/vitest 更契合这个项目「少工具」的风格。

### 4.3 两个数据源的风速单位不一致

天气接口第 1-3 天的 `windSpeed` 是 **km/h**（WeatherAPI），
第 4、5 天是 **m/s**（OpenWeatherMap 在 `units=metric` 下）。
数值不可直接比较。这是旧系统就有的口径问题，迁移时未改动——
改了会影响前端和 conky 的显示。

### 4.4 `IRequestData.params` 的类型是简化过的

`types.ts` 把 params 的值类型定为 `string | undefined`，而
`request.query` 的真实类型是 `ParsedQs`（值可能是 `string[]` 或嵌套对象）。
框架在 `simpleHTTPServer.ts` 里做了一次带注释的转换。

现有 handler 都按单值字符串使用，所以没问题。但**将来若有 handler 需要
处理数组参数**（如 `?tag=a&tag=b`），要同时放宽 `IRequestData.params` 的类型。

> 相关的实际案例：`gallery/save` 的 `picUrl` 就是重复参数，
> `routes/gallery.ts` 的 `readPhotos()` 里做了数组归一化处理。

---

## 已完成的事项（备查）

迁移期间发现并已修复的问题，详见[迁移历史](migration-history.md)：

| 问题 | 位置 |
|------|------|
| 位掩码组合失效，`HTTP_GET \| HTTP_POST` 只绑 GET | 框架 `bindHandler()` |
| HTTP 响应重复写出会终止进程 | 统一走 `sendOnce()` |
| sandtable owner 校验可被任意绕过 | `save-map` 改为从 token 取身份 |
| `1d6` 掷骰稳定返回 NaN | `diceService.ts` |
| 减号被当成加号，`3d6-2` 算成 `3d6+2` | 同上 |
| 月相图标恒为默认值 | `weatherapi.ts` 去掉错误的 `parseInt` |
| OpenWeatherMap 数据源丢失，第 4、5 天全为 0 | 迁入 `openweathermap.ts` |
| 分页数算错，36 条算出 3 页导致末页打不开 | `blogService.ts` 改用 `Math.ceil` |
| `pageSize` 下限 10 把前端请求的 5 静默抬成 10（2026-11-05） | `blogService.ts` 的 `normalizePaging()` 下限改为 1 |
| 密码明文存储 | 改为 scrypt 加盐哈希 |
| token 续期分支从未成功过 | 修复并改为签发新 token |
| `date` / `uv` 字段恒为空 | `weatherapi.ts` 逐天补齐 |
