Jade-Javascript-Utils
===============================

## 概述

---

## 本地开发

### 从 git 新拉下来之后的准备

四步，照着跑就能构建：

```bash
nvm use                                        # 1. 切到 .nvmrc 的 Node（v22.22.2）
npm install                                    # 2. 装依赖 + 建 workspace 符号链接
cp site-page/envs.sample.js site-page/envs.js  # 3. 它在 .gitignore 里，必须手动拷
bash build.sh                                  # 4. 先 cp build.sample.sh build.sh
```

`.gitignore` 里的这些东西，新克隆的代码里都没有：

| 缺什么 | 谁需要 | 怎么补 |
|-------|-------|-------|
| `node_modules/` 与 `@jade-dungeon/*` 符号链接 | 两边 | `npm install`（在**根上**跑，workspaces 会建链接） |
| `site-page/envs.js` | 只有 site-page | `cp site-page/envs.sample.js site-page/envs.js` |
| `common-utils/dist/`（库的 `.d.ts`） | site-page 编译要用 | **不用手动管** —— `npm install` 的 `prepare` 钩子会生成，`common-utils/build.sh` 也会再做一次 |
| 三个 `build.sh` | 想部署时 | `cp build.sample.sh build.sh`（根与两个模块各一份，按需） |

第三行那个 `dist/` 是容易踩的 —— 详见下面「构建顺序」一节。

#### ⚠ `npm install` 会编译库的 TypeScript

`common-utils/package.json` 有 `"prepare": "npm run build:pkg"`，
所以 `npm install` 会顺便编译库、生成 `dist/`。
**这意味着库的 TS 编译不过时，`npm install` 整体失败，`node_modules` 一个都不装。**

从一个编译坏了的分支切过来、想装新依赖时会撞上。绕过的办法：

```bash
npm install --workspaces=false   # ✅ 跳过 workspace 的 prepare，只装根上的依赖
npm install --ignore-scripts     # ❌ 没用 —— 对 workspace 成员的 prepare 不生效
```

#### 关于 `site-page/envs.js`

`site-page/envs.js` 在 `.gitignore` 中（各环境的地址不同，不入版本控制），
而 `site-page/gulpfile.js` 顶层就 `require("./envs")`。
**缺这个文件时 site-page 的所有 gulp 任务都会挂**，
报错信息只提示找不到模块，不会说清该怎么办。

**只有 site-page 需要它** —— `common-utils` 的 gulp 任务全是相对自己目录的路径，
不读部署地址，所以库侧单独构建不需要这个文件。

拷完按实际环境改里面的值。两个容易填错的地方：

- **所有地址都要带主机名。** 写成 `//:8081/xxx`（省略主机）不是合法 URL，
  `new URL()` 会抛 `Invalid URL`，浏览器也解析不了
- **`staticRoot` 不要填 `"."`。** 页面与静态资源分属不同服务时（比如页面在 8082、
  资源在 8081），相对路径会拼到页面所在的服务上，取不到资源

只维护 `dev` 段，`rls` 段本仓库不管（生产的配置不进这个仓库）。

### 常用命令

```bash
nvm use                      # 切到 .nvmrc 指定的 Node 版本（v22.22.2）
npm test                     # 跑单元测试（库 230 + 站点 52 + 架构 20）
npm run build:pkg            # 构建 npm 包到 common-utils/dist/
bash build.sh                # 两边 CDN 构建 + 分别部署（先 cp build.sample.sh build.sh）
```

### ⚠ 构建顺序：库必须先 `build:pkg`

`site-page` 用**包名**（`@jade-dungeon/jade-utils/basic`）import 库，
解析链是：

```
node_modules/@jade-dungeon/jade-utils      ← npm install 建的符号链接
  → common-utils/package.json 的 exports
    → common-utils/dist/basic.d.ts         ← build:pkg 生成的
```

前两环现成（一个由 `npm install` 建、一个在源码里），
**只有 `dist/` 是产物**，而且它在 `.gitignore` 里 ——
**从 git 新拉下来的代码里没有它**。

**走 `build.sh` 的话不用操心**：`common-utils/build.sh` 自己第一步就是
`npm run build:pkg`，所以下面三条命令都会先把 `dist/` 生成出来：

```bash
bash build.sh                      # 根上，编排两边
bash common-utils/build.sh         # 只构建库（dist/ + webroot/）
npm run build -w common-utils      # 同上
```

**只有绕过 build.sh 直接跑 gulp 时才要自己注意**：

```bash
npm run build:pkg -w common-utils    # 先这个，生成 dist/*.d.ts
cd site-page && npx gulp             # 再编译站点
```

漏跑的话 `site-page/build.sh` 会**在构建开始之前**拦住并告诉你跑什么：

```
!!! 库的 dist/*.d.ts 不存在，site-page 编译不过。
    先跑这个：
      bash ../common-utils/build.sh          # 它自己会先 build:pkg
```

这道检查按 `tsc` 真实的解析顺序找三个位置（根 `node_modules`、
本目录 `node_modules`、兄弟目录），所以换依赖形态也不用改。

另外：**改了库的 `.ts` 之后要重跑 `build:pkg`，site-page 才看得到** ——
它依赖的是库的产物而不是源码。

漏跑的话报错会把人带偏：实测 185 个错里只有 31 个是
`TS2307`（找不到模块），其余是 131 个 `TS2339`「属性不存在」+
19 个 `TS7006`「隐式 any」—— 全是类型解析失败的连带效应，
看着像业务代码写错了。**成片 TS2339 先确认 `common-utils/dist/` 在不在**。

构建命令的完整清单见 `CLAUDE.md` 的「构建命令」一节。

---

## 作为 npm 包使用

包名 `@jade-dungeon/jade-utils`，纯 ESM，需 Node 18+ 或支持原生 ESM 的打包器。
目前只用于本地安装，未发布到公开 npm registry。

### 安装

先在本项目生成 tarball：

```bash
nvm use                    # 切到 .nvmrc 指定的 v22.22.2
npm run build:pkg          # 编译 common-utils/dist/ 并生成其 package.json
npm pack -w common-utils   # 得到 jade-dungeon-jade-utils-3.0.0.tgz
```

再到使用方项目安装：

```bash
npm install ../Jade-Javascript-utils/jade-dungeon-jade-utils-3.0.0.tgz
```

开发期联调可以改用 `npm link`，本项目改动即时生效：

```bash
npm link                                    # 在本项目执行
cd ../other-project
npm link @jade-dungeon/jade-utils
```

### 导入方式

推荐按子路径导入，只加载用到的模块：

```typescript
import { NumUtil, StrUtil } from '@jade-dungeon/jade-utils/basic';
import { SimpleMap }        from '@jade-dungeon/jade-utils/data';
import { Point2D }          from '@jade-dungeon/jade-utils/geo2d';
```

也可以从汇总入口导入（会加载全部模块，无打包器 tree-shaking 时体积更大）：

```typescript
import { NumUtil, SimpleMap, Point2D } from '@jade-dungeon/jade-utils';
```

### 子路径一览

| 子路径 | 对应源文件 | 主要导出 | 运行环境 |
|--------|-----------|---------|---------|
| `.` | `index.ts` | 以下全部 | 取决于实际用到的模块 |
| `/basic` | `basic.ts` | `NumUtil`、`StrUtil`、`TimeUtil`、`ColorRGB` | 任意 |
| `/data` | `dataStructure.ts` | `SimpleMap`、`SimpleStack`、`SimpleQueue` | 任意 |
| `/geo2d` | `ui/geo2d.ts` | `Point2D`、`Line2D`、`Rectangle2D`、`Circle2D`、`Polygon2D`、`Ray2D`、`Geo2DUtils` | 任意 |
| `/web` | `web.ts` | `WebUtil`（HTTP 请求、Base64 图片） | 浏览器 |
| `/ui-resource` | `ui/uiResource.ts` | `IconGroup`、`IUIResourceProvider`、`registerUIResourceProvider`、`pickIconSize` | 任意（只有接口，零图片数据） |
| `/resource` | `resource.ts` | `DefaultIconGroup`、`JadeUIResource`、`registerDefaultUIResource` | 浏览器，**含 27.8 KB base64** |
| `/canvas` | `ui/canvas.ts` | `ICanvas2D`、`CanvasShape2D`、`ImageClip`、`CanvasUtils` | 浏览器 |
| `/ui-window` | `ui/UIWindow.ts` | `UIDesktop`、`DockBar`、`JadeWindowUI` | 浏览器 |
| `/web-html-page` | `ui/webHtmlPage.ts` | `WebHtmlPage`、`PageConfig`、`SiteConfig`、`NavTreeNode`、`ThemeBinding`、`TopNavRenderer` | 浏览器 |
| `/sandtable` | `trpg/sandtable.ts` | `SandTable`、`CircleToken`、`RectangleToken`、`LineToken` | 浏览器 |
| `/bootstrap-template` | `ui/bootstrapTemplate.ts` | `BootStrapTemplate`（BS3 导航栏模板，纯函数） | 任意（零全局变量） |
| `/3rd-lib-tool` | `3rdLibTool.ts` | `SyntaxHighlighterHelper`、`MathJaxHelper`、`BootStrapHelper`、`DataTableHelper`、`ShowdownUtils` | 浏览器 + 全局脚本 |
| `/blog` | `blog/blog.ts` | `BlogPage` | 浏览器 |
| `/wiki` | `blog/wiki.ts` | `WikiPage` | 浏览器 |
| `/workout` | `workout/workout.ts` | `workItems`、`initWorkItems`、`loadMuscleSvg`、`mergePathWithStyle`、`loadPoseSvg` | 浏览器 |
| `/workout-data` | `workout/workoutData.ts` | `muscleInfo`、`fontMuscleImgs`、`backMuscleimgs`、`strenghtWorkoutArr` | 任意 |
| `/workout-pose` | `workout/workoutPoseData.ts` | `strengthPoseSvgArr` | 任意 |

「任意」= 零 DOM 依赖，Node / SSR / 单元测试里都能直接 import。

### 需要显式初始化的功能

有两处为了避免模块加载期求值 DOM 而改成了按需调用，用之前必须先初始化，
否则自定义标签不生效、数组为空：

```typescript
import { WebUtil } from '@jade-dungeon/jade-utils/web';
// 注册 <esp-unicode> 自定义标签，页面里已有的该标签会在注册时被 upgrade
WebUtil.initCustomElements();

import { workItems, initWorkItems } from '@jade-dungeon/jade-utils/workout';
// 构建所有动作的肌肉图，不调用则 workItems 为空数组
initWorkItems();
console.log(workItems.length);
```

两个方法都是幂等的，重复调用无副作用。

### 窗口 UI 的图标：按需加载

`/ui-window` 不依赖 `/resource`。那个子路径有 27.8 KB base64 图标，
只想要窗口管理器的话不会被连带下载 —— 代价是**默认没有图标和桌面背景**。

想用内置的那套，显式注册：

```typescript
import { registerDefaultUIResource } from '@jade-dungeon/jade-utils/resource';
import { UIDesktop } from '@jade-dungeon/jade-utils/ui-window';

// 必须在构造窗口之前调：窗口的默认图标是构造时向注册表取的
registerDefaultUIResource();
const desktop = new UIDesktop(document.getElementById('desk')!);
```

想用自己的图标，实现 `IUIResourceProvider`：

```typescript
import {
	registerUIResourceProvider, IconGroup,
} from '@jade-dungeon/jade-utils/ui-resource';

registerUIResourceProvider({
	// name 省略时返回默认图标；不认识的名字返回 undefined
	getIconGroup: (name) => myIcons[name ?? 'default'],
	getDesktopBackground: () => myWallpaper,
});
```

什么都不注册也能跑：窗口的图标位会带上 `.no-icon` class，
桌面不设置 `background-image`，外观交给 CSS。

### 页面框架：站点配置与导航栏模板

`/web-html-page` 不带任何站点的值，也不带任何 CSS 框架的 class。
导航栏要两样东西：一份 `SiteConfig`，和一个产出骨架 HTML 的模板函数。

```typescript
import { WebHtmlPage, SiteConfig } from '@jade-dungeon/jade-utils/web-html-page';

const site: SiteConfig = {
	brandName: "My Site",
	brandLink: "/",
	navItems: [
		{ title: "Home", link: "/" },
		{ title: "More", subs: [{ title: "Github", link: "//github.com/me/", isNewWin: true }] },
	],
	// elemSlt 要对上 navItems 里某个子项的 id
	themes: [{ elemSlt: "#switch-theme-dark", themeName: "dark" }],
};

const page = new WebHtmlPage({ apiRoot: "/", pageTitle: "Home", subTitle: "", ajaxTimeout: 500 });
page.renderTopNav(site);          // 默认模板：语义结构，零框架 class
page.bindChangeTheme(site.themes);
```

默认模板产出 `a.nav-brand` + `ul.nav-list`（子菜单是 `ul.nav-sub`），样式自己写。
想换骨架就传第三个参数：

```typescript
// 用 Bootstrap 3 的话，本库带了一份现成的
import { BootStrapTemplate } from '@jade-dungeon/jade-utils/bootstrap-template';
page.renderTopNav(site, "#topnav", BootStrapTemplate.renderTopNav);

// 或者自己写，拿到的是渲染所需的全部输入
page.renderTopNav(site, "#topnav", (ctx) =>
	`<h1>${ctx.brandName}</h1>` + ctx.items.map(i => `<a href="${i.link}">${i.title}</a>`).join(''));
```

自己写模板时记得转义 —— 库里两份实现都过 `StrUtil.escapeHtml`。

### `/ui-window` 需要 98.css（可选 peer 依赖）

窗口 UI 的**外观**来自 [98.css](https://jdan.github.io/98.css/)。
`UIWindow.ts` 往 DOM 上加 13 个 class，其中 3 个（`title-bar`、
`title-bar-text`、`inactive`）本项目完全不定义，另有 `window` / `window-body`
只在复合选择器里出现、视觉仍靠 98.css。

所以它声明成**可选的 peer 依赖**：

```json
"peerDependencies":     { "98.css": "^0.1.19" },
"peerDependenciesMeta": { "98.css": { "optional": true } }
```

下界是 **0.1.19**，实测出来的：`desktop.less` 用到 `--text-color`、
demo 用到 `.sunken-panel`，这两样 0.1.18 及更早都没有。

标 `optional` 是因为**不装也能跑** —— 拖拽、缩放、最小化、Dock 栏的行为
全在 TS 里，98.css 只管边框和标题栏的样子。

**但不装的话窗口没有边框和标题栏，看起来像坏了。** 要装：

```bash
npm install 98.css
```

然后在页面里引入它（放在本项目的 `window-ui` 主题样式**之前**，
那套样式里有依赖 98.css 的 CSS 变量如 `--dialog-blue`）：

```html
<link rel="stylesheet" href="node_modules/98.css/dist/98.css">
<link rel="stylesheet" href=".../themes/window-ui/styles/all.min.css">
```

### 第三方全局依赖

`/3rd-lib-tool` 包装的是传统 `<script>` 标签加载的全局变量
（`$`、`MathJax`、`SyntaxHighlighter`、`showdown`），不是 npm 包。
使用方需自行用 `<script>` 引入这些库，否则调用时报
`ReferenceError`。装了 npm 版 jQuery 并用 `import $ from 'jquery'` 的项目，
这层包装会错位，建议直接用 npm 包而不走这个子路径。

### 不随包分发的内容

Less 主题（`src/themes/`，含 5.3 MB 图片）不在 npm 包里，`files` 只含 `dist`。
主题仍走 CDN 引用，构建流程见下方「构建命令」。

目录按应用分四组，产物同构：

| 源码 | 产物 | 说明 |
|------|------|------|
| `src/themes/blog/comm.less` | （concat 进各主题） | 三套内容主题共用的结构层 |
| `src/themes/blog/<theme>/` | `webroot/themes/blog/<theme>/` | hobbit / lo-fi / paper-print |
| `src/themes/window-ui/` | `webroot/themes/window-ui/` | 窗口 UI 样式 + 站点 favicon |
| `src/themes/workout/` | `webroot/themes/workout/` | 肌肉图配色 |
| `src/themes/trpg/` | `webroot/themes/trpg/` | 沙盘素材，纯图片无 Less |

### 许可证

GPLv3（见 [LICENSE](LICENSE)）。GPL 有传染性：使用本库的项目分发时也须以
GPL 兼容协议开源。仅内部使用、不对外分发则不受此约束。

---

## 源文件依赖关系树

```
basic.ts                          (无依赖)
dataStructure.ts                  (无依赖)

3rdLibTool.ts                     (第三方库用全局声明，无内部 import)

bootstrapTemplate.ts              (BS3 导航栏模板，纯函数)
└── basic.ts                      (StrUtil，用于转义)
    (另 import type webHtmlPage.ts 的 NavTreeNode / TopNavContext，编译后擦除)

geo2d.ts
└── basic.ts

web.ts
├── basic.ts
└── dataStructure.ts

uiResource.ts                     (资源注册表，只有接口无数据)
└── web.ts

resource.ts                       (内置图标，27.8 KB base64，opt-in)
├── dataStructure.ts
├── web.ts
└── uiResource.ts → web.ts

webHtmlPage.ts
├── basic.ts
└── web.ts

site.config.ts                    (本站配置，不在 exports 里)
└── webHtmlPage.ts                (仅 SiteConfig 类型)

canvas.ts
├── geo2d.ts → basic.ts
└── web.ts → basic.ts, dataStructure.ts

UIWindow.ts                       (注意：不依赖 resource.ts)
├── dataStructure.ts
├── geo2d.ts → basic.ts
├── uiResource.ts → web.ts
└── web.ts → basic.ts, dataStructure.ts

sandtable.ts
├── basic.ts
├── canvas.ts → geo2d.ts, web.ts
├── geo2d.ts → basic.ts
└── web.ts → basic.ts, dataStructure.ts

blog.ts
├── basic.ts
├── web.ts → basic.ts, dataStructure.ts
├── webHtmlPage.ts → basic.ts, web.ts
├── site.config.ts → webHtmlPage.ts
├── bootstrapTemplate.ts → basic.ts
└── common.ts → 上述全部 + 3rdLibTool.ts

wiki.ts
├── web.ts → basic.ts, dataStructure.ts
├── webHtmlPage.ts → basic.ts, web.ts
├── site.config.ts → webHtmlPage.ts
├── bootstrapTemplate.ts → basic.ts
└── 3rdLibTool.ts （全局声明，无内部 import）

── 测试/Demo 文件 ──
testJadeUtils.ts → basic, dataStructure, web, geo2d, webHtmlPage, bootstrapTemplate, 3rdLibTool, canvas
testJadeUI.ts    → resource → dataStructure + web
testJadeTRPG.ts  → basic, resource → dataStructure + web
```

### 依赖层级

| 层 | 文件 | 说明 |
|----|------|------|
| L0 基础 | `basic.ts`, `dataStructure.ts`, `3rdLibTool.ts` | 零内部依赖 |
| L1 核心 | `geo2d.ts`, `web.ts` | 仅依赖 L0 |
| L2 资源 | `uiResource.ts`, `resource.ts`, `webHtmlPage.ts`, `site.config.ts` | 依赖 L0+L1 |
| L3 图形 | `canvas.ts` | 依赖 geo2d + web |
| L4 应用 | `UIWindow.ts`, `sandtable.ts`, `blog.ts`, `wiki.ts` | 依赖 L0~L3 |
| L5 测试 | `testJade*.ts` | 依赖所有上层 |

与 `gulpfile.js` 中的编译顺序一致。

---

## 后端 API 的两个历史问题（都已修）

前后端现在同在一个仓库（后端是 `site-api/`），原来「等后端修」的两处 2026-11-05 一起清了：

| 原来的问题 | 现在 | 注意 |
|-----------|------|------|
| `loadByUser` 的 `pageCount` 少 1 | `Math.ceil` 算页数，前端的 `pageCount + 1` 已去掉 | 补回 `+ 1` 会多出一个空白末页 |
| `loadRecommandArticles` / `recommands` 拼写错误 | 改成 `loadRecommendArticles` / `recommends` | **URL 也改了**，不只是字段名 |

两处都是**改回旧写法才会出错**。`loadRecommendArticles` 仍返回硬编码假数据，这部分没动。

### blog 列表改成返回摘要（2026-11-05）

`api/blog/loadByUser` 不再返回正文，只返回 `excerpt`（纯文本摘要，200 字上限）。
列表页显示摘要 + 一个「展开」链接，点了才去 `api/blog/getArticle?id=N` 取全文，
由 showdown 把 Markdown 转成 HTML 替换掉这一项。

**`excerpt` 已经不是 Markdown 了，不要再过 showdown** ——
后端写入文章时就剥掉标记了，再转一次会把正文里残留的 `*`、`_`、`#` 当标记吃掉。

---




列表风格
===================

TODO-LIST：
- [x] `[x]` is `.done0`
- [ ] `[ ]` is `.done0`
- [.] `[.]` is `.done1`
- [o] `[o]` is `.done2`
- [O] `[O]` is `.done3`
- [X] `[X]` is `.done4`


提交说明
===================

developing

* :tada:                      `:tada:`                     Initial commit.
* :construction:              `:construction:`             Work in progress.
* :hankey:                    `:hankey:`                   Writing bad code that needs to be improved.
* :sparkles:                  `:sparkles:`                 Introducing new features.
* :lipstick:                  `:lipstick:`                 Updating the UI and style files.
* :zap:                       `:zap:`                      Improving performance.
* :alien:                     `:alien:`                    Updating code due to external API changes.
* :rewind:                    `:rewind:`                   Reverting changes.

testing

* :white_check_mark:          `:white_check_mark:`         Adding tests.
* :chart_with_upwards_trend:  `:chart_with_upwards_trend:` Adding analytics or tracking code(Performance).
* :paw_prints:                `:paw_prints:`               Adding analytics or tracking code(Logic).

refactor

* :art:                       `:art:`                      Improving structure / format of the code.
* :truck:                     `:truck:`                    Moving or renaming files.
* :fire:                      `:fire:`                     Removing code or files.
* :hammer:                    `:hammer:`                   Heavy refactoring.

bugfix

* :pencil2:                   `:pencil2:`                  Fixing typos.
* :rotating_light:            `:rotating_light:`           Removing linter warnings.
* :bug:                       `:bug:`                      Fixing a bug.
* :lock:                      `:lock:`                     Fixing security issues.
* :ambulance:                 `:ambulance:`                Critical hotfix.

configuration

* :wrench:                    `:wrench:`                   Changing configuration files.
* :globe_with_meridians:      `:globe_with_meridians:`     Internationalization and localization.
* :package:                   `:package:`                  Updating compiled files or packages.
* :heavy_plus_sign:           `:heavy_plus_sign:`          Adding a dependency.
* :heavy_minus_sign:          `:heavy_minus_sign:`         Removing a dependency.
* :arrow_up:                  `:arrow_up:`                 Upgrading dependencies.
* :arrow_down:                `:arrow_down:`               Downgrading dependencies.

documents

* :pencil:                    `:pencil:`                   Comments in code.
:qa

* :memo:                      `:memo:`                     Writing docs.
* :page_facing_up:            `:page_facing_up:`           Adding or updating license.

version

* :bookmark:                  `:bookmark:`                 Releasing / Version tags.
* :twisted_rightwards_arrows: `:twisted_rightwards_arrows:`Merging branches.

deploy

* :construction_worker:       `:construction_worker:`      Adding CI build system.
* :green_heart:               `:green_heart:`              Fixing CI Build.
* :rocket:                    `:rocket:`                   Deploying stuff.

plantform

* :apple:                     `:apple:`                    Fixing something on macOS.
* :penguin:                   `:penguin:`                  Fixing something on Linux.
* :checkered_flag:            `:checkered_flag:`           Fixing something on Windows.
* :whale:                     `:whale:`                    Work about Docker.
