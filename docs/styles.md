# 样式代码结构分析

> 最后核对：2026-11-02（切 workspaces 之后）。本文的行数、张数、行号都是实测值。

## 一、总体架构：四套独立的主题/资源体系

切 workspaces 之后（见 [refactor-20261101.md](refactor-20261101.md) 第 18 节）
样式按归属分到两个项目里，**由两份 gulpfile 分别构建**：

```
common-utils/themes/                        ← 库侧：只有窗口 UI 样式
└── window-ui/
    └── styles/
        └── desktop.less           ← 408 行。原来是自包含的 70 行，
                                      现在并入了 98.css 的菜单移植（见第四节）
                                      注意：没有 images/ —— favicon 归 site-page 了

site-page/themes/                        ← site-page 侧：内容主题 + 业务资源
├── blog/                          ← 三套内容主题共用 theme-core/，所以装在一起
│   ├── theme-core/                ← 阶段 3 从 comm.less 拆出来的两层
│   │   ├── variables.less             150 行，88 个变量的默认值（含 @asset-root）
│   │   ├── structure.less             474 行，结构规则（原 comm.less，内容未改）
│   │   └── index.less                 「只要默认外观」的独立入口
│   ├── hobbit/                    ← 内容主题 ①：霍比特/古典羊皮纸
│   │   ├── images/                    33 张
│   │   └── styles/
│   │       ├── index.less             ← **构建入口**，用 @import 写死加载顺序
│   │       ├── part.1.less            127 行，覆盖变量 + 19 处 @asset-root 引用
│   │       ├── shCoreDefault.less     328 行，SyntaxHighlighter 核心样式
│   │       └── shThemeDefault.less    117 行，SyntaxHighlighter 默认主题
│   ├── lo-fi/                     ← 内容主题 ②：绿色 CRT 终端风
│   │   ├── images/                    31 张
│   │   └── styles/
│   │       ├── part.1.less            127 行
│   │       └── green-code.less        SyntaxHighlighter 绿色终端主题
│   └── paper-print/               ← 内容主题 ③：纸墨印刷风
│       ├── images/                    30 张
│       └── styles/                    与 hobbit 同构（见第三节的同质化问题）
├── workout/                       ← 独立体系 ②：健身肌肉图配色
│   ├── images/                        约 1.9 MB，所有主题里最大的一套
│   └── styles/
│       └── muscle.less                7 行
├── trpg/                          ← 纯图片资源（无 CSS）
│   └── images/                        default.jpg, icons.jpg, map.jpg
└── site/                          ← 站点级资源（无 CSS）
    └── images/
        └── favicon.ico            ← 原在 window-ui/images/ 下，
                                      第 18 节的决定 13 挪过来的
```

**「四套」指的是**：内容主题（三个一套，共用 `theme-core/`）、window-ui、workout、
trpg。`site/` 只有一个 favicon，算资源不算主题。

产物同构，各自输出到两个 `webroot/`：

| 源码 | 产物 |
|------|------|
| `common-utils/themes/window-ui/styles/` | `common-utils/webroot/themes/window-ui/styles/` |
| `site-page/themes/blog/<theme>/` | `site-page/webroot/themes/blog/<theme>/` |
| `site-page/themes/{workout,trpg,site}/` | `site-page/webroot/themes/{workout,trpg,site}/` |

`build.sh` 部署时把两个 `webroot/` 合并到同一棵树上。

## 二、内容主题的变量驱动模式（核心设计）

阶段 3（2026-11-02）之后是**三层**：默认值 → 覆盖 → 结构。
原来是 `comm.less` + `part.1.less` 两层加 gulp concat。

### 构建流程

每个主题只编译一个入口 `index.less`（`site-page/gulpfile.js` 第 34-80 行的
`themes.forEach`）：

```
theme-core/variables.less  ──┐  1. 88 个变量的默认值
<theme>/part.1.less        ──┤  2. 覆盖想改的（Less「最后赋值生效」）
<theme>/sh*.less           ──┤  3. SyntaxHighlighter 主题
theme-core/structure.less  ──┘  4. 474 行结构规则，应用上面的变量
                                 ↓ less() → all.css → minify → all.min.css
```

顺序写在 `index.less` 里的显式 `@import` 中：

```less
@import "../../theme-core/variables.less";
@import "./part.1.less";
@import "../../theme-core/structure.less";
```

关键点：

- **顺序必须是 variables → 覆盖 → structure。** Less 是「最后赋值生效」，
  一反主题色就全失效
- **不再用 concat。** 切分前是 concat 两个 glob，顺序靠文件名字典序凑 ——
  那套做法下 `comm.less` 一旦开始定义默认值就会反过来盖掉主题的值
  （2.4 节记的坑）。换 `@import` 之后顺序由文件内容决定
- **三套主题的顺序各不相同**：lo-fi 的 `green-code.less` 排在 `part.1.less`
  **之前**（照搬切分前的 g < p 字典序）。它只定义 `.syntaxhighlighter`、
  不碰变量，位置无关紧要，照搬是为了产物逐字节一致、便于验证
- 产出仍叫 `all.css` / `all.min.css`（用 `rename`），**页面引用一行没改**
- **新增主题只需覆盖想改的变量**，不用凑齐 87 个 —— 实测只定义 2 个变量
  也能编出完整的 734 行样式

### theme-core/variables.less（150 行）：88 个变量的默认值

默认值取 **hobbit 的值** —— 它是页面上的默认主题（`rel="stylesheet"`，
另两套是 `rel="alternate stylesheet"`）。

比 `structure.less` 用到的 87 个多一个，多的是 `@asset-root`：

```less
@asset-root:  "../images";    // 图片根路径，换 CDN 时覆盖它
```

主题里的 57 处图片引用全部走它。**改 `url()` 时要保形** ——
Less 会保留源码的引号风格：

| 源码写法 | 产出 |
|---------|------|
| `url(~"@{asset-root}/x")` | `url(../images/x)` 不带引号 |
| `url('@{asset-root}/x')` | `url('../images/x')` 单引号 |
| `url("@{asset-root}/x")` | `url("../images/x")` 双引号 |

### theme-core/structure.less（474 行）：纯变量引用的结构样式

原来叫 `comm.less`，阶段 3 挪进 `theme-core/`，**内容一字未改**，
只加了文件头。定义所有 HTML 元素的结构/布局，
但**所有视觉属性（颜色、字体、背景图、阴影）都通过 Less 变量引用**，
自身不定义任何变量值，所以不能独立编译。覆盖范围：

### part.1.less（127 行）：各主题的变量值定义

阶段 3 之前每个主题的 `part.1.less` 都定义全部 98 个变量。现在只需覆盖想改的，
但三套既有主题仍保持全量定义（没动它们，产物才能逐字节比对）。
实测 **98 个变量**，文件里用 `// 组名` 注释分成 14 组（下表的变量数逐组数过，
合计正好 98）：

| 变量组 | 变量数 | 起始行 | 控制内容 |
|--------|--------|-------|---------|
| `// layout` | 6 | 1 | 最小屏宽、body/main 宽高边距圆角 |
| `// background` | 6 | 9 | 页面/主体背景图、边框图、阴影色 |
| `// head banner` | 3 | 17 | 横幅标题色、描述色、背景图 |
| `// foot` | 5 | 22 | 页脚文字色、链接色、背景图 |
| `// widget` | 4 | 29 | 侧栏分割线色、边框色、内外阴影 |
| `// toc` | 8 | 35 | 目录面板背景/文字色、展开/收起图标 |
| `// titles` | 19 | 45 | h1~h6 颜色/背景/阴影 + 装饰线图/间距 + 字体 |
| `// article` | 5 | 66 | 文章标题色、元数据色、图片虚线色、内容背景 |
| `// text` | 12 | 73 | 主文字色、引用块、字体族、图案分隔线 |
| `// todo` | 5 | 88 | 五种 TODO 状态图标 |
| `// table` | 9 | 95 | 表格边框/表头/单元格/奇偶行/悬停色 |
| `// paging` | 6 | 106 | DataTables 分页按钮的启用/禁用/当前色 |
| `// code` | 8 | 114 | 行内代码颜色/背景/边框/阴影/尺寸/偏移 |
| `// math-jax` | 2 | 124 | MathJax 公式背景色和前景色 |
| **合计** | **98** | | |

## 三、三个内容主题的视觉对比

| 设计维度 | hobbit | lo-fi | paper-print |
|---------|--------|-------|-------------|
| **主文字色** | `#333` 深灰 | `#22DD22` 荧光绿 | `#333` 深灰 |
| **标题字体** | 汉仪寒冰曲 (书法) | 点点宋体方 | Crimson Text (衬线) |
| **h1 背景** | 透明 | `#7FFF00` 亮绿底 | 透明 |
| **h1 装饰线** | SVG ornate-border | PNG ornate-border | SVG ornate-border |
| **h1 上下装饰间距** | 5.25rem / 3.25rem | 0 / 0 (无装饰) | 5.25rem / 3.25rem |
| **正文字体** | 系统无衬线栈 | 系统无衬线+动感宋体 | Georgia 衬线为首选 |
| **代码高亮主题** | 白底默认 (shCoreDefault) | 绿底黑字 (green-code) | 白底默认 (shCoreDefault) |
| **表格表头** | `#349C49` 绿 | `#228B22` 森林绿 | `#349C49` 绿 |
| **分页按钮激活色** | `#337ab7` 蓝 | `#00FF00` 纯绿 | `#337ab7` 蓝 |
| **设计风格** | 古典羊皮纸/霍比特 | 绿色 CRT 终端复古 | 古典纸墨印刷 |

表里的变量名对应关系（核对时用）：主文字色 `@text-color-main`、
标题字体 `@title-big-font-family`、h1 背景 `@title-color-bg-h1`、
装饰线 `@h1-up-down-img`、装饰间距 `@h1-pd-before` / `@h1-pd-after`、
表头 `@table-color-th-bg`、分页色 `@paging-link-color-fb-act`。

> **注意**：hobbit 和 paper-print 的 `part.1.less` **几乎完全相同** ——
> 实测 127 行里只差 **4 个变量**（`@main-bordr-shadow`、`@title-big-font-family`、
> `@text-font-family-nomal`、`@text-font-family-quote`）。
> 它们还共享完全相同的 SyntaxHighlighter 主题文件。
> lo-fi 则是一个完全不同的设计方向。

## 四、window-ui 主题（独立体系，归库侧）

`common-utils/themes/window-ui/styles/desktop.less`，**408 行、41 个规则块**，
不参与 theme-core 的变量体系。构建时 concat 后编译（`common-utils/gulpfile.js` 第 32 行）。

**它从 70 行长到 408 行**，多出来的是 98.css 的菜单移植
（调研见 [common-utils/docs/win-ui-css.md](../common-utils/docs/win-ui-css.md)，
落地代码见 [common-utils/docs/win98-menu/](../common-utils/docs/win98-menu/)）。
现在分成两块：

### 4.1 桌面与窗口（原有部分，第 1-95 行）

- `.desktop` — 桌面容器（`overflow: hidden`）
- `div.desktop>div.window>div.window-body` — 窗口主体（允许文本选择）
- `.title-bar-icon-text` / `.title-bar-icon` — 标题栏图标文字（flex 布局）
- `.title-bar-icon.no-icon` / `.menu-item.no-icon` — **没有图标时的退化外观**。
  资源注册表没注册 provider 时 `UIWindow.ts` 会加这个 class，
  标题栏把那 12px 宽度收掉、Dock 画一个空方块。见 refactor-20261101.md 16.1 节
- `.title-bar-controls>button` — 标题栏控制按钮（pointer 光标）
- `.dock-content` / `.dock-bar` — 底部 Dock 任务栏（flex 居中、毛玻璃 blur、圆角）
- `.dock-bar>.menu-item` — Dock 菜单项（CSS 变量 `--i` 控制缩放比例）
- `.dock-bar>.gap` — Dock 分隔间隙
- `.cannot-select` — 禁止文本选择

Dock 栏用 CSS 自定义属性 `--i` 实现图标缩放，悬停时平滑过渡；
用 `backdrop-filter: blur(20px)` 做毛玻璃。

### 4.2 菜单系统（第 96-408 行，从 7.css 移植）

98.css **完全没有**菜单系统 —— `role="menubar"` / `role="menu"` /
`role="menuitem"` / `.can-hover` 这一整套是 7.css 独有的，而且 **0 行 JavaScript**，
全靠 CSS 选择器实现开合。这部分把机制照搬、外观重做成 Win98 风格。

涉及的选择器（约 26 个规则块）：`ul[role='menubar']`、`ul[role='menu']`、
`[role='menuitem']`（含 `:focus-within` / `[aria-haspopup]` / `[aria-disabled]` /
`.has-divider` 几种状态）、`ul.can-hover [role='menuitem']:hover`，
外加 `input[type=checkbox|radio]` + `label::before/after` 做勾选标记。

**这一节引入了 window-ui 唯一的变量体系** —— 第 97-107 行的 `:root` 块：

```less
:root {
  --menu-gutter: 20px;          /* 菜单项左侧留给勾选标记 / 图标的宽度 */
  --menu-arrow-gutter: 16px;    /* 右侧留给子菜单箭头的宽度 */
  --menu-highlight-bg: var(--dialog-blue);        /* Win98 选中项：深蓝底白字 */
  --menu-highlight-text: var(--button-highlight);
}
```

注意最后两个变量引用的 `--dialog-blue` / `--button-highlight`
**由 98.css 提供**，不在本文件里 —— 这是 window-ui 对 98.css 隐式依赖的一部分
（`UIWindow.ts` 还依赖它的 `window` / `title-bar` 等 class，见 CLAUDE.md）。

## 五、workout 主题（独立体系，归 site-page 侧）

`site-page/themes/workout/styles/muscle.less` 只有 **7 行** —— 肌肉图的三档发力配色
（`muscle-primary` / `muscle-minor` / `muscle-extra`）。
由 `site-page/gulpfile.js` 第 80 行的 `process-style-workout` 编译。

它配套的 `images/` 约 **1.9 MB，是所有主题里体积最大的一套**。

这几个 class 由 `site-page/src/workout/workout.ts` 的 `mergePathWithStyle()`
往 SVG 路径上套，见 refactor-20261101.md 16.2 节。

## 六、纯资源目录（无 CSS）

两个目录没有 `styles/`，不参与 Less 编译，gulp 任务只做图片拷贝
（清空目标目录后复制）：

| 目录 | 内容 | gulp 任务 | 用途 |
|------|------|----------|------|
| `site-page/themes/trpg/images/` | `default.jpg`、`icons.jpg`、`map.jpg` | `process-style-trpg`（`site-page/gulpfile.js` 第 103 行） | 沙盘 Canvas |
| `site-page/themes/site/images/` | `favicon.ico` | `process-style-site`（第 111 行） | 站点 favicon，10 个页面引用 |

`site/` 是切 workspaces 时新建的分组 —— favicon 原来放在
`window-ui/images/` 下，但它是**站点级资源**、和窗口 UI 无关，
所以挪出来单独一组（refactor-20261101.md 的决定 13）。

严格说这两个不算「主题」，放在 `themes/` 下是因为构建流程顺手。
`trpg/` 该归 `assets/` 更准确，这一条记在 refactor-20261101.md 17.6 节，未处理。

## 七、发现的问题

### 已修掉的

1. ~~**重复变量赋值**：`@table-color-th-bg-img` / `@table-color-td-bg-img`
   在三套主题里都被赋值两次，Less 后赋值覆盖前者，导致 `comm.less` 的
   `rounded-company` 和 `rounded-q4` 实际用同一张图。~~ ——
   **已不存在**（2026-11-02 核对）。这四个变量和 `comm.less` 里对应的
   `rounded-*` 选择器都没有了，实测三套主题**零重复赋值**（各 98 个变量）。

### 仍然存在的

2. **hobbit 与 paper-print 同质化**：两个主题的 `part.1.less` 127 行里
   **只差 4 个变量** —— `@main-bordr-shadow`（黑 vs 白）、
   `@title-big-font-family`（有无「汉仪寒冰曲」）、
   `@text-font-family-nomal`（无衬线栈 vs Georgia 衬线栈）、
   `@text-font-family-quote`。视觉区分度很低。

3. **图片资源冗余**：三套内容主题各维护一份 `images/`（33 / 31 / 30 张）。
   实测 **29 张同名**，其中 **25 组内容逐字节相同**，冗余占用约 **1.3 MB**。
   典型的有 `bg.jpg`、`banner.png`、`pattern.gif`、`bgcontent.gif` 等。

4. **SyntaxHighlighter 样式冗余**：hobbit 和 paper-print 的
   `shCoreDefault.less`（各 328 行）+ `shThemeDefault.less`（各 117 行）
   **内容完全相同**，却各存了一份副本。

5. **window-ui 的变量体系只覆盖菜单部分**（原记「无变量体系」，已部分改善）：
   第 4.2 节引入的 `:root` 块定义了 4 个 CSS 自定义属性，但只管菜单。
   桌面、窗口、Dock 那部分（第 4.1 节）的颜色和尺寸仍然硬编码在样式里 ——
   想换配色还是得改源文件。
   另外那 4 个变量里有 2 个引用 98.css 的 `--dialog-blue` / `--button-highlight`，
   所以**换配色还要考虑 98.css 那一层**。

### 与拆分相关的

6. **`trpg/` 和 `site/` 不是「主题」**，放在 `themes/` 下是构建流程顺手 ——
   前者是沙盘素材、后者是站点 favicon，都没有 CSS。
   记在 refactor-20261101.md 17.6 节，留到阶段 4 处理。

7. **两份 gulpfile 都有一段编译 Less 的逻辑**。切分时选的是「各一份」
   （决定 15），接受这份重复。公共逻辑抽出来需要先把 gulpfile 从
   任务定义式重构成函数式，见 refactor-20261101.md 18.9 节。
