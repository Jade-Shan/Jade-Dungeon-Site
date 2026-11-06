# 7.css 菜单栏 / 弹出菜单实现剖析（对比 98.css）

> 调研对象：`https://unpkg.com/7.css`（v0.21.1）与 `https://unpkg.com/98.css`
> 结论先说：98.css **完全没有**菜单系统，`role="menubar"` / `role="menu"` / `role="menuitem"` / `.can-hover` / `aria-haspopup` 这一整套是 7.css 独有的，且 **0 行 JavaScript**，全靠 CSS 选择器实现开合。
>
> 第一～八节剖析 7.css 的实现；**第九节记录移植到 98.css 的要点**，落地代码见 [win98-menu/](./win98-menu/)。

## 一、两库差异对照

| 特性 | 98.css | 7.css |
|------|--------|-------|
| `ul[role=menubar]` 菜单栏 | ❌ 无 | ✅ 有 |
| `ul[role=menu]` 弹出菜单 | ❌ 无 | ✅ 有 |
| `li[role=menuitem]` 菜单项 | ❌ 无 | ✅ 有 |
| `.can-hover` 悬停触发 | ❌ 无 | ✅ 有 |
| `aria-haspopup="true"` 子菜单箭头 | ❌ 无 | ✅ 有 |
| `.has-divider` 分隔线 | ❌ 无 | ✅ 有 |
| `aria-disabled` 禁用项 | ❌ 无 | ✅ 有 |
| `menu[role=tablist]` 标签页 | ✅ 有（作用于 `> li`） | ✅ 有（改为作用于 `button`） |

98.css 中唯一含 `menu` 字样的规则是 `menu[role=tablist]`，那是**标签页（Tabs）**，和菜单无关。

7.css 的继承链是：`98.css` → `XP.css` → `7.css`，菜单是在 7.css 这一层才补上的能力。

## 二、约定的 HTML 结构

容器用 `ul`、项用 `li`，子菜单是 `li` 内部再嵌一个 `ul role="menu"`：

```html
<ul role="menubar" class="can-hover">
  <li role="menuitem" tabindex="0" aria-haspopup="true">
    File
    <ul role="menu">
      <li role="menuitem"><a href="#">Open <span>Ctrl+O</span></a></li>
      <li role="menuitem" class="has-divider"><a href="#">Save</a></li>
      <li role="menuitem" aria-disabled="true"><a href="#">Paste</a></li>
      <li role="menuitem" tabindex="0" aria-haspopup="true">
        Zoom
        <ul role="menu">   <!-- 三级、四级也行，规则是递归的 -->
          <li role="menuitem"><button>Zoom In</button></li>
        </ul>
      </li>
    </ul>
  </li>
</ul>
```

各属性/类名的分工：

| 标记 | 作用 |
|------|------|
| `role="menubar"` | 横向菜单条（flex 布局 + Aero 渐变底） |
| `role="menu"` | 竖向弹出面板（绝对定位，默认 `display:none`） |
| `role="menuitem"` | 菜单项，同时提供 `position:relative` 作为子菜单定位锚点 |
| `tabindex="0"` | **关键**。让 `<li>` 可聚焦，这是纯 CSS 开菜单的开关；用 `<a>` 包裹内容可达到同样效果 |
| `aria-haspopup="true"` | 仅负责渲染右侧的小三角箭头 |
| `class="can-hover"` | 放在**根 `ul`** 上，额外启用 hover 触发（默认只有点击/聚焦才展开） |
| `class="has-divider"` | 该项之后画一条水平分隔线 |
| `aria-disabled` | 禁用该项（半透明 + 不响应鼠标） |
| 子元素 `<img>` | 菜单项左侧图标 |
| 子元素 `<span>` | 靠右显示的快捷键文字（如 `Ctrl+O`） |

## 三、核心机制：`:focus` + `:focus-within` 代替 JS

基础重置：

```css
ul[role] { cursor: default; list-style: none; margin: 0; padding: 0 }
```

子菜单默认隐藏，靠两条伪类打开：

```css
/* 默认隐藏 */
[role=menuitem] ul[role=menu] {
  display: none; left: 0; position: absolute; top: 100%; z-index: 99;
}

/* 打开：自己被聚焦，或者后代被聚焦 */
ul [role=menuitem]:focus        > [role=menu],
ul [role=menuitem]:focus-within > [role=menu] { display: block }
```

机制拆解：

1. 点击带 `tabindex="0"` 的 `<li>` → 它拿到 `:focus` → 子菜单 `display:block`；
2. 鼠标移进子菜单、点击里面的 `<a>` → 焦点转移到 `<a>` 身上，此时父 `<li>` 已不满足 `:focus`，但满足 **`:focus-within`** → 菜单保持展开；
3. `:focus-within` 会一路冒泡到所有祖先 `<li>`，所以**三级、四级嵌套自动成立**，不需要额外写层级规则。这是整套设计最巧妙的地方。

`.can-hover` 只是在此基础上**叠加**一个触发源：

```css
ul.can-hover [role=menuitem]:hover > [role=menu] { display: block }
```

## 四、用 `:has()` 修掉「焦点粘滞」

纯 CSS 方案有个经典坑：`:focus` 是**粘性**的。点开 `File` 后焦点一直留在 `File` 上；鼠标再移到 `Edit`，`Edit` 因 `:hover` 展开，而 `File` 因 `:focus` **也还展开着** → 两个弹层同时出现。

7.css 用 `:has(~ …)` 做了**双向让位**：

```css
/* A. 被 focus 的项，若它「后面」有兄弟正被 hover → 自己收起来 */
ul [role=menuitem]:focus:has(~ [role=menuitem]:hover)        > [role=menu],
ul [role=menuitem]:focus-within:has(~ [role=menuitem]:hover) > [role=menu] { display: none }

/* B. 被 hover 的项「后面」的 focus 兄弟 → 也收起来 */
ul.can-hover [role=menuitem]:hover ~ [role=menuitem]:focus        > [role=menu],
ul.can-hover [role=menuitem]:hover ~ [role=menuitem]:focus-within > [role=menu] { display: none }
```

因为兄弟选择器 `~` 只能向后选，所以必须 A、B 两条配对：

- A 管「focus 在左、hover 在右」
- B 管「hover 在左、focus 在右」

合起来等价于「**只要有任意兄弟正被 hover，被 focus 的那个就让位**」。

高亮颜色也做了同一套让位，否则会出现两个蓝色高亮项：

```css
ul[role=menubar] > [role=menuitem]:focus  ~ [role=menuitem]:focus,
ul[role=menubar] > [role=menuitem]:hover  ~ [role=menuitem]:focus-within,
ul[role=menubar] > [role=menuitem]:hover:has(~ [role=menuitem]:hover),
/* …同类组合若干… */
{ background: transparent; color: inherit }
```

⚠️ 代价：**依赖 `:has()`**（Chrome 105+ / Safari 15.4+ / Firefox 121+）。老浏览器里会出现双菜单同时展开。

## 五、弹出层定位

```css
/* 一级：从菜单栏项的正下方掉下来 */
[role=menuitem] ul[role=menu] { position: absolute; top: 100%; left: 0; z-index: 99 }

/* 二级及以后：从父项右侧飞出 */
ul[role=menu] [role=menuitem] > [role=menu] { left: 100%; top: -4px }

/* 定位上下文 */
ul[role=menubar] > [role=menuitem] { padding: 6px 10px; position: relative }
ul [role=menuitem]                 { position: relative }
```

`top: -4px` 用于抵消父面板的 `padding: 2px` + `border: 1px`，让子菜单第一项与父项在视觉上对齐。

## 六、视觉细节（Win7 味道的来源）

| 效果 | 实现手法 |
|------|----------|
| 菜单栏 Aero 渐变 | `linear-gradient(#fff 20%, #f1f4fa 25%, #f1f4fa 43%, #d4dbee 48%, #e6eaf6)`，五段硬转折 |
| 菜单栏项高亮 | `:hover / :focus / :focus-within` → `background:#39f; color:#fff; outline:none` |
| 弹出面板 | `border:1px solid #0006` + `box-shadow:4px 4px 3px -2px #00000080` + `min-width:150px` + `padding:2px` |
| **左侧图标槽竖线** | `ul[role=menu]:before` 一个 `width:2px` 的绝对定位块，`left:var(--w7-mn-left)`（28px），用 `box-shadow:inset 1px 0 #00000026, inset -1px 0 #fff` 做「凹 1px + 凸 1px」立体线，并 `pointer-events:none` 不挡鼠标 |
| 菜单项本体 | 对 `a / button / label / li[aria-haspopup]` 一律 `all:unset` 清光原生样式，再重建为 `display:flex; justify-content:space-between; padding:4px 10px 4px 32px; white-space:nowrap; width:100%`。左侧 32px 留给图标，`space-between` 让 `<span>Ctrl+O</span>` 自动靠右 |
| 项 hover 玻璃高亮 | `background:var(--w7-li-bg-hl)`（即 `linear-gradient(#fff9, #e6ecf5cc 90%, #fffc)`）+ `border-color:var(--w7-li-bd-hl)` + `border-radius:3px`。平时保留 `border:1px solid transparent` 占位，避免 hover 时布局抖动 |
| 子菜单箭头 | `li[aria-haspopup=true]:after` 用经典 border 三角：`border:4px solid transparent; border-left-color:currentcolor` |
| 分隔线 `.has-divider` | `:after` 高 2px，`box-shadow:inset 0 1px #00000026, inset 0 -1px #fff`，`margin-left:var(--w7-mn-left)` 让它从图标槽之后才开始 |
| 禁用项 | `li[aria-disabled] { opacity:.5; pointer-events:none }` —— 顺带把 hover 展开子菜单也一起禁掉了 |
| 菜单项图标 | `li img { position:absolute; left:2px; top:50%; transform:translateY(-50%); z-index:1; pointer-events:none }` |
| 勾选 / 单选项 | `input` 直接 `display:none`，靠 `label:before` 画 22×22 高亮方框（`content` 仅在 `:checked` 时给 `""`，未选中则不渲染）；radio 用 `radial-gradient(circle at 75% 25%, #d5d4ea, #333583)` 画小球；checkbox 复用全局的 `content:"\2714"` 勾号，只把位置挪进图标槽 |
| 抹掉 button 干扰 | `ul[role=menu] > li > button:after`、`… > button:hover:before` 置 `content:none`。7.css 的全局 `<button>` 靠 `::before/::after` 做边框光泽，在菜单里必须清掉，否则与菜单项高亮打架 |

相关 CSS 变量：

```css
:root {
  --w7-mn-left: 28px;                                          /* 图标槽宽度 */
  --w7-li-bd-hl: #aaddfa;                                      /* 高亮边框 */
  --w7-li-bg-hl: linear-gradient(#fff9, #e6ecf5cc 90%, #fffc); /* 高亮玻璃底 */
  --w7-surface: #f0f0f0;                                       /* 面板底色 */
}
```

## 七、已知局限

1. **依赖 `:has()`**，Firefox 121 以下会出现多个子菜单同时展开。
2. **没有键盘方向键导航**：`Tab` 能走，但 `↑ ↓ → ←` 无效，需要自行补 JS。
3. **没有「点击外部自动关闭」**：菜单展开后必须点击页面别处让 `<li>` 失焦才会收起。
4. `aria-disabled` 项因 `pointer-events:none` 而完全不可聚焦，屏幕阅读器仍可读到，但鼠标 hover 不会有任何反馈。

## 八、一句话总结

7.css 的菜单 = **「`tabindex` 让 `li` 可聚焦」+「`:focus-within` 向上冒泡保持展开」+「`:has(~ :hover)` 消解焦点粘滞」** 三件套，零 JavaScript。98.css 里这套能力完全不存在。

## 九、移植到 98.css 的要点

> 已落地实现：[win98-menu/](./win98-menu/) —— `98-menu.css`（引在 98.css 之后即可用）、`demo.html`、`README.md`（完整方法与代码）。本节只记要点。

### 9.1 为什么能移植：两层可分离

| 层 | 内容 | 处理 |
|---|---|---|
| 交互机制层 | `tabindex` + `:focus` / `:focus-within` + `:has(~ :hover)` + `display:none/block` + 绝对定位 | **100% 照搬**，与视觉无关 |
| 视觉层 | Aero 渐变、圆角、玻璃高亮、投影、图标槽凹槽线 | **全部替换**为 98.css 的零件 |

HTML 结构与 `role` / `.can-hover` / `.has-divider` / `aria-disabled` 等 API 完全不变，因此两套样式表可直接互换。

### 9.2 视觉映射（关键几处）

98.css 的立体感全靠**多层 `inset box-shadow` 模拟 1px 凹凸边框**，与 7.css 的渐变+圆角+投影是两套语言。

| 部位 | 7.css | 98 版 |
|---|---|---|
| 菜单栏底 / 项高亮 | 五段渐变 / `#39f` 蓝底白字 | `--surface` silver / `--dialog-blue` 深蓝白字 |
| 弹出面板边框 | `border:1px solid #0006` + 投影 | `--border-raised-outer, --border-raised-inner`，**无投影** |
| 菜单项高亮 | 玻璃渐变 + 淡蓝边框 + `border-radius:3px` | `--dialog-blue` 满幅蓝条 + 白字，**无圆角** |
| 左侧槽 | 28px + `::before` 画凹槽竖线 | 20px 纯空白（**Win98 没有这条竖线**） |
| 禁用项 | `opacity:.5` | `color:--button-shadow` + `text-shadow:1px 1px 0 --button-highlight` 浮雕灰字 |
| 勾选标记 | 22×22 高亮方框 + 勾号 | 裸勾号 `\2714` / 4px 圆点，**无方框** |
| 分隔线 | `inset 0 1px #00000026, inset 0 -1px #fff` | 同思路换色：`--button-shadow` / `--button-highlight` |

### 9.3 直接抄会翻车的 5 处

1. **`all: unset` 会把 `position: relative` 一起清掉** → 子菜单和箭头相对错误祖先定位而飞走。必须在 `all:unset` 之后重新声明。7.css 原文也这么做，照抄时最容易漏这行。
2. **98.css 的 `<button>` 带 `color: transparent` + `text-shadow`（像素字 trick）** → 不清掉菜单项文字会**直接透明消失**。反过来，98 版不需要 7.css 那句 `content:none`（98.css 的 button 是纯 box-shadow，没有伪元素光泽）。
3. **箭头与分隔线不能抢同一个伪元素** → 7.css 让两者都用 `::after`，同时带 `aria-haspopup` 和 `has-divider` 的项箭头会变形。把箭头挪到 `::before`。
4. **分隔线要画在 li 边界之外，且间距要算准** → 线画进 `margin-bottom` 撑开的空隙里（负 `bottom`），且 `margin-bottom` ≥ `|bottom| + height`，否则下一项高亮时蓝条会压掉高光那 1px。伪元素还必须 `position:absolute`，因为 `li[aria-haspopup]` 是 flex 容器，静态伪元素会变成 flex item 挤歪布局。
5. **弹出面板要重置 `color`** → 菜单栏父项高亮时 `color` 变白，子菜单是灰底，不重置文字会看不见。7.css 用 `color:initial`，98 版用 `color: var(--text-color)`。

### 9.4 顺手修掉的一个 7.css 副作用

7.css 的让位规则（消解 `:focus` 粘滞那两条）**没有限定在 `.can-hover` 内**：

```css
/* 7.css 原文，选择器开头没有 .can-hover */
ul [role=menuitem]:focus:has(~ [role=menuitem]:hover) > [role=menu] { display: none }
```

于是在**不带** `.can-hover` 的菜单里（只能点击展开），点开一项后鼠标掠过它后面的兄弟项，已展开的菜单会被意外收起，而那个兄弟又不会展开 —— 菜单凭空消失。98 版把两条让位规则都限定在 `ul.can-hover` 下：非 `can-hover` 模式只有 focus 一个触发源，单一焦点天然无冲突，不需要让位。

### 9.5 验证状态

CSS 语法、括号配对、选择器结构、伪元素定位组合已用脚本校验通过；**未做浏览器实机渲染**（本机 node 为 v10.15.3、项目要求 v18.12.0，prettier/stylelint 跑不起来，也没有可用的 chromium/firefox）。像素级间距为盒模型推算，首次打开 `demo.html` 时建议重点核对：分隔线上下间距、箭头垂直居中、勾号/圆点与文字对齐。

第七节的 4 条局限在 98 版中**同样存在**（都属机制层，需要补 JS）。此外 Win98 真实行为里菜单还需要「点菜单栏项打开、再点一次关闭」的 toggle，纯 CSS 做不到（`:focus` 无法切换）。

## 参考

- 7.css 文档（Menu / MenuBar 章节）：`https://khang-nd.github.io/7.css/`
- 7.css 源码：`https://github.com/khang-nd/7.css`
- 98.css：`https://jdan.github.io/98.css/`
- 菜单相关规则在压缩版 `7.css` 中的位置：按 `}` 拆行后约第 82–112 行
