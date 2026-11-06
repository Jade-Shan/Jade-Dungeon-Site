# 写死请求地址的清理（已实施）

调查日期：2026-11-01，同日实施完毕。本文列出项目里全部写死的请求地址，
以及把它们改为从 `envs.js` 注入的做法。

第 1-7 节是调查与方案（保留原样，作为决策依据），
[第 8 节](#8-实施记录)是实施记录与实测结果。

## 1. 调查结论

共 11 处写死的请求地址，全部在 **demo / 测试脚本**里，业务代码已经没有了
（`blog/common.ts` 的 `API_ROOT` 已在 [refactor-20261101.md 第 10 节](refactor-20261101.md) 清掉）。

涉及两个端口，正好对应 `envs.js` 里已有的两个配置项：

| 写死的端口 | 用途 | envs.js 里对应的键 | 该键当前状况 |
|-----------|------|------------------|-------------|
| `:8088` | 后端 API（含图片代理接口） | `apiRoot` | 已在用（blog/gallery 页面） |
| `:8081` | CDN 静态资源（图片、第三方库） | `cdnRoot` | **定义了但从未被任何 HTML 使用** |

`cdnRoot` 这个键已经存在于 `envs.js`，但 `grep -rn "@@cdnRoot" src/html/` 结果为空 ——
一直没派上用场。本方案正好用上它。

## 2. 注入链路是否走得通

走得通，而且已经有一条验证过的样板。链路是四段：

```
envs.js  →  gulp-file-include 的 @@变量  →  HTML 内联脚本  →  入口函数形参  →  发请求的方法
```

**已验证的样板**（第 10 节做的）：

```javascript
// envs.js                     apiRoot: "//localhost:8082"
// blog.html                   await BlogPage.initBlogPage('@@apiRoot', ...)
// blog/blog.ts                let apiRoot = normalizeApiRoot(basePath);
// blog/common.ts              url: `${apiRoot}api/blog/loadUserById?...`
```

实测三个接口的数据都能渲染出来，所以这条链路是通的。

**本次要解决的差异**：demo 页面的入口函数**全部不接受参数**，所以链路第三段断了。

| 入口 | 当前签名 | 页面调用方式 |
|------|---------|-------------|
| `TestJadeUtils.testAll()` | 无参 | `TestJadeUtils.testAll($)` |
| `TestJadeUtils.testWiki()` | 无参 | `TestJadeUtils.testWiki()` |
| `TestJadeUtils.testCanvas()` | 无参 | `TestJadeUtils.testCanvas()` |
| `TestJadeTRPG.testTrpgCompose()` | 无参 | `TestJadeTRPG.testTrpgCompose()` |
| `TestJadeTRPG.testTrpgUI()` | 无参 | `TestJadeTRPG.testTrpgUI()` |

所以改动量主要是给这 5 个入口加形参，再一路往下传。

## 3. 写死地址清单

### 3.1 testJadeUtils.ts（3 处生效 + 1 处注释 + 1 处图床）

| 行 | 内容 | 类别 | 建议来源 |
|----|------|------|---------|
| [257](../site-page/src/testJadeUtils.ts#L257) | `http://www.jade-dungeon.cn:8088/api/blog/loadUserById?userId=guest` | API 请求 | `apiRoot` |
| [269](../site-page/src/testJadeUtils.ts#L269) | `https://s21.ax1x.com/2024/06/29/pk6vkEF.jpg` | 外部图床图片 | **保留**，见 3.4 |
| [270](../site-page/src/testJadeUtils.ts#L270) | 同上，被注释掉的 `:8081/.../map.jpg` 备选 | 死代码 | 建议删除 |
| [271](../site-page/src/testJadeUtils.ts#L271) | `http://www.jade-dungeon.cn:8088/api/sandtable/parseImage?src=` | API 请求（图片代理） | `apiRoot` |
| [332](../site-page/src/testJadeUtils.ts#L332) | `loadCodeHightlight("http://www.jade-dungeon.cn:8081", "/3rd/SyntaxHighlighter/...")` | CDN 静态资源 | `cdn3rd` 或 `cdnRoot` |

第 332 行要注意：第二个参数 `/3rd/SyntaxHighlighter/2.1.364/scripts` 这个路径布局，
与 HTML 里 `@@cdn3rd/SyntaxHighlighter/2.1.364/scripts` 的布局**不一致**（多了一层 `/3rd`）。
需要你确认实际 CDN 上是哪种布局。

### 3.2 testJadeTRPG.ts（7 行，归为 6 处）

| 行 | 内容 | 类别 | 建议来源 |
|----|------|------|---------|
| [12](../site-page/src/trpg/testJadeTRPG.ts#L12) | 代理 URL `:8088/api/sandtable/parseImage?src=` | API 请求 | `apiRoot` |
| [15](../site-page/src/trpg/testJadeTRPG.ts#L15) | `:8081/jadeutils.v3/themes/trpg/images/icons.jpg` | CDN 图片 | `cdnRoot` |
| [17](../site-page/src/trpg/testJadeTRPG.ts#L17) | `:8081/jadeutils.v3/themes/trpg/images/map.jpg` | CDN 图片 | `cdnRoot` |
| [427](../site-page/src/trpg/testJadeTRPG.ts#L427) | 同上 map.jpg（另一个函数里重复） | CDN 图片 | `cdnRoot` |
| [428](../site-page/src/trpg/testJadeTRPG.ts#L428) | 同上代理 URL（重复） | API 请求 | `apiRoot` |
| [453-454](../site-page/src/trpg/testJadeTRPG.ts#L453-L454) | `testSceneData` 里的 icons.jpg / map.jpg | CDN 图片 | `cdnRoot` |

注意 453-454 在模块级常量 `testSceneData` 里，不在函数内，拿不到函数形参 ——
需要改成在函数里拼 URL，或把 `testSceneData` 改成接受基址的工厂函数。见 4.3。

### 3.3 库代码里的两处路径假设（不是请求地址，但相关）

| 位置 | 内容 | 说明 |
|------|------|------|
| [wiki.ts:28](../site-page/src/blog/wiki.ts#L28) | `apiRoot: "/"` 写死在 `PageConfig` 里 | 当前无页面调用 `initWikiPage()`，它是给外部 vimwiki 项目用的 |
| [wiki.ts:46](../site-page/src/blog/wiki.ts#L46) / [3rdLibTool.ts:36](../site-page/src/3rdLibTool.ts#L36) | `../../vimwiki-theme/3rd/SyntaxHighlighter/2.1.364/scripts` | 指向本项目之外的目录 |

这两处**不建议本次动**：`initWikiPage()` 的调用方在另一个项目里，改了形参含义会影响那边。
需要你确认 vimwiki 项目怎么调的，再单独处理。

### 3.4 建议保留不改的

| 位置 | 内容 | 保留理由 |
|------|------|---------|
| testJadeUtils.ts:269 | `https://s21.ax1x.com/...` 图床图片 | 这是测试图片代理功能的**测试夹具**，故意用外部跨域图片才能验证代理生效。换成本站图片就测不到代理了 |
| testJadeTRPG.ts:450-451 | `testSceneData` 里的 `username` / `loginToken` | 测试夹具数据，不是请求地址 |

## 4. 改法方案

### 4.1 envs.js 加一个键（可选）

当前 `cdnRoot` 的值是 `//localhost:8081`（dev）/ `//:8081/jadeutils.v2`（rls）。
但写死的图片路径是 `:8081/jadeutils.v3/themes/trpg/images/...` —— 注意是 **v3**，
而 rls 的 `cdnRoot` 指向 **v2**。

**需要你确认**：rls 的 `cdnRoot` 指向 `jadeutils.v2` 是有意的，还是过期了没改？
如果是过期的，改 `cdnRoot` 的值即可；如果 v2 仍在用，则需要新增一个键区分。

两个选项：

```javascript
// 选项 A：复用 cdnRoot，由调用方拼上 /jadeutils.v3/themes/
cdnRoot: "//localhost:8081",            // dev
cdnRoot: "//www.jade-dungeon.cn:8081",  // rls（去掉 /jadeutils.v2）

// 选项 B：新增 themeRoot，直接指到主题图片目录
cdnRoot:   "//localhost:8081",
themeRoot: "//localhost:8081/jadeutils.v3/themes",   // dev
themeRoot: "//www.jade-dungeon.cn:8081/jadeutils.v3/themes",  // rls
```

倾向 **选项 B** —— demo 里要拼的是 `themes/trpg/images/xxx.jpg`，有了 `themeRoot`
调用处只写 `${themeRoot}/trpg/images/map.jpg`，不用每处重复 `/jadeutils.v3/themes`。

### 4.2 给 5 个 demo 入口加形参

统一加一个配置对象形参，而不是加一串散的字符串参数 —— 以后要加键不用改签名：

```typescript
/** demo 页面的运行时配置，由 HTML 从 envs.js 注入 */
export interface DemoEnvConfig {
	/** 后端 API 根路径，如 `//localhost:8082` */
	apiRoot?: string;
	/** 主题图片根路径，如 `//localhost:8081/jadeutils.v3/themes` */
	themeRoot?: string;
	/** 第三方库 CDN 根路径，如 `//cdn.bootcss.com` */
	cdn3rd?: string;
}
```

放哪里需要你定：

- 放 `web.ts` —— demo 和库共用一个类型，但这是 demo 专用的概念，污染库的公开导出
- 放一个新文件 `src/scripts/ts/demoEnv.ts` —— 干净，但多一个文件
- 各 demo 文件各自定义 —— 重复三遍

倾向**新建 `demoEnv.ts`**，并且**不要**加进 `package.json` 的 `exports`（demo 专用，不对外发布）。

入口签名改成：

```typescript
// testJadeUtils.ts
static testAll(env?: DemoEnvConfig) { ... }     // 注：当前签名无参，页面却传了 $，见下文
static testWiki(env?: DemoEnvConfig) { ... }
// testCanvas() 链路里没有请求，不用加

// testJadeTRPG.ts
export let testTrpgCompose = async (env?: DemoEnvConfig) => { ... }
export let testTrpgUI      = async (env?: DemoEnvConfig) => { ... }
```

**形参要往内层函数继续传** —— 写死的地址不在入口函数里，而在更深一层：

```
TestJadeUtils.testAll(env)
  ├─ TestWebUtil.testHttpRequest(env)      ← 257 行 API、271 行代理 URL
  └─ TestWebHtmlPage.testJquery(env)       ← 332 行 SyntaxHighlighter CDN

TestJadeUtils.testWiki(env)
  └─ TestWebHtmlPage.testJquery(env)       ← 同上，332 行

TestJadeUtils.testCanvas()                 ← 链路里无请求，不用改

TestJadeTRPG.testTrpgCompose(env)          ← 12 行代理、15/17 行图片（都在函数内）
TestJadeTRPG.testTrpgUI(env)               ← 427/428 行（函数内）
  └─ 用到模块级 testSceneData               ← 453/454 行，见 4.3
```

所以 `testJadeUtils.ts` 里实际要改签名的是 **4 个函数**（2 个入口 + 2 个内层），
不是只有入口。`TestWebHtmlPage.testJquery()` 被两个入口共用，改一次两边都生效。

**另外发现一处现有的签名不一致**：`test-jade-blog.html:197` 调用
`TestJadeUtils.testAll($)`，但 `testAll()` 的签名是无参的 —— 这个 `$` 一直被
JS 静默忽略。不影响运行（jQuery 是全局变量，`3rdLibTool.ts` 用 `declare` 拿的），
但说明这个参数本来就没用。建议本次顺手删掉页面侧的 `$`，让签名只收 `env`。

形参可选 + 内部兜底，这样即使页面没传也不会崩（退化成当前的写死值或空值）。
**需要你定兜底策略**：

- 兜底成当前的生产地址 —— 行为不变，但写死的值还在代码里
- 兜底成空串 / 同源 —— 写死的值彻底消失，但不传参数时 demo 就跑不起来
- 不兜底，形参必填 —— 最干净，但所有调用处必须同时改

倾向**兜底成空串**：写死的生产地址从代码里消失，而页面侧一定会传（本方案会一起改），
不传的情况只会出现在有人手写新页面时，那时报错比静默打生产域名更好。

### 4.3 testSceneData 的处理

`testSceneData` 是模块级常量，拿不到函数形参。两个改法：

```typescript
// 改法 1：改成工厂函数
let buildTestSceneData = (themeRoot: string): SceneDataResp => ({
	"username": "jade",
	"loginToken": "jade|a8dce1e8-...",
	"imgResources": [
		{"id": "icons", "type": "Image", "url": `${themeRoot}/trpg/images/icons.jpg`},
		{"id": "map"  , "type": "Image", "url": `${themeRoot}/trpg/images/map.jpg`  }
	],
	"mapDatas": { /* 原样 */ }
});

// 改法 2：常量里放相对标记，用的时候替换
"url": "@themeRoot@/trpg/images/icons.jpg"
// 再在函数里 .replace('@themeRoot@', themeRoot)
```

倾向**改法 1** —— 类型安全，没有字符串魔法。代价是 `testSceneData` 这个 300 多行的
常量要包进函数，diff 会比较大（但只是缩进变化）。

### 4.4 HTML 页面侧改动

5 个页面的调用处加参数：

5 个页面的调用处加参数：

| 页面 | 当前 | 改为 |
|------|------|------|
| test-jade-blog.html:197 | `TestJadeUtils.testAll($);` | `TestJadeUtils.testAll({apiRoot:'@@apiRoot', cdn3rd:'@@cdn3rd'});` |
| test-jade-cdn.html:162 | `TestJadeUtils.testAll();` | 同上 |
| test-jade-wiki.html:278 | `TestJadeUtils.testWiki();` | `TestJadeUtils.testWiki({cdn3rd:'@@cdn3rd'});` |
| test-jade-canvas.html:57 | `TestJadeUtils.testCanvas();` | **不用改**（链路里无请求） |
| test-jade-trpg-compose.html:56 | `TestJadeTRPG.testTrpgCompose();` | `...testTrpgCompose({apiRoot:'@@apiRoot', themeRoot:'@@themeRoot'});` |
| test-jade-trpg-ui.html:25 | `TestJadeTRPG.testTrpgUI();` | `...testTrpgUI({apiRoot:'@@apiRoot', themeRoot:'@@themeRoot'});` |

`test-jade-blog.html` 那处的 `$` 建议一起删掉（见 4.2 末尾：这个参数一直被静默忽略）。

## 5. 改动清单汇总

| 文件 | 改动 | 规模 |
|------|------|------|
| `envs.js` / `envs.sample.js` | 新增 `themeRoot`（或改 `cdnRoot` 的值） | 2 × 2 行 |
| `src/scripts/ts/demoEnv.ts` | 新建，定义 `DemoEnvConfig` | 约 15 行 |
| `src/scripts/ts/testJadeUtils.ts` | 4 个函数加形参（2 入口 + 2 内层），3 处写死地址改为取配置 | 约 15 行 |
| `src/scripts/ts/trpg/testJadeTRPG.ts` | 2 个入口加形参，6 处写死地址改为取配置，`testSceneData` 改工厂函数 | 约 20 行 + 缩进 |
| 5 个 demo HTML | 调用处加参数 | 5 行 |

不涉及：`web.ts`、`sandtable.ts`、`blog/*`、`ui/*`、`workout/*` ——
这些要么已经是参数化的，要么本来就没写死地址。

`sandtable.ts` 值得单独说一句：它的 `drawSceneWithUserView(tokens, proxyCfg?)` 和
`SandTableUtils.loadImageResources(imageRecs, imgProxyUrl?)` **已经是参数化设计**，
代理地址由调用方传入。所以库层不用改，只有 demo 的调用方在传写死值。

## 6. 需要你确认的 6 个点

1. **rls 的 `cdnRoot` 指向 `jadeutils.v2` 是有意的还是过期了？**
   写死的图片路径是 `jadeutils.v3`，两者不一致
2. **`themeRoot` 用选项 A（复用 cdnRoot 让调用方拼）还是选项 B（新增键直接指到 themes）？**
   我倾向 B
3. **`DemoEnvConfig` 放哪？** 我倾向新建 `demoEnv.ts` 且不加进 `exports`
4. **不传参数时的兜底策略？** 我倾向兜底成空串，让错误显形而不是静默打生产域名
5. **`testSceneData` 改工厂函数可以吗？** diff 会比较大（300 多行缩进变化）
6. **`testJadeUtils.ts:332` 的 SyntaxHighlighter 路径**，CDN 上实际是
   `/3rd/SyntaxHighlighter/...` 还是 `/SyntaxHighlighter/...`？
   代码里和 HTML 里的布局不一致

另外两件事**建议本次不做**，需要你决定是否单独排期：

- **`wiki.ts` 的 `apiRoot: "/"` 和 vimwiki 路径** —— 调用方在另一个项目里，
  改形参含义会影响那边。要先确认 vimwiki 项目怎么调的
- **`testJadeUtils.ts:269` 的图床图片** —— 这是测试跨域代理的夹具，换成本站图片就测不到代理了

## 7. 验证方式

改完后按这个顺序验证：

```bash
# 1. 类型检查
npx tsc --noEmit -p tsconfig.json

# 2. 确认源码里不再有写死的生产域名（图床那处除外）
grep -rn "jade-dungeon.cn" src/scripts/ts/

# 3. 构建
npx gulp process-typescript && npx gulp include-html-dev

# 4. 确认产物里的地址来自 envs.js
grep -n "apiRoot\|themeRoot\|localhost" webroot/html/test-jade-trpg-ui.html
```

浏览器验证需要起本地服务 + 后端在 8082（TRPG demo 的图片代理接口要真实后端），
或者先只验证「请求地址变成了 localhost 而不是生产域名」这一点。

## 8. 实施记录

第 6 节 6 个待确认点的决定：

| # | 问题 | 决定 |
|---|------|------|
| 1 | rls 的 `cdnRoot` 指向 v2 | 过期了，改 v3 |
| 2 | `themeRoot` 用哪个选项 | 先按选项 B 加了独立键，**后来改为选项 A** —— `themeRoot` 就是 `staticRoot + /themes`，重复，所以从 `envs.js` 里去掉，页面侧传 `'@@staticRoot/themes'` 拼出来。`DemoEnvConfig.themeRoot` 这个字段名保留（语义仍是「主题根路径」），只是不再有同名配置键 |
| 3 | `DemoEnvConfig` 放哪 | 新建 `env.demo.ts`，不进 `exports` |
| 4 | 不传参数的兜底 | 空串 |
| 5 | `testSceneData` 改工厂函数 | **保持原样** —— 改造后端时要作为对比样本，明文比对方便 |
| 6 | SyntaxHighlighter 的实际路径 | `http://www.jade-dungeon.cn:8081/3rd/SyntaxHighlighter/2.1.364/`，`/3rd` 归 `cdn3rd` 管 |

### 8.1 实际改动

| 文件 | 改动 |
|------|------|
| `envs.js` / `envs.sample.js` | `staticRoot` 改为绝对地址（`"."` 在页面与资源分服务时拼不出来）；`apiRoot` 定为 8088；`cdn3rd` 指向 `:8081/3rd`；**不加** `themeRoot`；rls 段未定的值标 `TODO-生产环境确定` |
| `src/scripts/ts/env.demo.ts` | 新建，`DemoEnvConfig` 接口 + `demoEnv()` 取值函数 |
| `src/scripts/ts/testJadeUtils.ts` | 4 个函数加 `env` 形参（2 入口 + 2 内层），3 处写死地址改注入 |
| `src/scripts/ts/trpg/testJadeTRPG.ts` | 2 个入口加形参，4 处改注入；`testSceneData` 保持明文并加注释说明原因 |
| `src/scripts/ts/web.ts` | `loadImageByProxy()` 的跨源判定改用 origin 比对，见 8.2 |
| `src/scripts/ts/3rdLibTool.ts` | 4 处 jQuery `.size()` → `.length`，见 8.3 |
| `src/html/test-jade-cdn.html` | `$(window).load` → `$(window).on('load', ...)`，见 8.3 |
| 5 个 demo HTML | 调用处注入 `@@apiRoot` / `@@staticRoot/themes` / `@@cdn3rd` |
| `gulpfile.js` | 构建日志加 `themeRoot` |

rls 段用 `TODO-生产环境确定` 占位而不是填猜测值：这些地址开发期无法知道，
填一个看起来合理的错值比留占位更危险 —— 占位会在构建产物里显形，错值不会。

### 8.2 顺带修掉的跨源判定 bug

改完 `themeRoot` 后发现 TRPG demo 的图片不走代理了。根因在
[web.ts](../common-utils/src/web.ts) 原来的判定条件：

```typescript
if (cfg?.proxyUrl && url.indexOf('http') == 0) {   // 只认 http 开头
```

代理的目的是绕开跨源图片对 canvas 的污染，所以判定标准应该是「是否跨源」，
而不是「URL 长什么样」。原条件漏掉了协议相对的 `//host/path`，
又会把同源的 `http://自己站/x.jpg` 也送进代理（没必要）。

改为用 `new URL(url, location.href)` 解析后比对 origin，并把**绝对地址**传给代理
（协议相对的 `//host/path` 直接丢给后端，Python urllib 会报 `unknown url type`，
实测确认过）。

五种 URL 的实测结果：

| 写法 | 例子 | 改前 | 改后 |
|------|------|------|------|
| 同源绝对 | `http://自己站/x.jpg` | PROXY（多余） | DIRECT |
| 同源路径相对 | `/themes/x.jpg` | DIRECT | DIRECT |
| 跨源协议相对 | `//other:8081/x.jpg` | DIRECT（**bug**） | PROXY |
| 跨源绝对 | `http://other:8081/x.jpg` | PROXY | PROXY |
| data URI | `data:image/gif;base64,...` | DIRECT | DIRECT |

需要无条件走代理（比如用代理做图片变换而不只是绕跨源）时，
传 `cfg.proxyFunc` 自己决定，这条逃生通道保留着。

### 8.3 顺带修掉的两个 jQuery 3 不兼容

两处都是 jQuery 3.0 移除的 API，属于既存 bug，与本次 URL 改造无关：

| 位置 | 问题 | 改法 |
|------|------|------|
| `test-jade-cdn.html` | `$(window).load(...)` 已移除，抛 `e.indexOf is not a function`，回调不执行 → **整个测试页从来没跑起来过** | `$(window).on('load', ...)` |
| `3rdLibTool.ts` 4 处 | jQuery 的 `.size()` 已移除，`bindInitDataTable()` 一进去就抛 | `.length` |

`.size()` 这处编译期查不出来，因为 `3rdLibTool.ts` 把 `$` 声明成
`declare function $(cc: any): any`，返回 `any`，TS 不校验其方法。

另外两个页面（`test-jade-canvas.html`、`test-jade-window-ui.html`）里
注释掉的 `$(window).load` 也一并改了写法，避免以后取消注释时又踩进去。

### 8.4 验证结果

| 验证项 | 方式 | 结果 |
|--------|------|------|
| `tsc --noEmit` 全量类型检查 | — | ✅ 0 错误 |
| 源码残留写死生产域名 | `grep jade-dungeon.cn src/scripts/ts/` | ✅ 只剩 `testSceneData` 两行（按决定保留）+ 1 行注释 |
| 注入值进入产物 | 查 5 个 demo 页产物 | ✅ 全部替换为 `envs.js` 的 dev 值 |
| API 请求打注入地址 | `test-jade-blog.html` + mock 后端 | ✅ `HIT /api/blog/loadUserById?userId=guest` |
| 图片代理打注入地址 | 同上 | ✅ `HIT /api/sandtable/parseImage?src=https%3A%2F%2Fs21.ax1x.com%2F...`（图床夹具保留） |
| 协议相对 URL 走代理 | `test-jade-trpg-compose.html` | ✅ 2 条代理请求，`src` 为补全后的 `http://` 绝对地址 |
| 五种 URL 的跨源判定 | 专门的探测页 + headless Edge | ✅ 见 8.2 表格 |
| jQuery `.load` 修复生效 | `test-jade-cdn.html` | ✅ 改前 0 请求，改后 2 条请求 |
| jQuery `.size()` 修复生效 | `test-jade-wiki.html` | ✅ `.size is not a function` 消失 |

### 8.5 曾经残留的两条报错（已随配置修正而消失）

`test-jade-wiki.html` 修完 `.size()` 后一度仍有两条报错
（`table.DataTable is not a function`、`SyntaxHighlighter is not defined`），
原因是当时 dev 的 `cdn3rd` 指向 `cdn.bootcss.com`，那里没有这些库：

```
$ curl -o /dev/null -w "%{http_code}" https://cdn.bootcss.com/jquery/3.5.1/jquery.min.js
200
$ curl -o /dev/null -w "%{http_code}" https://cdn.bootcss.com/datatable/1.10.21/jq-1.5/datatables.min.js
404
$ curl -o /dev/null -w "%{http_code}" https://cdn.bootcss.com/SyntaxHighlighter/2.1.364/scripts/shCore.js
404
```

`cdn.bootcss.com` 只有 jQuery，DataTables 和 SyntaxHighlighter 都 404。

把 dev 的 `cdn3rd` 改为第 6 节确认的实际位置
`http://www.jade-dungeon.cn:8081/3rd` 之后，7 个库（含 98.css）全部 200，
两条报错随之消失，`test-jade-wiki.html` 的 DataTable 也正常初始化了。

## 9. dev 配置的最终核对

`envs.js` 的 dev 段逐项探活（2026-11-01）：

| 键 | 值 | 验证 |
|----|----|------|
| `staticRoot` | `http://www.jade-dungeon.cn:8081/jadeutils.v3` | 主题 CSS、favicon 均 200 |
| `importMapRoot` | `…:8081/jadeutils.v3/scripts/ts` | `web.js` 200 |
| `apiRoot` | `http://www.jade-dungeon.cn:8088` | 5 个接口全 200，带 `Access-Control-Allow-Origin: *` |
| `cdnRoot` | `http://www.jade-dungeon.cn:8081` | 主机可达 |
| `cdn3rd` | `http://www.jade-dungeon.cn:8081/3rd` | 7 个库全 200 |

过程中纠正的三个配置错误：

| 键 | 错值 | 问题 |
|----|------|------|
| `apiRoot` | `…:8082` | 8082 是**页面服务器**（根路径返回 HTML），`/api/…` 全 404。API 在 8088 |
| `staticRoot` | `"."` | 页面在 8082、静态资源在 8081，相对路径会拼到 8082 上，取不到资源 |
| `themeRoot` | `//localhost:8081/…` | 连不上。后来这个键整个去掉了 |

### 9.1 端到端验证（真实后端，非 mock）

| 页面 | 结果 |
|------|------|
| `blog.html` | 用户名 `Jade Shan`、10 篇文章、4 条推荐、分页都渲染出来了，console 无报错 |
| `gallery.html` | 9 张相册图、分页、用户名正常 |
| `test-jade-wiki.html` | DataTable 容器生成、`<thead>` 自动补出、代码高亮渲染，console 无报错 |
| `test-jade-trpg-compose.html` | 39 个 canvas，图片经真实代理接口加载成功，无报错 |
| `test-jade-trpg-ui.html` | 无报错 |
| `test-jade-window-ui.html` | 13 个窗口元素 |
| `test-jade-cdn.html` | 无报错（`$(window).load` 修好后才真正跑起来） |
| `test-jade-blog.html` | 无报错 |

一个测试注意事项：`--virtual-time-budget=8000` 会让 `blog.html` 挂住不返回，
用 3000 正常。原因是 MathJax 的排版循环会不断推进虚拟时间。

### 9.2 后端数据里的写死地址（前端改不了）

8088 返回的用户信息里头像是写死的旧地址：

```json
"avatar": "http://47.102.120.187:8081/jadeutils.v2/themes/hobbit/images/atc-01.jpg"
```

IP 直连 + `jadeutils.v2` 路径。属于后端数据内容，记录备查。

