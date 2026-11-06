# 把 7.css 的菜单移植到 98.css（保留 Win98 外观）

> 配套文件：[98-menu.css](./98-menu.css)（可直接用的样式表）、[demo.html](./demo.html)（浏览器打开即可验证）
> 背景调研见 [../win-ui-css.md](../win-ui-css.md)

## 一、移植策略：机制照搬，外观重做

7.css 的菜单可以干净地切成两层，这是移植可行的前提：

| 层 | 内容 | 移植处理 |
|---|---|---|
| **交互机制层** | `tabindex` + `:focus` / `:focus-within` + `:has(~ :hover)` + `display:none/block` + 绝对定位 | **100% 照搬**，与视觉无关 |
| **视觉层** | Aero 渐变、圆角、玻璃高亮、投影、图标槽凹槽线 | **全部替换**为 98.css 的零件 |

HTML 结构、`role` 属性、`.can-hover` / `.has-divider` / `aria-disabled` 这些 API 全部保持一致，所以两套样式表可以互换而不用改标记。

## 二、两套视觉语言的映射表

这是移植的核心工作量。98.css 的立体感全靠**多层 `inset box-shadow` 模拟 1px 凹凸边框**，而 7.css 靠渐变 + 圆角 + 投影。

| 部位 | 7.css（Win7 Aero） | 98-menu.css（Win98） |
|---|---|---|
| 菜单栏底色 | 五段 `linear-gradient` | `var(--surface)` 纯 silver |
| 菜单栏项高亮 | `background:#39f; color:#fff` | `var(--dialog-blue)` 深蓝 + 白字 |
| 弹出面板边框 | `border:1px solid #0006` + `box-shadow:4px 4px 3px -2px` 投影 | `var(--border-raised-outer), var(--border-raised-inner)` 双层凸起，**无投影** |
| 菜单项圆角 | `border-radius:3px` | 无圆角 |
| 菜单项高亮 | `--w7-li-bg-hl` 玻璃渐变 + `--w7-li-bd-hl` 边框 | `var(--dialog-blue)` 满幅蓝条 + 白字 |
| 左侧图标槽 | 28px + `::before` 画凹槽竖线 | 20px 纯空白（**Win98 没有这条竖线**） |
| 禁用项 | `opacity:.5` | `color:var(--button-shadow)` + `text-shadow:1px 1px 0 var(--button-highlight)` 浮雕灰字 |
| 勾选标记 | 22×22 高亮方框 + 勾号 | 裸勾号 `\2714` / 4px 圆点，**无方框** |
| 分隔线 | `inset 0 1px #00000026, inset 0 -1px #fff` | `inset 0 1px var(--button-shadow), inset 0 -1px var(--button-highlight)` 同思路，换成 98 的色 |
| 字体 | `9pt Segoe UI` | 继承 98.css 的 `Arial 12px` / `Pixelated MS Sans Serif` |

可直接复用的 98.css 变量：`--surface`、`--button-face`、`--button-highlight`、`--button-shadow`、`--window-frame`、`--dialog-blue`、`--text-color`、`--border-raised-outer/inner`、`--border-sunken-outer/inner`。

## 三、移植时踩到的 5 个坑

这些是从 7.css 直接抄会出问题的地方，也是这份实现与 7.css 的刻意差异。

### 1. `all: unset` 会把 `position: relative` 一起清掉

`li[aria-haspopup]` 既要当子菜单的定位锚点（`position:relative`），又要被 `all:unset` 清掉 98.css 的 `<button>` 行头。`all:unset` 会把前面 `ul [role=menuitem]{position:relative}` 设的值一并重置成 `static`，于是子菜单和箭头会相对更外层的祖先定位而飞走。

```css
ul[role='menu'] > [role='menuitem'][aria-haspopup='true'] {
  all: unset;
  position: relative; /* ← 必须在 all:unset 之后重新声明 */
  display: flex;
}
```

7.css 原文也是这么处理的，照抄时容易漏掉这一行。

### 2. 需要 `all: unset` 的原因不同

7.css 清的是自家 `<button>` 的 `::before/::after` 光泽（所以它额外写了 `content:none` 去抵消）；98.css 的 `<button>` 是**纯 box-shadow 实现**，没有伪元素，但有个更阴险的 `color: transparent` + `text-shadow: 0 0 #222`（用来做像素字渲染）。不清掉的话菜单项文字会直接**变透明消失**。反过来，98.css 版不需要 `content:none`。

### 3. 箭头与分隔线不能抢同一个伪元素

7.css 让 `[aria-haspopup]::after` 画箭头、`.has-divider::after` 画分隔线。同一个 `li` 同时带这两者时，两条规则命中同一伪元素，箭头的 `border` 和分隔线的 `height/box-shadow` 会叠加，箭头变形。

这份实现把**箭头挪到 `::before`**，分隔线留在 `::after`，两者互不干扰。demo 里的「缩放」项就是这个组合。

### 4. 分隔线要画在 li 的边界之外，且间距要算准

Win98 的蓝色高亮条只包住文字行，不会吃掉分隔线。做法是用 `margin-bottom` 撑开 li 外的空隙，再用负 `bottom` 把线画进这段空隙：

```css
ul [role='menuitem'].has-divider { margin-bottom: 7px }
ul [role='menuitem'].has-divider::after {
  position: absolute;
  bottom: -5px;  /* 高 2px → 占 li 底边下方 3~5px */
  height: 2px;
}
/* 下一项从 7px 开始 → 线的上下各留空隙，不会被下一项的蓝条压到 */
```

⚠️ 像素要对齐：若 `margin-bottom` 小于「`|bottom|` + `height`」，下一项高亮时蓝条会压掉高光那 1px。

另外伪元素必须 `position:absolute` —— 因为 `li[aria-haspopup]` 本身是 `display:flex`，静态伪元素会变成 flex item 把布局挤歪。

### 5. 弹出面板要重置 `color`

菜单栏父项高亮时 `color` 变白，而弹出面板是灰底，不重置的话子菜单文字会继承白色**在灰底上看不见**。7.css 用 `color: initial` 解决，这里用语义更明确的 `color: var(--text-color)`。

## 四、顺手修掉的 7.css 副作用

7.css 的让位规则（消解 `:focus` 粘滞的那两条）**没有限定在 `.can-hover` 内**：

```css
/* 7.css 原文，注意选择器开头没有 .can-hover */
ul [role=menuitem]:focus:has(~ [role=menuitem]:hover) > [role=menu] { display: none }
```

后果：在**不带** `.can-hover` 的菜单里（只能点击展开），点开一项后鼠标掠过它后面的兄弟项，已展开的菜单会被意外收起，而那个兄弟项又不会展开 —— 菜单凭空消失。

这份实现把两条让位规则都限定在 `ul.can-hover` 下。非 `can-hover` 模式只有 focus 一个触发源，单一焦点天然不会冲突，不需要让位。

## 五、用法

```html
<link rel="stylesheet" href="98.css" />
<link rel="stylesheet" href="98-menu.css" />  <!-- 必须在 98.css 之后 -->
```

HTML 与 7.css 完全一致：

```html
<div class="window">
  <div class="title-bar">…</div>
  <ul role="menubar" class="can-hover">
    <li role="menuitem" tabindex="0" aria-haspopup="true">
      文件(F)
      <ul role="menu">
        <li role="menuitem"><a href="#">新建 <span>Ctrl+N</span></a></li>
        <li role="menuitem" class="has-divider"><a href="#">保存</a></li>
        <li role="menuitem" aria-disabled="true"><a href="#">粘贴</a></li>
        <li role="menuitem">
          <input type="checkbox" id="mi-sb" checked />
          <label for="mi-sb">状态栏</label>
        </li>
      </ul>
    </li>
  </ul>
  <div class="window-body">…</div>
</div>
```

支持的 API：

| 标记 | 作用 |
|---|---|
| `tabindex="0"` | **必需**（在需要展开子菜单的项上），纯 CSS 开合的开关 |
| `aria-haspopup="true"` | 渲染右侧三角箭头 |
| `class="can-hover"`（根 `ul`） | 启用悬停展开 |
| `class="has-divider"` | 该项下方画 etched 分隔线 |
| `aria-disabled` | 浮雕灰字 + 不响应鼠标 |
| 子 `<span>` | 靠右显示的快捷键文字 |
| 子 `<img>` | 左侧图标 |
| 子 `<input type=checkbox/radio>` + `<label>` | 勾号 / 圆点标记 |

可调变量（在 98-menu.css 的 `:root`，可被使用方覆盖）：

```css
:root {
  --menu-gutter: 20px;              /* 左侧标记槽宽度 */
  --menu-arrow-gutter: 16px;        /* 右侧箭头槽宽度 */
  --menu-highlight-bg: var(--dialog-blue);
  --menu-highlight-text: var(--button-highlight);
}
```

想要 IE4 风格的菜单栏 hot-tracking（凸起边框而非蓝底），把第 2 节的高亮规则换成 `box-shadow: var(--border-raised-outer)` 即可，注释里有标注。

## 六、验证状态与已知局限

**验证情况**：CSS 语法、括号配对、选择器结构、伪元素定位组合已用脚本校验通过；本机没有可用的 Chromium/Firefox（node 也是 v10，跑不了项目的 prettier/stylelint），**未做浏览器实机渲染**。像素级间距是按盒模型推算的，首次在浏览器打开 demo.html 时建议重点核对三处：分隔线上下间距、箭头垂直居中、勾号/圆点与文字的对齐。

**继承自 7.css 的局限**（本次未解决，需要 JS）：

1. **依赖 `:has()`** —— Chrome 105+ / Safari 15.4+ / Firefox 121+。老浏览器里多个子菜单会同时展开。
2. **无键盘方向键导航** —— `Tab` 能走，`↑ ↓ → ←` 无效。
3. **无「点击外部自动关闭」** —— 必须点页面别处让 `<li>` 失焦才收起。
4. `aria-disabled` 项因 `pointer-events:none` 完全不可聚焦，屏幕阅读器仍可读到，但鼠标无任何反馈。

Win98 真实行为里菜单还需要「点菜单栏项打开、再点一次关闭」的 toggle，纯 CSS 做不到（`:focus` 无法切换），这也是要补 JS 的地方。
