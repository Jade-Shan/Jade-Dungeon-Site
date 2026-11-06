// 构建期的环境配置模板。
//
// 用法：在本目录下 `cp envs.sample.js envs.js`，再按实际环境改值。
// envs.js 在 .gitignore 中，而 site-page/gulpfile.js 顶层 require("./envs")，
// 缺该文件时 site-page 的所有 gulp 任务都会挂。
//
// **这份配置归 site-page** —— 只有它的 gulpfile 读 envs，
// common-utils 的 gulp 任务全是相对自己目录的路径，不需要部署地址。
// 所以库侧单独构建不需要这个文件。见 docs/refactor-20261101.md 21.4 节。
//
// 注意 libRoot / libImportMapRoot 描述的是**库的**产物位置，
// 却配在站点侧 —— 因为只有站点的页面引用库的样式和模块。
// 库换了部署路径要来这里改。
//
// 这里的值只是示例，实际值见各自环境的 envs.js。
//
// ====================================================================
// **只维护 dev 段。rls 段不管。**
//
// 生产环境的配置永远不进本仓库 —— 生产的工作流与项目源码无关，
// 它自己提供 envs.js。所以：
//
//   - 检查、编译、测试**只针对 dev 段**
//   - rls 段里是什么值都不影响本项目，不要给它加约束
//   - 也不要因为它「看起来没填完」去补（比如它缺 libRoot /
//     libImportMapRoot 两个键，这是**有意的**，不是漏了）
//
// 见 docs/refactor-20261101.md 第 24 节。
// ====================================================================
//
// 两个容易踩的坑（只对 dev 段而言）：
//   1. 所有地址都必须带主机名。写成 "//:8081/xxx"（省略主机）不是合法 URL，
//      new URL() 会抛 Invalid URL，浏览器也解析不了
//   2. staticRoot 不要填 "."。页面与静态资源分属不同服务时（比如页面在 8082、
//      资源在 8081），相对路径会拼到页面所在的服务上，取不到资源
exports.deployEnvs = {
	dev: {
		buildversion: "dev-0.0.1-",
		webRoot: ".",
		// 静态资源（主题 CSS、图片、favicon）的根路径。
		// demo 页面的主题图片也从这里拼：@@staticRoot/themes
		staticRoot: "//cdn.example.com:8081/jadeutils.v3",
		// import map 里模块路径的基址。直接用 webroot/ 布局时，
		// 页面产物在 webroot/html/ 下、脚本产物在 webroot/scripts/ts/ 下，
		// 可填 "../scripts/ts" 回退一级；走 CDN 时填绝对地址
		importMapRoot: "//cdn.example.com:8081/jadeutils.v3/scripts/ts",
		apiRoot: "//api.example.com:8088",
		cdnRoot: "//cdn.example.com:8081",
		// 第三方库的根路径，使用处按 库名/版本/文件 往后拼
		cdn3rd : "//cdn.example.com:8081/3rd"
	},
	// rls 段：**本仓库不维护它**，生产环境自己提供 envs.js（见文件头部）。
	// 下面的值只是占位，让 `npx gulp process-html-rls` 能跑起来而已 ——
	// 不要把它当成「生产配置的模板」去填。
	rls: {
		buildversion: "rls-0.0.1-",
		webRoot: ".",
		staticRoot: "//cdn.example.com:8081/jadeutils.v3",
		importMapRoot: "//cdn.example.com:8081/jadeutils.v3/scripts/ts",
		apiRoot: "//api.example.com:8088",
		cdnRoot: "//cdn.example.com:8081",
		cdn3rd : "//cdn.example.com:8081/3rd"
	}
};

// 第三方库的版本号
//
// 原来这些版本号写死在 HTML 里（36 处，7 个库），升级要逐个页面改，
// 而且容易漏。
//
// 页面侧写 `@@cdn3rd/jquery/@@v-jquery/jquery.min.js`，
// 由 gulp-file-include 的 @@ 变量替换展开。
//
// **键名带 `v-` 前缀**，避免和 envs.js 里别的键或 HTML 里的
// `@@page-title` 这类占位符撞名。
exports.vendors = {
	'v-jquery':            "3.5.1",
	'v-bootstrap':         "3.4.1",
	'v-datatable':         "1.10.21",
	'v-syntaxhighlighter': "2.1.364",
	'v-showdown':          "1.3.0",
	'v-mathjax':           "2.7.5",
	// ⚠ 这个 "0.1.18" 是 **CDN 上的目录名**，不是 98.css 的真实版本号。
	// 实测 http://...:8081/3rd/98.css/0.1.18/style.css 的内容是
	// **0.1.21 之后**的源码版（`svg-load()` 已换成 `url()`，
	// 另多一行 `menu[role=tablist] > li { background-color }`）。
	// 所以：
	//   - 这个值**不要**跟着 package.json 的版本号改，改了会 404
	//   - 要对齐真实版本，得先在 CDN 上新建按真实版本号命名的目录
	// 本项目实际需要 **≥ 0.1.19**（`--text-color` 和 `.sunken-panel`
	// 是 0.1.19 才有的，desktop.less 和 testJadeUI.ts 用到）。
	// 详见 docs/refactor-20261101.md 20.8 节
	'v-98css':             "0.1.18",
};
