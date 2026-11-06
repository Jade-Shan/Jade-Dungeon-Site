# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 准备工作

1. 语言使用简体中文
2. 加载skill `moe-kira`
3. 切换 node 版本为 `.nvmrc`中的版本。应该是： v22.22.2
4. 根据 `package.json` 文件确定引用的包的版本。

## 项目概览

jadeutils.v3 是一个个人前端工具库，作为 CDN 静态资源部署到 nginx，同时可以打包成 npm 包 `@jade-dungeon/jade-utils` 本地安装。包含 TypeScript 通用工具库、HTML5 Canvas 2D 几何库、桌面式窗口 UI 系统、TRPG 沙盘、健身动作肌肉图，以及博客/Wiki 页面框架。CSS 主题使用 Less 编写。

## 构建命令

仓库是 npm workspaces，两个模块：`common-utils/`（公用库）和 `site-page/`（站点）。
根上的命令转发给它们。

```bash
# 使用 .nvmrc 指定的 Node 版本 (v22.22.2)
nvm use

# ── 根上的命令 ──
npm run build          # 两边都构建（先 common-utils 后 site-page）
npm run build:pkg      # 只打库的 npm 包 → common-utils/dist/
                       # **编译 site-page 之前必须先跑这个**，见下
npm test               # 跑三组测试：库 230 + 站点 52 + 架构 20
npm run test:arch      # 只跑跨两边的架构约束测试

# 全量 CDN 构建 + 分别部署到本地 nginx 的两个目标
bash build.sh          # 在 .gitignore 里，首次用 cp build.sample.sh build.sh

# ── 单独构建某一边 ──
npm run build -w common-utils      # window-ui 主题 + TS
npm run build -w site-page         # 三套内容主题 + workout/trpg/site + TS
bash common-utils/build.sh         # 同上，走脚本
bash site-page/build.sh

# ── 进到某一边跑单个 gulp 任务 ──
cd common-utils && npx gulp        # default：window-ui 主题 + TS（含压缩）
cd common-utils && npx gulp compress-typescript
cd common-utils && npx gulp process-style-window-ui

cd site-page && npx gulp          # default：全部主题 + TS（含压缩，不含 HTML）
cd site-page && npx gulp process-style-hobbit     # 另有 lo-fi / paper-print
cd site-page && npx gulp process-images-hobbit    # 只拷该主题图片
cd site-page && npx gulp process-style-workout
cd site-page && npx gulp process-style-trpg       # 纯拷图片
cd site-page && npx gulp process-style-site       # favicon
cd site-page && npx gulp include-html-dev         # HTML 模板展开，dev
cd site-page && npx gulp process-html-rls         # 只为验 processhtml 的 build 块；
                                                  # rls 段不维护，见下文
```

六个构建期注意事项：

- **从 git 新拉下来的代码要做四步准备**（详见 `README.md` 与
  `docs/refactor-20261101.md` 第 26 节）：

  ```bash
  nvm use                                        # .nvmrc 的 v22.22.2
  npm install                                    # 根上跑，建 @jade-dungeon/* 符号链接
  cp site-page/envs.sample.js site-page/envs.js  # 它在 .gitignore 里
  cp build.sample.sh build.sh                    # 想部署时才需要
  ```

  `site-page/envs.js` 缺了的话 **site-page 的**所有 gulp 任务都会挂
  （`site-page/gulpfile.js` 顶层 `require('./envs')`），报错只说找不到模块。
  **`common-utils` 不需要它** —— 库侧的 gulp 任务全是相对自己目录的路径，
  不读部署地址（见 `docs/refactor-20261101.md` 21.4 节）。
  **`common-utils/dist/` 不用手动管** —— 两道保险都会生成它：
  `npm install` 的 `prepare` 钩子、库的 `build.sh` 第一步
  （2026-11-03 改，见第 26 节）
- **`npm install` 会顺便编译库的 TypeScript** ——
  `common-utils/package.json` 的 `"prepare": "npm run build:pkg"`。
  **所以库的 TS 编译不过时，`npm install` 整体失败、`node_modules` 一个都不装。**
  从编译坏了的分支切过来想装依赖时会撞上，绕过要用
  `npm install --workspaces=false`（**`--ignore-scripts` 对 workspace 成员的
  `prepare` 不生效**，实测 npm 10.9.7）。详见 26.7 节
- **构建顺序不能反：编译 site-page 之前，库必须先 `build:pkg`。**
  `site-page` 用包名 import 库，解析链有四环，缺任何一环都编译不过：

  ```
  import { NumUtil } from '@jade-dungeon/jade-utils/basic'
      ↓  ① node_modules/@jade-dungeon/jade-utils  ← npm install 建的符号链接
      ↓                                              指向 ../../common-utils/
      ↓  ② common-utils/package.json 的 exports['./basic']
      ↓        { "types": "./dist/basic.d.ts", "default": "./dist/basic.js" }
      ↓  ③ common-utils/dist/basic.d.ts           ← **build:pkg 生成的**
      ↓  ④ tsc 拿到类型，site-page 编译通过
  ```

  **第 ③ 环是唯一需要「先构建」的** —— ①由 `npm install` 建、②在源码里，
  只有 `dist/` 是产物。`tsc` 要的是 `.d.ts`（`types` 字段），不是 `.js`。

  **走 `build.sh` 的路径不用操心**（2026-11-03 起）——
  `common-utils/build.sh` 第一步就是 `npm run build:pkg`，
  所以 `bash build.sh`（根）、`bash common-utils/build.sh`、
  `npm run build -w common-utils` 都会先把 `dist/` 生成出来。

  **只有绕过 build.sh 直接跑 gulp 时才要自己排顺序**：

  ```bash
  npm run build:pkg -w common-utils    # 先这个
  cd site-page && npx gulp             # 再这个
  ```

  漏了的话 `site-page/build.sh` 会在构建开始**之前**拦住并提示该跑什么 ——
  它按 `tsc` 真实的解析顺序查三个位置（根 `node_modules`、
  本目录 `node_modules`、兄弟目录），换依赖形态不用改。
  直接跑 `npx gulp` 绕过了这道检查，那才会撞上下面那堆报错。
- **漏了 `build:pkg` 的报错会把人带偏** —— 实测删掉 `dist/` 编译 site-page：
  **185 个错，只有 31 个是 `TS2307`（找不到模块）**，
  其余 131 个 `TS2339`「属性不存在」+ 19 个 `TS7006`「隐式 any」
  都是类型解析失败的**连带效应**。
  报错列表最前面几行是 TS2307，往下翻全是看着像「代码写错了」的东西。
  **看到成片的 TS2339 先确认 `common-utils/dist/` 在不在**，
  别一头扎进业务代码
- **用 `-w` 之前先确认符号链接在**（`ls node_modules/@jade-dungeon/`）。
  链接不在时 `npm run build:pkg -w common-utils` 解析不到 workspace，
  会**回退去跑根自己的同名 script**，自我调用成无限递归。踩过一次，
  32 分钟 fork 出 721 个进程，只能按进程组 `kill -9 -$PGID` 清。
  详见 `docs/refactor-20261101.md` 18.17 节
- `default` 任务里**只放了 `compress-typescript`，没放 `process-typescript`** ——
  后者是前者的 series 前置步骤，两个都放进 `gulp.parallel` 会让它并发跑两次，
  而 `ts.createProject` 的实例不能同时用于两次编译。切分前这里是坏的，重写 gulpfile 时修掉了
- **根 `package.json` 的 `overrides` 不要删** —— `gulp-processhtml@1.2.0`
  声明的是 `"through2": "latest"`，会装到 v5。而 through2 从 v5 起是**纯 ESM**，
  CJS 的 `require('through2')` 拿到 namespace 对象、取不到挂在 default export
  上的 `.obj`，`process-html-rls` 就报 `through.obj is not a function`。
  `overrides` 把它钉在 `^4.0.2`（最后一个 CJS 大版本）。
  详见 `docs/refactor-20261101.md` 20.9 节

## 编译配置

- **七份 tsconfig**，共享选项在根上的 `tsconfig.base.json`（`target: "ES6"`,
  `module: "ES6"`, `moduleResolution: "bundler"`, `strict: true`,
  `declaration: true`, `sourceMap: true`），各自只覆盖路径相关的项：

  | 文件 | outDir（相对自己所在目录） | 用途 |
  |------|------------------------|------|
  | `common-utils/tsconfig.json` | `webroot/scripts/ts` | 库的 CDN 构建，gulp 用 |
  | `common-utils/tsconfig.build.json` | `dist` | 库的 npm 打包，不带 sourcemap |
  | `common-utils/tsconfig.test.json` | `.test-build` | 库的单元测试 |
  | `site-page/tsconfig.json` | `webroot/scripts/ts` | 站点的 CDN 构建 |
  | `site-page/tsconfig.test.json` | `.test-build` | 站点的单元测试 |
  | `tsconfig.arch.json`（根） | `.arch-build` | 跨两边的架构约束测试 |

  `site-page` 不发 npm 包，所以没有 `tsconfig.build.json`。
  两边的 `gulpfile.js` 各自 `ts.createProject('tsconfig.json')` 复用主配置。
  **`outDir` 都是相对各自目录的** —— 根上不再有 `dist/` 或 `.test-build/`
- **`rootDir` 的两种取值是有意不同的**：

  | tsconfig | `rootDir` | 产物形状 |
  |----------|-----------|---------|
  | 主配置 / build | `src/main/ts` | 平铺，不带 `src/main/ts` 这一层 |
  | test | `.`（继承） | **保留** `src/main/ts` 和 `src/test/ts` 两棵子树 |

  CDN 和 npm 产物要平铺（消费方写 `@jade-dungeon/jade-utils/basic`，
  不该看到源码目录结构）；测试产物要保留层级，
  这样测试里的 `../../main/ts/basic.js` 在编译后仍然指得对。
  **改 `rootDir` 会同时改掉产物布局和测试的 import 路径**，两边要一起算
- **`site-page` 不配 `paths`，走符号链接** — 它用包名 import 库，由
  `npm install` 建的 `node_modules/@jade-dungeon/jade-utils → ../../common-utils/`
  解析，然后走 `exports` 的 `types` 字段找 `dist/*.d.ts`（和同名 `.js`）。
  这样解析路径和 npm 消费方完全一致；试过 `paths` 指向库源码，
  会把库文件拉进 site-page 的编译单元、落在 `rootDir` 之外，报一片 TS6059
- **这条链的代价是「site-page 依赖库的产物，不是库的源码」** ——
  改了库的 `.ts` 之后，site-page **要等 `build:pkg` 重新生成 `dist/*.d.ts`
  才看得到**。这是选符号链接 + `exports` 换来的（解析路径和 npm 消费方一致），
  不是 bug。顺序和漏跑时的报错形状见「构建命令」一节
- **两个包各自导出子路径** — `common-utils` 11 条（`./basic`、`./geo2d`、
  `./ui-window` 等）、`site-page` 14 条（`./blog`、`./sandtable`、demo 脚本等）。
  `files` 只含 `dist`。用法见 `README.md`
- **无打包器** — 不使用 Webpack/Rollup/Vite，TypeScript 编译为 ES6 模块后由浏览器原生 `<script type="module">` 直接加载
- **单元测试用 Node 内置的 `node:test`** — 零新增运行时依赖，不引入 vitest/jest（那会带来 Vite 等打包工具，与「无打包器」的原则冲突）。`npm test` 即可跑，详见下面「单元测试」一节
- **浏览器手动测试页另算** — `testJadeUtils.ts`、`testJadeUI.ts`、`testJadeTRPG.ts`、`testWorkout.ts` 是 demo/手动验证脚本，不是自动化测试。**全在 `site-page/src/main/ts/` 下**（第 18 节决定 8），通过 `site-page/src/main/html/` 下的页面在浏览器中运行

## 单元测试

```bash
npm test                     # 三组全跑：库 230 + 站点 52 + 架构 20
npm test -w common-utils     # 只跑库的
npm test -w site-page        # 只跑站点的
npm run test:arch            # 只跑跨两边的架构约束
npm run build:test -w common-utils   # 只编译，不跑
```

测试分三处：

| 位置 | 用例数 | 测什么 |
|------|-------|-------|
| `common-utils/src/test/ts/` | 230 | 库的 14 个用例文件 + `_jsdom-setup.ts` |
| `site-page/src/test/ts/` | 52 | 站点的 4 个用例文件 + `_jsdom-setup.ts`（各留一份） |
| `test/`（根） | 20 | `arch.split.test.ts` —— 跨两边的边界约束 |

- 命名为 `<模块>.<主题>.test.ts`
- 用 Node 内置的 `node:test` + `node:assert/strict`，**不装测试框架**
- 各自的 `tsconfig.test.json` 把 `src/` 和 `test/` 一起编到**自己目录下的**
  `.test-build/`（gitignore），再由 `node --test` 跑产物。
  **测的是编译产物，不是源码** —— 和 npm 消费方拿到的是同一种东西
- `.test-build/package.json` 里要有 `{"type":"module"}`，否则 Node 把 ESM 产物当 CJS 解析。
  这一步由 `build:test` 脚本自动写入，和 `build:pkg` 对 `dist/` 做的是同一件事
- **`arch.split.test.ts` 是唯一测源码而不测产物的** —— 它检查的是源码结构
  （有没有跨界的相对 import、库侧有没有全局脚本依赖、页面用对了 root、
  页面用片段不手写、库先 `build:pkg`），产物里看不出来。
  它有独立的 `tsconfig.arch.json`，输出到根上的 `.arch-build/`。
  **原来还查「指向文档的链接」，2026-11-03 删了那 2 条**（见第 27 节）

当前覆盖范围（302 个用例）：

| 模块 | 需要 jsdom |
|------|-----------|
| `basic`（NumUtil / StrUtil） | 否 |
| `dataStructure`（SimpleMap / SimpleStack / SimpleQueue） | 否 |
| `ui/geo2d`（Geo2DUtils + 四个几何类 + revolveRay） | 否 |
| `web` 的纯函数部分（校验、Base64、Unicode 转换） | 否 |
| 两套导航栏模板（`renderPlainTopNav` / `BootStrapTemplate.renderTopNav`） | 否（纯函数，只在断言 DOM 结构时用） |
| 切分边界的架构约束（`arch.split.test.ts`，**测源码不测产物**） | 否 |
| `site.config` 的导航树与主题选择器一致性 | 否 |
| `web` 的 Cookie 读写、`initCustomElements()`、懒加载 | 是 |
| `ui/webHtmlPage`（DOM 操作、分页、导航、主题切换） | 是 |
| `blog/common` 的选择器表 + `loadUserInfo` | 是（外加假 XHR） |
| `blog/common` 的摘要渲染、「展开」取全文、分页页数（`blog.article.test.ts`） | 部分（纯渲染不要，点击与翻页要，外加按 URL 分派的假 XHR + showdown 桩） |
| `blog/blog` 的 `loadRecommendArticles`：**请求 URL 与读取字段的拼写**（同上文件） | 是（假 XHR） |
| `ui/uiResource` 的注册表 + `resource` 的内置 provider | 否 |
| `workout` 的渲染逻辑（`mergePathWithStyle` 纯函数，三个 SVG 渲染函数要 document） | 部分 |
| `blog/wiki` 的 `DEFAULT_WIKI_PAGE_CONFIG` | 否 |

未覆盖：`ui/canvas`、`ui/UIWindow` 的渲染部分、`trpg/sandtable`（jsdom 不实现
`getContext('2d')`，要额外装 `canvas` 原生模块）、`blog/wiki` 的 `initWikiPage()`
（要 jQuery / MathJax / SyntaxHighlighter 三个全局库）、
`3rdLibTool` 除导航栏模板与 `ShowdownUtils` 外的部分。

**showdown 怎么桩的**：`blog.article.test.ts` 在**模块加载期**往 `globalThis`
塞一个假 `showdown`，`makeHtml` 返回 `[md]...[/md]`。两个讲究：

- 必须在模块加载期装 —— `ShowdownUtils` 把 Converter 实例缓存在模块级变量里，
  第一次调用之后就不再读全局，等用例内部再装就晚了
- 结果包成标记而不是真转 HTML，这样断言能直接看出某段文字**有没有**过 showdown。
  摘要不该过、全文该过，正是这次要盯的那条线

### jsdom 的用法

碰 DOM 的测试用 `test/_jsdom-setup.ts` 的 `withDom()`：

```typescript
import { withDom } from './_jsdom-setup.js';

test('xxx', () => {
	withDom('<div id="a"></div>', () => {
		// 这里 document / location / customElements 都可用
	});
});
```

每次调用新建一个 JSDOM，退出时还原全部被覆盖的全局，所以用例之间不会通过
document 或 cookie 互相影响。异步场景用 `withDomAsync()`。

两个注意点：

- **被测模块必须不在模块加载期求值 DOM**。本项目已经满足（`EscapeUnicode`
  挪进了 `initCustomElements()`、`initWorkItems()` 改成显式调用），所以
  jsdom 可以在用例内部按需装配，不用动态 `import()`
- **不要直接给 `globalThis.navigator` 赋值**。Node 21+ 自带只读的 `navigator`，
  赋值会抛 `Cannot set property navigator`。helper 里用的是 `Object.defineProperty`

### 写测试时的约定

- **断言当前行为，不是期望行为**。发现实现有缺陷时，照实断言并在注释里写明
  「这是现状，不是期望」，这样修实现时测试会失败，起到提醒作用
- **名字与契约不符的地方优先补测试**。已踩过两个：`checkUsername` 不允许下划线、
  `checkImageFilePostfix` 的参数要带点（叫 `postfix` 但实际收文件名）
- **回归验证不止做一次**。实现里特意写了注释说明的行为，要专门想想测没测到 ——
  `esp-unicode` 的实体替换带 `g` 标志就是这样漏掉过（单实体的用例测不出来）
- `testJadeUtils.ts` 里原有的手动测试断言是人工核对过的，可以直接当基线搬过来

## 源码架构

两边的 `src/main/ts/` 下共 21 个 `.ts` 文件（9732 行），其中 4 个 `test*.ts` 占 1897 行。
按子目录组织：根目录放基础层，`ui/`、`blog/`、`trpg/`、`workout/` 各放一类。
依赖方向严格单向、无循环。

### 基础层（无内部依赖）
- `basic.ts` — 基础工具：NumUtil（数字格式化）、StrUtil、TimeUtil、IColorRGB / ColorRGB
- `dataStructure.ts` — 数据结构：SimpleMap（顺序保留的 Map 实现）、SimpleStack、SimpleQueue

### 资源与 Web 基础
- `web.ts` — HTTP 请求（`WebUtil.requestHttp`）、Base64 图片类型定义（IBase64Img, Base64ImgType, IconSize）、图片懒加载（`lazyLoadImages`）、Cookie 读写、自定义 HTML 元素 `esp-unicode`（元素类型 `IEscapeUnicode`，实现与注册在 `WebUtil.initCustomElements()` 内，需在浏览器环境显式调用），依赖 basic 和 dataStructure
- `resource.ts` — 内置的 Base64 图标与默认桌面背景（DefaultIconGroup, JadeUIResource, `registerDefaultUIResource()`），约 310 行是 base64 数据。**是 opt-in 的**：`UIWindow.ts` 不 import 本文件，要用这套图标得显式调 `registerDefaultUIResource()`（见「窗口 UI 的资源注册表」一节）。依赖 dataStructure、web、ui/uiResource

### 几何与图形层
- `ui/geo2d.ts` — 2D 几何库：Point2D, Line2D, Rectangle2D, Circle2D, Polygon2D, Ray2D。定义 IGeo2D / GeoShape2D 接口，Geo2DUtils 提供碰撞检测、最近点计算。依赖 basic（NumUtil）
- `ui/canvas.ts` — Canvas 2D 绘图抽象：ICanvas2D 接口、CanvasShape2D 基类、ImageClip 图片裁剪、CanvasUtils，依赖 geo2d 和 web
- `ui/uiResource.ts` — 窗口 UI 的资源注册表：`IconGroup` 类型、`IUIResourceProvider` 接口、`registerUIResourceProvider()` / `getIconGroup()` / `getDesktopBackground()` / `pickIconSize()`。**只有契约，零图片数据**。依赖 web

### Web 页面层
- `ui/webHtmlPage.ts` — 通用 HTML 页面框架：PageConfig、NavTreeNode、ThemeBinding、SiteConfig、TopNavContext、TopNavRenderer 接口，WebHtmlPage 类（导航栏渲染、分页渲染、副标题、目录面板展开折叠、主题切换）。**只定义类型，不带任何站点的值、也不带 CSS 框架的 class**（见「站点配置与导航栏模板」一节）。依赖 basic 和 web
- `site.config.ts` — 本站（jade-dungeon）的站点配置 `JADE_DUNGEON_SITE`：品牌名、导航树、主题列表。**不在 `exports` 里**，和 `env.demo.ts` 一样不随 npm 包发布。依赖 ui/webHtmlPage（仅类型）
- `3rdLibTool.ts` — 第三方库封装：SyntaxHighlighterHelper, MathJaxHelper, BootStrapHelper（`initPhotoFrame` / `viewPic` / `bindImageFrame`）, DataTableHelper, ShowdownUtils。**每个类都依赖全局脚本变量**（jQuery `$`、MathJax、SyntaxHighlighter、showdown），所以按 `docs/refactor-20261101.md` 3.4 节不发包、切 workspaces 时归 site-page 项目。无内部 import
- `ui/bootstrapTemplate.ts` — `BootStrapTemplate.renderTopNav()`，Bootstrap 3 的导航栏骨架。**纯字符串拼接、零全局变量**，所以留在库侧（原来在 `3rdLibTool.ts` 里，第 18 节决定 6 / 14 拆出来）。依赖 basic（`StrUtil`）+ ui/webHtmlPage 的类型（`import type`，编译后擦除）

### 业务应用层
- `blog/common.ts` — 博客与相册共用逻辑：BlogCommon（用户信息加载、文章渲染、分页列表加载、页面框架初始化）、`normalizeApiRoot()`（规整 API 根路径）、页面选择器表 `BlogSelectors` / `DEFAULT_BLOG_SELECTORS` / `blogSelectors()`。依赖 basic、dataStructure、web、ui/webHtmlPage、3rdLibTool、site.config
- `blog/blog.ts` — 博客页面：BlogPage（推荐文章列表、用户文章分页列表），入口 `initBlogPage()`。依赖 basic、web、blog/common
- `blog/gallery.ts` — 相册页面：GalleryPage，入口 `initGalleryPage()`。依赖 blog/common
- `blog/wiki.ts` — Wiki 页面：WikiPage，入口 `initWikiPage()`（代码高亮、数学公式、DataTable、目录面板）。依赖 ui/webHtmlPage、3rdLibTool、web
- `ui/UIWindow.ts` — 桌面式窗口 UI 系统：可拖拽/缩放的窗口、Dock 任务栏、Z-index 管理、桌面配置、JadeWindowUI。依赖 dataStructure、ui/geo2d、ui/uiResource 和 web。**不依赖 resource.ts** —— 图标与背景走注册表，见「窗口 UI 的资源注册表」一节。**样式上隐式依赖 98.css**（见「主题系统」一节）
- `trpg/sandtable.ts` — TRPG 战棋沙盘：Token 管理、视野/可见性（default/glimmer/dark）、Canvas 战争迷雾、SandTableUtils。依赖 basic、ui/canvas、ui/geo2d 和 web
- `workout/workout.ts` — 健身动作肌肉图的**渲染逻辑**，242 行、不含数据：`loadMuscleSvg`、`mergePathWithStyle`、`loadPoseSvg`、`loadWorkoutMuscleSvg`、`workItems`、`initWorkItems`。数据可注入（`WorkoutData` / `DEFAULT_WORKOUT_DATA`）。构建产物需显式调 `initWorkItems()`（避免模块加载期求值 `document`）。依赖 workout/workoutData 和 workout/workoutPoseData
- `workout/workoutData.ts` — 肌肉数据与动作清单（muscleInfo, fontMuscleImgs, backMuscleimgs, strenghtWorkoutArr, StrenghtWorkout），整个文件都是数据，无内部依赖
- `workout/workoutPoseData.ts` — 14 个动作的姿势 SVG 路径（strengthPoseSvgArr），332 行纯数据，无内部依赖

### 汇总入口
- `index.ts` — `export *` 汇总全部模块，供不带子路径的 `import ... from '@jade-dungeon/jade-utils'` 使用。没有打包器做 tree-shaking，所以推荐优先用子路径导入

### 测试/Demo（编译但不互相依赖）
- `testJadeUtils.ts`、`ui/testJadeUI.ts`、`trpg/testJadeTRPG.ts`、`workout/testWorkout.ts` — 浏览器手动测试/Demo 脚本，非自动化测试。通过 `site-page/src/main/html/demo/` 下的 HTML 页面使用 `<script type="module">` 加载。`testJadeTRPG.ts` 里有 5 处写死的生产环境图片 URL

### TypeScript 声明引用
- `src/scripts/include/refTypes.d.ts` — 外部类型声明（目前为空，曾被用于 jQuery 声明）

## 模块加载方式

项目不使用打包器。在浏览器中通过两种方式加载：

### ES Module 原生加载

TS 源码之间的 import 使用 `.js` 扩展名（对应编译产物），这个写法同时满足浏览器原生 ESM 和 NodeNext 规范：

```typescript
import { NumUtil } from './basic.js';
import { SimpleMap } from './dataStructure.js';
```

### import map（HTML 页面侧）

HTML 页面不写产物路径，用包名 import，由 import map 映射到实际路径：

```javascript
import { WebUtil } from '@jade-dungeon/jade-utils/web';   // 与 npm 消费方写法一致
```

机制：

- 映射表由 `gulpfile.js` 的 `buildImportMap()` 读 `package.json` 的 `exports` 生成，
  把 `./dist/` 前缀换成 `envs.js` 的 `importMapRoot`。**不要手写第二份清单** ——
  加导出项只改 `package.json` 的 `exports` 即可
- 末尾有一条带尾斜杠的前缀键兜住 `exports` 里没列的模块（`test*.js` 等）。
  解析规则是精确键优先于前缀键
- `initCurrEnv()` 把 JSON 注入 fileinclude 的 context（`gulp-file-include` 原样插入、不转义引号）
- `site-page/src/main/html/parts/importmap.html` 输出 `<script type="importmap">` 标签，
  10 个有模块 import 的页面各 include 一次

两个硬约束：**必须在页面第一个 `<script type="module">` 之前**，且**一个文档只能有一个 import map**。
新增页面时如果已经 include 了 `parts/head.html`（内含 importmap），不要再单独 include 一次。

换 CDN 只改 `envs.js` 的 `importMapRoot` 一个值，填绝对地址即可。
落地细节与验证记录见 `docs/refactor-20261101.md` 第 9 节。

### 第三方库全局脚本

jQuery、Bootstrap、MathJax、SyntaxHighlighter、DataTables、Showdown 通过传统 `<script>` 标签加载为全局变量（`$`、`MathJax`、`SyntaxHighlighter`、`showdown`）。`3rdLibTool.ts` 在文件头部使用 `declare` 声明这些全局类型，封装为静态方法工具类：

```typescript
declare function $(cc: any): any;
declare namespace SyntaxHighlighter { ... }
declare namespace MathJax { ... }
```

**注意 jQuery 版本是 3.5.1，`declare function $(cc: any): any` 返回 `any`，所以用错 API 编译期查不出来。**
已踩过两个坑（都是 jQuery 3.0 移除的 API，运行时才抛错）：

| 不能用 | 要用 | 症状 |
|--------|------|------|
| `.size()` | `.length` | `xxx.size is not a function` |
| `$(window).load(fn)` | `$(window).on('load', fn)` | `e.indexOf is not a function`，且回调静默不执行 |

同类已移除的还有 `.bind()` / `.unbind()` / `.delegate()` / `.undelegate()` / `$.browser` / `.andSelf()`，写 jQuery 代码时留意。

## demo 页面的环境配置注入

demo / 测试脚本不写死后端和 CDN 地址，由页面从 `envs.js` 注入：

```
envs.js  →  @@变量  →  HTML 内联脚本  →  入口函数的 env 形参  →  发请求的方法
```

- `src/main/ts/env.demo.ts` 定义 `DemoEnvConfig`（`apiRoot` / `themeRoot` / `cdn3rd`）和取值函数 `demoEnv()`。**不在 `exports` 里**，不随 npm 包发布
- `DemoEnvConfig.themeRoot` 在 `envs.js` 里**没有同名键** —— 它就是 `staticRoot` 加 `/themes`，页面侧传 `'@@staticRoot/themes'` 拼出来，不另设配置项
- 入口函数签名形如 `testTrpgUI(env?: DemoEnvConfig)`，形参要继续往内层函数传
- 缺值时 `demoEnv()` 返回空串，不兜底成生产地址 —— 兜底会让「忘了传参」静默变成「偷偷打生产环境」
- `trpg/testJadeTRPG.ts` 的 `testSceneData` 刻意保持明文写死的 URL，它是改造后端时的对比样本
- **`envs.js` 只维护 `dev` 段，`rls` 段本仓库不管** ——
  生产环境的配置永远不进这个仓库，生产的工作流与项目源码无关，
  它自己提供 `envs.js`。所以：

  | | |
  |---|---|
  | ✅ 维护 `dev` 段 | 检查、编译、测试都只针对它 |
  | ❌ 不管 `rls` 段 | 里面是什么值都不影响本项目 |

  **不要给 `rls` 加约束，也不要「补全」它** —— `envs.sample.js` 的
  `rls` 段缺 `libRoot` / `libImportMapRoot` 两个键是**有意的**，不是漏了。
  架构用例只查 `dev` 段。详见 `docs/refactor-20261101.md` 第 24 节
- `npx gulp process-html-rls` **保留**，但它验的是 processhtml 的 build 块
  （`all.css` → `all.min.css`）走不走通 —— 那是**构建逻辑**，不是生产配置。
  跑它用的那组 `rls` 值只是占位

## 编译输出

**两边各自输出到自己的 `webroot/`**（第 18 节决定 12），
**各自部署到不同的 CDN 服务器,不再合并**。
`dist/` 和 `.test-build/` 也都在各模块里面。

**根目录下没有 `webroot/`** —— 原来那棵合并树在 2026-11-03 删掉了
（部署改成两个 CDN 各自独立,见 `docs/refactor-20261101.md` 22.2 节）。
`build.sample.sh` 不再合并产物,`test/arch.split.test.ts` 有一条用例盯着别恢复。

- TypeScript 编译为 ES6 模块（`target: "ES6"`, `module: "ES6"`），输出 `.js`、`.d.ts` 和 `.js.map`
  到 `<模块>/webroot/scripts/ts/`（CDN 构建）；库另有 `common-utils/dist/`
  放 `.js` + `.d.ts`（npm 打包，无 sourcemap）
- 严格模式：`noImplicitAny: true`, `strict: true`
- 压缩产物 `.min.js` 由 `compress-typescript` 任务用 uglify 生成，只在 CDN 构建里有
- Less 主题编译为合并后的 `all.css` 和 `all.min.css`。三套内容主题输出到
  `site-page/webroot/themes/blog/<theme>/styles/`，workout 到
  `site-page/webroot/themes/workout/styles/`，window-ui 到
  `common-utils/webroot/themes/window-ui/styles/`

## 目录结构

**两个模块的源码都按 Maven 风格分层**（`src/main` 放产品代码、`src/test` 放测试）：

```
<模块>/src/
├── main/
│   ├── ts/          TypeScript 源码
│   ├── themes/      Less + 图片
│   └── html/        HTML 模板（只有 site-page 有）
└── test/
    └── ts/          单元测试
```

三条要记住的：

- **产物里不带 `src/main` 这一层** —— `src/main/ts/basic.ts` 编译到
  `webroot/scripts/ts/basic.js`，`src/main/themes/blog/` 输出到
  `webroot/themes/blog/`。gulpfile 里源和产物各有一个路径常量
  （`blogThemeSrc` / `blogThemeDst`），**不要合成一个**
- **测试 import 被测代码走 `../../main/ts/xxx.js`** ——
  `tsc` 的 `rootDir: "."` 会把 `src/main/ts` 和 `src/test/ts` 两棵子树
  原样搬到 `.test-build/` 下，所以编译产物里的相对距离和源码一致
- **`@@include` 的路径是相对 gulp 的 cwd**（`basepath: '@root'`），
  所以片段写 `./src/main/html/parts/xxx.html`，不是 `./html/parts/`

| 目录 | 用途 |
|------|------|
| `common-utils/src/main/ts/` | 库的 TypeScript 源码：11 个 `.ts`（6 个在 `ui/` 下）+ `env.demo.ts` |
| `common-utils/src/main/themes/window-ui/styles/` | 窗口 UI 样式 `desktop.less`（没有 `images/` —— favicon 归 site-page） |
| `common-utils/src/test/ts/` | 库的测试：14 个用例文件 + `_jsdom-setup.ts`，230 个用例 |
| `common-utils/docs/` | **只关于库的文档**：geo.md（几何库）、design-pkg.md（npm 打包可行性）、ui-style-win98.md（窗口 UI 实现分析）、win-ui-css.md + `win98-menu/`（98.css 菜单移植）、`img-plt/`（gnuplot 图）、`uml/`（plantuml） |
| `common-utils/webroot/`、`common-utils/dist/` | 库的 CDN / npm 产物（gitignore） |
| `site-page/src/main/ts/` | site-page 项目的 TypeScript：`blog/`、`trpg/`、`workout/`、`ui/`、`include/` + 根上 4 个 |
| `site-page/src/main/themes/` | 按应用分四组：`blog/`（theme-core + hobbit / lo-fi / paper-print）、`workout/`、`trpg/`（纯图片）、`site/`（favicon）。含约 5.3 MB 图片资源 |
| `site-page/src/main/html/` | HTML 页面：`index.html`（站点入口，在根上）、`blog/`（blog / gallery 两个模板页）、`demo/`（9 个 `test-*` 演示页），外加 `parts/` 下 20 个片段 |
| `site-page/src/test/ts/` | web 的测试：4 个用例文件 + `_jsdom-setup.ts`，52 个用例 |
| `site-page/webroot/` | web 的 CDN 产物（gitignore） |
| `site-page/envs.js` | **构建期的环境配置**（gitignore，从 `envs.sample.js` 复制）。只有 site-page 的 gulpfile 读它 —— 库侧不需要 |
| `test/` | 跨两边的架构约束测试 `arch.split.test.ts`，20 个用例 |
| `docs/` | **关于 lib + web 全局或与代码无关的文档**：refactor-20261101.md（拆分方案）、plan-url-config-20261101.md（地址清理）、styles.md（两套主题系统）、tsconfig-info.md、doc-uml.md、svg-img.md、node-env-cfg.md、ssh-secure.md、study-jsx.md、`uml/`（通用 plantuml） |
| `context/` | 需求与进度记录 |

**新增文档放哪**：只讲库的放 `common-utils/docs/`，讲两边或讲环境/工具的放 `docs/`。
判断依据是「文档的主题是谁」，不是「提到了谁」—— 比如
`refactor-20261101.md` 大量提到库的文件，但它的主题是**整个拆分**，所以在 `docs/`。

**site-page 目前没有专属文档** —— 2026-11-03 逐篇查过根 `docs/` 下 9 篇,
按主题判没有一篇只属于 site-page（最像的两篇：`plan-url-config` 含库侧
`web.ts` 的实质修复、`styles.md` 含 window-ui 一节,都跨两边）。
真要加就建 `site-page/docs/`,第一个住户大概会是
「沙盘视野算法」或「wiki 初始化流程」这类**只讲站点业务**的文档。
判定过程见 `docs/refactor-20261101.md` 22.10 节。

**两棵文档树的发布待遇不同**（2026-11-03 定,见 `docs/refactor-20261101.md` 22.9）：

| 文档树 | 发不发 | 为什么 |
|-------|-------|-------|
| `common-utils/docs/` | ✅ 发 —— `site-page/build.sh` 拷进自己的 `webroot/docs/` | 讲库的用法,`html/index.html` 链接了其中 5 篇 |
| `docs/`（根） | ❌ **不发** | 讲架构与重构过程,读者是开发者,在 git 里看 |

所以**往根 `docs/` 新加的文档不能被页面链接** —— 要给访客看就放
`common-utils/docs/`。**原来有架构用例盯着这条,2026-11-03 删了**
（页面链接改成绝对 URL 之后那条用例失效,见第 27 节）—— 现在靠人记得。

## 部署

**两边各自发到不同的 CDN 服务器,不合并。** 两个模块的 `build.sh` 末尾各自 scp：

| 模块 | 目标 | 对应 envs 的 root |
|------|------|------------------|
| `common-utils` | `jadecdn/webroot/jadeutils.v5` | `@@libRoot` / `@@libImportMapRoot` |
| `site-page` | `jadecdn/webroot/jadesites.v5` | `@@staticRoot` / `@@importMapRoot` |

- **`libRoot` 和 `staticRoot` 必须填不同的值** —— 填同值就退化成合并部署,
  而且会让「用错 root」这类 bug 变得不可观测(踩过,见 19.8 节)
- 两边的 `build.sh` 都在 `.gitignore` 里,从各自的 `build.sample.sh` 复制
- 历史上有一个 `deploy-test.sh` 做部署,被 `.gitignore` 忽略,当前工作区中不存在该文件

- **`build.sample.sh` 只做两件事**：排好构建顺序（库先 `build:pkg`）、
  把两边的产物分别拷到本地 nginx 的 `jadeutils.v5` / `jadesites.v5`。
  **它不再合并产物,根上也没有 `webroot/`** ——
  恢复合并会让「用错 root」重新变成不可观测的问题,有架构用例盯着

## 编码模式

- **接口/实现分离** — geo2d、canvas、sandtable 层使用 `IXxx` 接口 + `class Xxx implements IXxx` 模式。接口定义只读契约，类提供实现和可变属性
- **`checkPointLineSide` 的符号约定与裸叉积相反**。它先把端点按 y（y 相同则按 x）
  排序，所以对点序不敏感，语义是「相对自下而上方向的侧」，且约定**左侧为负**。
  自己写叉积判定时别把两套约定混用 —— 方向已是自下而上时，两者互为相反数
- **工具命名空间** — 纯函数工具集使用 namespace 组织：`Geo2DUtils`、`CanvasUtils`、`SandTableUtils`、`JadeWindowUI`、`JadeUIResource`
- **静态方法工具类** — 基础层的 `NumUtil`、`StrUtil`、`TimeUtil`、`WebUtil` 等使用全静态方法的类
- **应用入口** — `WikiPage.initWikiPage()`、`BlogPage.initBlogPage()`、`GalleryPage.initGalleryPage()` 是页面级入口，各自组织完整页面的初始化流程。博客与相册的共用部分抽到 `BlogCommon`
- **DOM 求值推迟到方法内** — 浏览器 API（`HTMLElement`、`document`）不在模块顶层求值，而是放进需要显式调用的方法里（`WebUtil.initCustomElements()`、`initWorkItems()`），这样无 DOM 的环境（Node / SSR / 单元测试）import 不会抛 `ReferenceError`
- **路径配置集中在 envs.js** — 页面里不写死产物路径。模块路径走 import map，第三方库走 `@@cdn3rd`，主题按归属走 `@@libRoot` 或 `@@staticRoot`（见下）

## 页面引资源：按归属选 root

两个模块的产物部署到**不同路径**，所以 `envs.js` 里有两组 root：

| 变量 | 指向 | 给谁用 |
|------|------|-------|
| `@@libRoot` | 库的产物（如 `jadeutils.v5`） | `themes/window-ui/` 的样式 |
| `@@staticRoot` | site-page 的产物（如 `jadesites.v5`） | `themes/{blog,workout,trpg,site}/`、**`docs/` 下的文档链接** |
| `@@libImportMapRoot` | 库的 `scripts/ts/` | import map 里库的模块 |
| `@@importMapRoot` | site-page 的 `scripts/ts/` | import map 里 site-page 的模块 |

**`docs/` 是个特例**：文件来源是 `common-utils/docs/`，但由
`site-page/build.sh` 拷进自己的 `webroot/`、跟 site-page 的 CDN 发，
**所以按「哪一边发出去的」算，走 `@@staticRoot`**（见第 27 节）。

**判断依据是「这个文件是哪一边构建出来的」**，不是「这个页面属于哪一边」——
site-page 的页面引用库的窗口 UI 样式，那也得走 `@@libRoot`。

```html
<!-- 窗口 UI 样式是库的产物 -->
<link rel="stylesheet" href="@@libRoot/themes/window-ui/styles/all.min.css">
<!-- favicon、内容主题是 site-page 的产物 -->
<link rel="icon" href="@@staticRoot/themes/site/images/favicon.ico">
<link rel="stylesheet" href="@@staticRoot/themes/blog/hobbit/styles/all.min.css">
```

**用错了在 dev 可能看不出来** —— 两个 root 填同一个值时，哪个都能解析到。
只有真的分开部署才 404。这个坑踩过（`docs/refactor-20261101.md` 19.8 节），
所以 `test/arch.split.test.ts` 有 4 个用例直接查**源码模板**里的 `@@xxxRoot`，
按两边 `themes/` 下的实际目录名判断对不对。

## HTML 页面的组织

站点入口在 `html/` 根上，其余按用途分两组，`parts/` 下 20 个片段按需组合：

```
site-page/src/main/html/
├── index.html                                        ← 站点入口
├── blog/     blog.html  gallery.html                 ← 博客的两个模板页
├── demo/     test-*.html ×9                          ← demo / 手动验证页
└── parts/    meta-{charset,page}  favicon  importmap
             vendor-{jquery,bootstrap,bootstrap-theme,datatable,syntaxhighlighter,showdown,mathjax,98css}
             theme-{blog,window-ui,workout}
             head  footer  blog-main  side-index  side-blog-index
```

- **12 个页面全部用片段组合 `<head>`，不要手写** —— 手写的那份不跟着
  `envs.js` 的版本号走，升级库时会漏。`test/arch.split.test.ts` 有一条用例
  按「片段负责的内容特征」反查页面，手写了会失败。
  `vendor-bootstrap.html` **不含** `bootstrap-theme.min.css`，
  要的页面另外 include `vendor-bootstrap-theme.html`（只有
  `index.html` 和 `demo/test-jade-cdn.html` 要）

- **`index.html` 在根上，别的页面深一层** —— 写相对链接前先看清在哪一层。
  `parts/footer.html` 只被深一层的页面 include（`blog/` 两个 +
  `demo/test-jade-blog.html`），所以里面写 `../index.html`
- **第三方库版本号不写在页面里**，走 `envs.js` 的 `exports.vendors`（7 个键，
  `v-` 前缀）：`@@cdn3rd/@@v-jquery/jquery.min.js`。
  升级库只改 `envs.js` 一处
- **嵌套 include 不继承外层 context** —— `@@page-title` 这些是 include 的
  局部变量，不自动往下传。`head.html` 调 `meta-page.html` 时要显式递：

  ```
  @@include('./html/parts/meta-page.html', {
      "page-title": "@@page-title", "description": "@@description"
  })
  ```

  漏了不报错，`<title>` 静默变空
- **指向文档的链接走 `@@staticRoot`，不再按页面深度算 `../`**
  （2026-11-03 改，见第 27 节）：

  ```html
  <a href="@@staticRoot/docs/geo.md">链接</a>
  ```

  和 `@@staticRoot/themes/...` 同一个变量 —— 文档发到 site-page 的 CDN，
  所以按「按归属选 root」的规则走 `staticRoot`。
  **换 CDN 只改 `envs.js` 一处。**
  原来盯层数的 2 条架构用例已经删掉（一条空转、一条假通过，见 27.2 节），
  所以**改这些链接没有用例兜底了**
- **`webroot/docs/` 里装的是库的文档**,由 `site-page/build.sh` 拷：

  ```bash
  cp -r ../common-utils/docs    webroot/      # → webroot/docs/geo.md 等
  ```

  **这一步不能省** —— 那 5 条链接指向的是 `jadesites.v5/docs/`，
  也就是 **site-page 自己的 CDN**，而文件来源是 `common-utils/docs/`。
  **链接是绝对 URL 不代表不用搬**，那只是把地址写死了，
  文件还是得送到那个地址去。
  **注意没有 `common-utils/` 这一层**（这个坑踩过,见 22.9 节）
- **根 `docs/` 不发到 CDN,所以页面里不能链它** —— 那是架构与重构记录
  （`refactor-20261101.md` 等）,读者是开发者而不是站点访客,在 git 仓库里看。
  链了会 404,而且**只在部署之后才看得到**。
  原来有一条用例盯这个（只认 `common-utils/docs/`）,
  **链接改成绝对 URL 之后那条用例失效、已删** —— 现在靠人记得

## 切分边界：common-utils vs site-page

代码已经切成两块 —— `common-utils/`（公用 TypeScript 库）和 `site-page/`（站点），
npm workspaces 管理。`test/arch.split.test.ts` 钉着边界约束。

归库侧的 11 个文件：

```
basic.ts  dataStructure.ts  web.ts  resource.ts  index.ts
ui/geo2d.ts  ui/canvas.ts  ui/webHtmlPage.ts  ui/uiResource.ts
ui/UIWindow.ts  ui/bootstrapTemplate.ts
```

归 site-page 侧的 14 个：`blog/*`、`trpg/*`、`workout/*`、`site.config.ts`、
`testJadeUtils.ts`、`ui/testJadeUI.ts`、`3rdLibTool.ts`。
`env.demo.ts` 两边各留一份。

三条硬约束，**改之前先看 `test/arch.split.test.ts` 会不会失败**：

- **库侧不能 import site-page 侧的任何模块** —— 这是切分的硬前提，
  破坏了切开之后编译不过。最容易踩的是往 `index.ts` 加一行 `export *`
- **库侧不能依赖全局脚本变量**（`$` / `MathJax` / `SyntaxHighlighter` /
  `showdown`）。这是 `3rdLibTool.ts` 拆成两半的目的 ——
  纯模板函数进了 `ui/bootstrapTemplate.ts`，其余留在 `3rdLibTool.ts` 归 site-page
- **新增 `.ts` 文件要在两处登记归属**：`docs/refactor-20261101.md` 第 18 节
  和 `test/arch.split.test.ts` 的 `LIB` / `WEB` 清单。不登记那条测试会失败

`index.ts` 是**库的**汇总入口，只汇总库模块。site-page 侧的汇总入口等第 4 步
建目录时再加（决定 2：两边各一个）。

完整的 16 条决定、文件级分配、剩余步骤都在
`docs/refactor-20261101.md` 第 18 节。

## 窗口 UI 的资源注册表

`UIWindow.ts` **不 import `resource.ts`**。那个文件有 310 行 base64（27.8 KB），
直接依赖的话只想用窗口管理器的人也得下载。图标和桌面背景走
`ui/uiResource.ts` 的注册表：

```typescript
import { registerDefaultUIResource } from '@jade-dungeon/jade-utils/resource';
registerDefaultUIResource();   // 用内置的 3 组图标 + 桌面背景
```

| 不做什么 | 结果 |
|---------|------|
| 不调 `registerDefaultUIResource()` | 窗口没图标、桌面没背景图，外观交给 CSS 的 `.no-icon` |
| 不 import `resource.ts` | 产物里不含那 27.8 KB |

三条硬规则：

- **`registerDefaultUIResource()` 必须在构造窗口之前调** ——
  `UIWindowAdapter` 的 `cfg` 字段初始化时就向注册表要默认图标了。
  三个 demo 入口（`testJadeUI` 的两个、`testJadeTRPG.testTrpgUI`）都在第一行调
- **注册表取不到时返回 `undefined`，不要加兜底** ——
  兜底成某张内置图片就等于没拆。`test/uiresource.test.ts` 有三条用例盯这个
- **往 `UIWindow.ts` 里加 `import ... from "../resource.js"` 是倒退** ——
  这层依赖刚拆掉（`docs/refactor-20261101.md` 第 16.1 节）

注意注册表和 `JadeUIResource.getDefaultIcon()` 的兜底语义**相反**：
后者遇到未知名字会 warn 并退回 `ELEC_FACE`（老的公开 API，保留原样），
注册表则是「没有就是没有」。

## workout 的数据与渲染

`workout.ts` 只有渲染逻辑（242 行），数据在另两个文件：

| 文件 | 内容 |
|------|------|
| `workout/workout.ts` | `loadMuscleSvg` / `mergePathWithStyle` / `loadPoseSvg` / `loadWorkoutMuscleSvg` / `initWorkItems` |
| `workout/workoutData.ts` | 肌肉图路径 + 动作清单 |
| `workout/workoutPoseData.ts` | 14 个动作的姿势 SVG 路径（332 行） |

**不要把数据写回 `workout.ts`** —— 刚拆出去的（第 16.2 节）。数据可注入：

```typescript
initWorkItems();                        // 内置数据
initWorkItems({ workouts: myList });    // 只换动作清单
```

`initWorkItems()` 幂等（`workItems.length > 0` 就直接返回），
所以**换数据要在第一次调用时就传**，已经填过再传新数据不会重建。

`mergePathWithStyle` 是纯函数，**不能改成原地修改入参** ——
`DEFAULT_WORKOUT_DATA` 是模块级常量，被改一次整个进程的渲染结果都不对了。

数据**没有**改成 JSON：`initWorkItems()` 是同步 API，改 async 是 breaking change，
而且本项目没打包器、JSON 只能真发 HTTP 请求。理由写在 `workoutPoseData.ts` 头部。

## 站点配置与导航栏模板

`ui/webHtmlPage.ts` 是库层，**不放任何一个站点的值、也不放任何 CSS 框架的 class**。
往这个文件里加 `Jade Dungeon`、加导航项、加 `navbar-*` 都是在倒退 ——
这三样刚从里面清出去（`docs/refactor-20261101.md` 第 15 节）。

### 站点配置

```
site.config.ts 的 JADE_DUNGEON_SITE  →  initPageFrame / initWikiPage 的 site 形参
                                     →  page.renderTopNav(site, ...) / page.bindChangeTheme(site.themes)
```

- 库层只有 `SiteConfig` 接口（`brandName` / `brandLink` / `navItems` / `themes`）
- 值在 `site.config.ts`，**不在 `exports` 里**，不随 npm 包发布
- 入口函数的 `site` 形参都带默认值 `JADE_DUNGEON_SITE`、都在参数表末尾，
  所以 HTML 页面和外部 vimwiki 项目的调用都不用改
- **导航树的 `id` 与 `themes[].elemSlt` 是一一对应的**：导航项渲染出带 id 的
  `<a>`，`bindChangeTheme()` 再按选择器找它绑点击。改一边必须改另一边，
  否则主题菜单点了没反应且不报错。`test/blog.selectors.test.ts` 有一条用例盯这个

### 导航栏模板

导航栏骨架是 `TopNavRenderer`（纯函数，`TopNavContext` → HTML 字符串），两套实现：

| 模板 | 位置 | 用在哪 |
|------|------|--------|
| `WebHtmlPage.renderPlainTopNav` | 库层，`renderTopNav` 的默认值 | 零框架 class，给不用 Bootstrap 的消费方 |
| `BootStrapHelper.renderTopNav` | `3rdLibTool.ts` | 本项目的页面都用这个 |

本项目的页面是 BS3 的，所以调用处要显式传：

```typescript
page.renderTopNav(site, "#topnav", BootStrapHelper.renderTopNav);
```

**不传就会丢掉 navbar 样式**（导航栏变成没样式的裸列表）。三处调用点：
`blog/common.ts`、`blog/wiki.ts`、`testJadeUtils.ts`。

### blog 层的页面选择器

`#widget-username` 这类 id 收在 `blog/common.ts` 的 `DEFAULT_BLOG_SELECTORS` 里，
共 11 项。`BlogSelectors` 全部字段可选，`blogSelectors()` 负责合并：

```typescript
BlogCommon.loadUserInfo(apiRoot, userId, { userName: '#my-name' });
```

两个例外要记住：

- **`photoFrameId` 是元素 id，不带 `#`** —— `BootStrapHelper.initPhotoFrame()`
  自己拼 `#${id}`，带 `#` 会拼成 `##`
- **`lazyImage` 只写容器内的部分** —— 实际用的是 `${articleList} ${lazyImage}`

`loadArticleList()` 的分页回调递归调自己，**选择器要一起往下传**，
否则翻页之后退回默认选择器。

### wiki 页面的跨项目路径

`initWikiPage()` 的调用方在另一个 vimwiki 项目里。三项原来写死的值收在
`blog/wiki.ts` 的 `DEFAULT_WIKI_PAGE_CONFIG`：`apiRoot`（`/`）、
`pageTitle`（`Study Notes`）、`hlCodePath`（SyntaxHighlighter 的 brush 目录，
指向 `../../vimwiki-theme/3rd/...`）。

- **默认值现在可以改，但别顺手改** —— 下游 vimwiki 项目确定整体重构，
  不再构成兼容性约束（见 `docs/refactor-20261101.md` 18.10 节）。
  所以改这些默认值是允许的，前提是**作为重构的一部分有意识地改**，
  而不是顺手动一下。`test/wiki.config.test.ts` 有一条用例逐项比对，
  改了会失败 —— 那条失败是提醒，不是错误
- **`SyntaxHighlighterHelper.loadCodeHightlight()` 的 `hlCodePath` 是必传的** ——
  库层不该知道别人的 brush 脚本放哪。漏传时 autoloader 不报错，
  高亮只是**静默失效**，所以宁可编译期报错

## 主题系统

项目有四套独立的主题/资源体系，按「属于哪个模块」分在两边：

```
common-utils/src/main/themes/   ← 库侧
└── window-ui/styles/
    └── desktop.less            408 行。外观主要来自 98.css（可选 peer 依赖），
                                本文件只补它没有的部分 + 98.css 菜单移植

site-page/src/main/themes/      ← 站点侧
├── blog/                       三套内容主题 + 它们共用的 theme-core/
│   ├── theme-core/             variables.less（默认值）+ structure.less（结构）
│   ├── hobbit/                 各主题的 index.less 写死加载顺序
│   ├── lo-fi/
│   └── paper-print/
├── workout/                    独立：肌肉图配色（muscle.less，7 行）
├── trpg/                       独立：沙盘素材，纯图片无 Less
└── site/                       站点级资源：favicon.ico
```

**产物各自输出到自己的 `webroot/`**，`build.sh` 部署时合并：

| 源码 | 产物 |
|------|------|
| `common-utils/src/main/themes/window-ui/styles/` | `common-utils/webroot/themes/window-ui/styles/` |
| `site-page/src/main/themes/blog/<theme>/` | `site-page/webroot/themes/blog/<theme>/` |
| `site-page/src/main/themes/{workout,trpg,site}/` | `site-page/webroot/themes/{workout,trpg,site}/` |

页面引用见 `site-page/src/main/html/parts/head.html`。

### 内容主题（hobbit / lo-fi / paper-print）

定义在 `site-page/gulpfile.js` 的 `themes` 数组中，用于博客和 Wiki 页面。
采用 **theme-core（默认值 + 结构）+ part.1.less（覆盖）** 的三层模式：

```
site-page/src/main/themes/blog/
├── theme-core/
│   ├── variables.less     88 个变量的默认值（含 @asset-root）
│   ├── structure.less     474 行结构规则，只引用变量、不定义值
│   └── index.less         「只要默认外观」的独立入口
└── <theme>/styles/
    ├── index.less         ← **构建入口**，用 @import 写死加载顺序
    ├── part.1.less        只覆盖本主题关心的变量
    └── sh*.less           SyntaxHighlighter 主题
```

- **加载顺序由各主题的 `index.less` 写死，不再靠 gulp concat 的文件名排序**：

  ```less
  @import "../../theme-core/variables.less";   // 1. 默认值
  @import "./part.1.less";                     // 2. 覆盖
  @import "../../theme-core/structure.less";   // 3. 应用结构
  ```

  Less 是「最后赋值生效」，**顺序一反主题色就全失效**。
  这是 2.4 节记的坑，阶段 3 换成 `@import` 才算根治
- **gulp 只编译 `index.less` 一个入口**，产出仍叫 `all.css` / `all.min.css`，
  页面引用没变。切分前是 concat 两个 glob
- **新增主题只需覆盖想改的变量**，不用凑齐 87 个 —— 实测只定义 2 个变量
  也能编出完整的 734 行样式
- **三套主题的 `index.less` 顺序各不相同**：lo-fi 的 `green-code.less` 排在
  `part.1.less` **之前**（照搬切分前的字典序 g < p）。
  它只定义 `.syntaxhighlighter`、不碰变量，位置无关紧要，照搬是为了产物一致
- **图片路径走 `@asset-root`**，默认 `"../images"`。换 CDN 就覆盖它。
  改 `url()` 时**要保形** —— Less 保留源码的引号风格：
  `url(~"@{asset-root}/x")` 产出不带引号、`url('...')` 单引号、`url("...")` 双引号

### window-ui 主题

独立的窗口管理器 UI 样式，**归库侧**，不参与 theme-core 的变量体系：

- `common-utils/src/main/themes/window-ui/styles/desktop.less`（408 行、41 个规则块）——
  通过 `common-utils/gulpfile.js` 的 `process-style-window-ui` 编译。
  分两块：前 95 行是桌面/窗口/Dock，之后是 98.css 的菜单移植
  （调研见 `common-utils/docs/win-ui-css.md`）
- **98.css 是声明过的可选 peer 依赖**（`common-utils/package.json` 的
  `peerDependencies` + `peerDependenciesMeta.optional`）。
  实测 `UIWindow.ts` 往 DOM 上加 **13 个 class**，其中 10 个 `desktop.less`
  自己定义，`title-bar` / `title-bar-text` / `inactive` **本项目完全不定义**；
  另有 `window` / `window-body` 只出现在复合选择器里、视觉仍靠 98.css。
  **不引 98.css 窗口就没有边框和标题栏**（行为不受影响，全在 TS 里）。
  装法与加载顺序见 README
- **`UIWindow.ts` 有两个常量在复述 98.css 的尺寸** ——
  `WIN_BORDER_SIZE`（= `.window` 的 `padding: 3px` ×2，精确）和
  `WIN_BODY_PADDING`（= `.window-body` 的 `margin: 8px` ×2 + 标题栏高度，
  **后半是估值**）。换 98.css 版本时要重新量。两边都加了交叉注释。
  （0.1.18→0.1.21 这两个值没变：`padding: 3px` 和
  `--element-spacing: 8px` 两版相同）
- **98.css 有三个版本号，含义不同，不要互相「对齐」**：

  | 哪里 | 值 | 是什么 |
  |------|-----|-------|
  | `common-utils/package.json` 的 `peerDependencies` | `^0.1.19` | 真实下界。`desktop.less` 用 `--text-color`、demo 用 `.sunken-panel`，**0.1.19 才有** |
  | 根 `package.json` 的 `devDependencies` | `^0.1.21` | 本地参考副本，给移植菜单时查样式用。构建**不读**它 |
  | `envs.js` 的 `v-98css` | `0.1.18` | **CDN 上的目录名**，不是版本号 —— 那个目录里放的其实是 0.1.21 之后的源码版 |

  **`v-98css` 不要跟着 package.json 改，改了会 404。**
  要对齐得先在 CDN 上建按真实版本命名的目录。详见
  `docs/refactor-20261101.md` 20.8 节

### workout 主题

- `site-page/src/main/themes/workout/styles/muscle.less` — 肌肉图配色（7 行），通过 gulp 任务 `process-style-workout` 编译
- `site-page/src/main/themes/workout/images/` — 约 1.9 MB 图片，是所有主题里体积最大的一套

### TRPG 资源（纯图片，无 CSS）

`site-page/src/main/themes/trpg/` 仅包含 `images/` 目录下的 3 张图片（`default.jpg`、`icons.jpg`、`map.jpg`），供沙盘 Canvas 使用。无 `styles/` 目录，不参与 Less 编译。通过 gulp 任务 `process-style-trpg` 拷贝到 webroot。

### 主题切换

`WebHtmlPage.changeTheme(themeName)` 通过启用/禁用 `<link rel="alternate stylesheet">` 标签实现主题切换。当前主题持久化到 cookie（`ui.theme`），`initUITheme()` 在页面加载时读取 cookie 恢复主题。


## 排查：页面报 CORS 错误

**先确认后端进程活着，再查 CORS 配置。** 后端崩掉时浏览器报的也是 CORS 错误 ——
跨源请求失败时浏览器拿不到带 `Access-Control-Allow-Origin` 的响应，
「服务没响应」和「服务响应了但没这个头」在浏览器看来都是跨源检查没通过。
Firefox 对连不上的情况报的就是「CORS 请求未能成功」，状态码显示 `(null)`。

本项目后端的 CORS 配置已确认没问题，**遇到 CORS 报错优先怀疑后端进程崩了**，重启即可。

```bash
# 1. 后端端口有没有服务（000 = 连不上，此时的「CORS 错误」是假象，重启后端）
curl -s -o /dev/null -w "%{http_code}\n" --max-time 3 http://localhost:8082/

# 2. 确认活着之后，再看响不响 CORS 头
curl -s -D - -o /dev/null "http://localhost:8082/api/blog/loadUserById?userId=u001" \
  | grep -i access-control
```

判断依据：状态码 `(null)` / XHR `status=0` 且**后端日志里没有这条请求** → 后端没活着；
后端日志里**有**这条请求 → 请求到了，才是真的缺 CORS 头。

注意 XHR 层面「服务活着但无 CORS 头」和「端口上没有服务」的表现完全相同
（都是 `onerror` + `status=0`），光看前端代码分不出来，必须查后端日志或用 `curl` 探活。
详见 `docs/refactor-20261101.md` 第 10.6 节。

## 后端 API：原来那两个「等后端修」的问题都修完了

**这一节以前列的是「要原样保留、等后端修」的坑。2026-11-05 两个都清了** ——
后端换成本仓库的 `site-api/`，前后端在同一个仓库里，不用再互相等。

| 原来的问题 | 现在 |
|-----------|------|
| `pageCount` 比实际少 1，前端补 `pageCount + 1` | `calcPageCount()` 用 `Math.ceil`，前端的 `+ 1` **已去掉**。加回去会多出一个空白末页 |
| 路径 `loadRecommandArticles` / 字段 `recommands` 拼写错误 | 两处都改成 `loadRecommendArticles` / `recommends`，**前后端一起改的** |

所以：

- **别再「照顾」这两个坑** —— 比如看到 `recommends` 以为是写错了想改回 `recommands`，
  或者觉得分页少一页想补 `+ 1`。两个都是**改回去才会错**
- 拼写改动涉及 **URL**，不只是字段名。旧前端 `Jade-Dungeon-page` 已停用，
  改之前全盘搜过没有别的调用方
- `loadRecommendArticles` **仍然返回硬编码假数据**（这部分按决策照搬，没动）。
  要换成真查询见 `site-api/docs/todo-next.md` 的 2.3

## blog 列表的摘要与展开

后端 `site-api` 的 `api/blog/loadByUser` **不再返回正文**（实测正文平均 34.7 KB、
最长 1.3 MB，列表页带着它翻页很慢），只返回 `excerpt`。所以列表页是这样的：

```
列表（只有 excerpt）  →  点「展开」  →  api/blog/getArticle?id=N  →  全文（Markdown）
                                                                    →  showdown 转 HTML
```

三条容易踩的：

- **`excerpt` 不是 Markdown，不要过 showdown** —— 后端写入文章时就用
  `makeExcerpt()` 剥掉标记并截断到 200 字了（纯图片的文章给 `（图片）` 占位）。
  再过一遍 showdown 会把正文里残留的 `*`、`_`、`#` 当成标记吃掉。
  `renderArticleBody()` 按「有 `text` 就过 showdown、只有 `excerpt` 就只转义」分支
- **`pageCount` 直接用，不要 `+ 1`** —— 旧后端算少 1 时补过，现在加回去会多出
  一个点进去空白的末页。`teo` 的 36 篇正好是当年撞上这个 bug 的那组数据
- **三个接口返回的字段形状不一样**，所以 `UserArticle` 的 `text` / `excerpt` / `id`
  都是可选的：

  | 接口 | `id` | `excerpt` | `text` | `album` |
  |------|------|-----------|--------|---------|
  | `api/blog/loadByUser` | 有 | 有 | **无** | 无 |
  | `api/blog/getArticle` | 有 | 有 | 有 | 无 |
  | `api/gallery/loadByUser` | 有 | 无 | 有 | 有 |

  相册列表自带全文，所以 `loadArticleList()` 的 `detailUrl` 形参**只有博客页传** ——
  不传就不渲染「展开」链接。

「展开」链接的 class 是 `atc-expand`，**不在 `BlogSelectors` 里** ——
那张表记的是 `src/main/html/parts/` 下页面模板已有的结构，
这个 class 是 `blog/common.ts` 自己产自己用的。
行为由 `site-page/src/test/ts/blog.article.test.ts` 的 14 个用例盯着。



## 当前进度

当前进度记录在文件 `context/current-feature.md` 中。