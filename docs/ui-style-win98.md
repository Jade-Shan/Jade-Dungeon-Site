# window 风格桌面环境实现分析

> 面向 `test-jade-window-ui.html`、`testJadeUI.ts`、`UIWindow.ts` 三者的实现分析。
> 重点：HTML 元素的创建、JavaScript 事件绑定与状态变化（不含 CSS 样式）。

## 目录

- [一、从 HTML 到 JS 的启动链](#一从-html-到-js-的启动链)
- [二、DOM 元素的创建](#二dom-元素的创建)
- [三、状态模型](#三状态模型)
- [四、事件绑定与状态流转](#四事件绑定与状态流转)
- [五、关键设计模式总结](#五关键设计模式总结)

---

## 一、从 HTML 到 JS 的启动链

入口在 `src/html/test-jade-window-ui.html`：

```html
<script type="module">
  import { TestJadeUI } from "@@staticRoot/scripts/ts/ui/testJadeUI.js";
  window.onload = function() { TestJadeUI.testWindowUI(); TestJadeUI.testCanvasWindow(); }
</script>
```

页面预置了 3 个桌面容器 `div`（`test-desktop-00/01/02`），分别演示「无 Dock / 有 Dock / 带 Canvas 的窗口」三种场景。加载后：

- `testWindowUI()` 拿到 `test-desktop-00/01`，`new UIDesktop(...)` 后逐个 `new TestWindow01(...)` 并 `renderIn()`。
- `testCanvasWindow()` 拿到 `test-desktop-02`，创建 `TestCanvasWindow` 并在其中绘制 Canvas。

**关键点**：HTML 里没有预写任何窗口结构，所有窗口 DOM 都是 JS 运行时动态拼出来的。

---

## 二、DOM 元素的创建

窗口骨架由「工厂函数 + 字符串拼装」两种方式混合生成，核心入口是 `JadeWindowUI.renderWindowTplt`。

```
winDiv  (div.window)                                  ← UIWindowAdapter 构造时 createElement
├─ titleBar  (div.title-bar)                          ← renderTitleBar
│   ├─ titleBarIconText (div.title-bar-icon-text)
│   │   ├─ titleBarIcon   (div.title-bar-icon)        ← 12px base64 图标
│   │   └─ titleBarText   (div.title-bar-text)        ← win.title 文本
│   └─ titleBarControls  (div.title-bar-controls)
│       ├─ btnMin   (button[aria-label=Minimize])
│       ├─ btnMax   (button[aria-label=Maximize])
│       └─ btnClose (button[aria-label=Close])
├─ windowBody  (div.window-body)                      ← 由窗口子类 renderIn 填充
└─ statusBar   (div.status-bar)  [可选]                ← renderStatusBar 返回
```

创建细节：

- 三个控制按钮在 `renderTitleBarControls` 中用 `document.createElement("button")` 生成，**创建的同时就完成事件绑定**（`bindWinOptMin/Max/Close`），而非先建完再统一绑。
- 窗口主体 `windowBody` 不是模板生成的，而是子类通过 `renderIn()` 自己填——`TestWindow01` 用 `innerHTML` 塞表格，`TestCanvasWindow` 用 `appendChild` 塞 canvas。体现「骨架抽象类 + 内容子类」的分层。
- `UIWindowAdapter` 构造时只建 `win/titleBar/windowBody` 三个空 div，真正的子元素（图标、按钮、状态栏）延迟到 `renderWindowTplt` 阶段才挂载。
- Dock 栏元素见 `DockBar.addIcon`：每个窗口对应「一个 gap 间隔 + 一个 menu-item 图标」，图标背景直接用 base64 图。

---

## 三、状态模型

状态分两层：

### 窗口级状态 `WinStatus`

| 字段 | 含义 | 影响 |
|------|------|------|
| `isTop` | 是否当前活动窗口 | 决定标题栏 `inactive` class、最小化分支 |
| `isMax` | 是否最大化 | 阻止拖动/缩放，决定还原位置 |
| `isMin` | 是否最小化 | 决定窗口 `visibility`，阻止拖动 |
| `isDragging` | 是否拖动中 | （目前仅被 `checkDragging` 查询） |
| `lastPos` / `lastSize` | 最大化前的坐标/尺寸 | 还原时恢复用 |

### 桌面级状态 `CurrentWindow`

集中存在 `UIDesktop.currWin`：

```
currWin = {
  top: UIObj | undefined,                       // 顶层窗口
  dragging: { win?, moveStart?, winStart? },    // 拖动中转站
  scaling:  { win?, direction?, moveStart?, winStart? }  // 缩放中转站
}
```

窗口索引还有两个容器：

- `allWindows: SimpleMap<string, UIObj>` —— 按 id 查找。
- `windowZIndex: Array<UIObj>` —— 按 z-index 顺序，数组末尾 = 最顶层。

---

## 四、事件绑定与状态流转

所有事件绑定封装在 `defaultWinOption` 对象中（实现 `IBindWinOpt` 接口），**创建窗口时可整体替换成自定义实现**，这是它可扩展的关键。

### 4.1 激活 / 置顶（点击窗口）

- 绑定：`bindWinOptActive`，在 `winDiv` 上 `mousedown` → `desktop.optWinActive(win)`。
- 流转：`optWinActive` → `reorderWindows(win.id)` 把除自己外所有窗口降层、重新分配 z-index，再把 `win` push 到数组末尾 → `activeWindow(true)` 设 `isTop` 并移除 `inactive` class → 设最高 z-index。

> `mousedown` 绑在 `winDiv` 根节点上，所以点击窗口任何位置（含 body）都会激活——「点哪哪就跳到最前」。

### 4.2 关闭窗口

- 绑定：`bindWinOptClose`，关闭按钮 `mouseup` → `optWinClose(win)`。
- 流转：`optWinClose` 从 `allWindows` 移除 → `reorderWindows` 排除自己 → `desktopDiv.removeChild(win.ui.win)` **真正删 DOM** → 激活新的末尾窗口 → `dockBar.removeIcon(win)` 同步删图标。

### 4.3 最大化 / 还原

- 绑定：`bindWinOptMax`，最大化按钮 `mousedown`。
- 流转用 `status.isMax` 翻转分两个分支：

  - **未最大化 → 最大化**：把当前 `offsetLeft/Top/Width/Height` 存进 `lastPos/lastSize`（还原凭据），`end` 设为 `(0,0,全屏)`，`aria-label` 切到 `"Restore"`。
  - **已最大化 → 还原**：`end` 设为之前存的 `lastPos/lastSize`，`aria-label` 切回 `"Maximize"`。
  - 两分支都先调 `showWinMaxMinAnima` 播动画，`setTimeout(350ms)` 后才真正写 `left/top/width/height`，并**重新计算 body 高度**（窗口总高 − 标题栏高 − 状态栏高 − 内边距）。

> 窗口 body 尺寸不是 CSS 自适应，而是每次改窗口尺寸时手动用 JS 重算 `windowBody.style.height/width`——这是它不用 flex 布局的直接后果。

### 4.4 最小化（三段式状态机）

绑定到**两个地方**：标题栏最小化按钮、Dock 图标（`addIcon` 中）。逻辑在 `bindWinOptMin`：

```
if (isMin)        → 恢复：动画 + visibility=visible + 激活置顶
else if (isTop)   → 最小化：isMin=true + visibility=hidden + 缩小动画
else              → 仅激活置顶（窗口在底层时，点 dock 图标先"把它带上来"）
```

最小化不是删 DOM，只是 `visibility:hidden` + 播一个缩到桌面底部中央的动画。三段式让「点 Dock 图标」语义与 Windows 任务栏一致：**在顶层则最小化，不在顶层则唤起**。

### 4.5 拖动窗口（两段式：选中 + 移动）

拖动拆成**两个独立绑定**，是本套代码最精妙的模式：

1. **选中阶段** `bindWindowDragSelect`：只在 `titleBar` 上绑 `mousedown`，若窗口非 max/min，把 `{win}` 塞进 `desktop.currWin.dragging`，光标改 `move`。**不记录坐标、不动位置**。
2. **移动阶段** `bindWindowDragMoving`：**绑在 `desktopDiv` 全局上**，监听三件事：
   - `mousedown`（全局，`setTimeout 10ms`）：此刻 `dragging.win` 已被第一步填好，记录 `moveStart`（鼠标起点）和 `winStart`（窗口起点）。
   - `mousemove`：先做边界检查（鼠标移出桌面就 `cleanDragging`），否则算 `dx/dy`，直接改 `currDiv.style.left/top`。
   - `mouseup` / `mouseleave`：`cleanDragging` 清空 `dragging`、恢复光标。

**为什么 `mousedown` 用 `setTimeout(10ms)`？** 事件冒泡顺序是子元素先、父元素后，所以 titleBar 的 `mousedown` 先于 desktopDiv 的 `mousedown` 执行，`dragging.win` 已就位；`setTimeout` 是额外保险，确保写入 `moveStart` 时「选中」已完成。

**为什么移动绑在桌面而非窗口？** 拖动时鼠标可能快速移出窗口/标题栏，绑在标题栏会丢事件；绑在整块桌面 + `mouseleave` 兜底清理，能保证「鼠标跑出桌面」也正确终止。

### 4.6 缩放窗口（同款两段式 + 小键盘方向码）

结构与拖动完全对称：

- **选中** `bindWindowScaleSelect`：在 `winDiv` 上 `mousedown`，用 `checkScaleStart` 判断鼠标落在窗口 7px 边缘的哪个方位，返回方向码 `1~9`（小键盘布局：7 左上 / 8 上 / 9 右上 / 4 左 / 6 右 / 1 左下 / 2 下 / 3 右下 / 5 中心=不缩放），写进 `currWin.scaling` 并设对应 resize 光标。
- **移动** `bindWindowScaleMoving`：全局 `mousedown` 记录起点，`mousemove` 按方向码拆解——方向含 `8/9/7` 改 `top`，含 `2/1/3` 改 `height`，含 `6/3/9` 改 `width`，含 `4/1/7` 改 `left`。**8 个方向 = 对 left/top/width/height 四个量做不同增减组合**，四组 `if` 正好覆盖。缩放时同样手动重算 body 尺寸。

> 方向检测用 `getBoundingClientRect()` 把 `clientX/Y` 换算成相对窗口左上角坐标，再和边缘阈值 `7px` 比较——这就是「光标移到边缘变 resize 箭头、按下能拉边」的机制。

### 4.7 Dock 任务栏

见 `DockBar`。除「图标=最小化按钮」的复用外，还做了两件事：

- **悬停缩放动画**：`mousemove` 时用 `createCurve` 生成一条以鼠标 x 为中心、基于 `Math.sin` 的曲线，`layout` 遍历每个图标算缩放倍数，写进 CSS 变量 `--i`。
- **层级切换**：`mouseenter` 把 dock 的 z-index 提到 `getMaxWindowIndex()+100`（盖过所有窗口），`mouseleave` 降回 `WIN_Z_IDX_MIN-1`（垫底），保证悬停时 dock 浮到最上、离开后不挡窗口。

### 4.8 过渡动画（showWinMaxMinAnima）

`showWinMaxMinAnima` 不是真的移动窗口，而是：

1. 临时 `createElement('div')`，一个白色半透明（`opacity:30%`）、黑边框的**遮罩层**，放在窗口 `zIndex+10` 的位置，初始尺寸 = `start`。
2. 设 `transition: left/width/... ease`，下一帧 `setTimeout(10ms)` 后把尺寸改成 `end`，靠 CSS transition 播过渡。
3. `zoomMilSec + deleMilSec` 后 `removeChild` 销毁遮罩。

窗口本身的尺寸要等 `350ms`（在 `bindWinOptMax/Min` 的 setTimeout 里）才真正改——**遮罩动画和窗口真实变形是两套时间轴**，遮罩负责「演」，窗口负责「变」。代价是动画期间窗口本体没动、只看到幽灵框。

### 4.9 状态流转时序图

PlantUML 源文件已抽离到 [uml/src/ui-style-win98.plantuml](uml/src/ui-style-win98.plantuml)，汇总了窗口从创建到关闭的完整生命周期及各阶段状态流转：① 创建 → ② 激活/置顶 → ③ 拖动 → ④ 缩放 → ⑤ 最大化/还原 → ⑥ 最小化/恢复 → ⑦ 关闭。

![ui-style-win98](uml/out/ui-style-win98.svg)


---

## 五、关键设计模式总结

| 模式 | 体现 | 作用 |
|------|------|------|
| **接口 + 抽象类 + 子类** | `UIObj` → `UIWindowAdapter` → `TestWindow01` | 骨架复用，内容子类定制 |
| **策略对象** | `defaultWinOption` 实现 `IBindWinOpt`，可整体替换 | 事件行为可插拔 |
| **两段式交互** | 拖动/缩放 = 「子元素 select 写状态」+「父容器 moving 读状态」 | 防止快速移动丢事件 |
| **中央状态容器** | `UIDesktop.currWin.{top,dragging,scaling}` | 把交互中间态从 DOM 里抽出来 |
| **手动尺寸同步** | 每次改动都重算 `windowBody` 尺寸 | 不用 flex，靠 JS 精确控制 |
| **幽灵遮罩动画** | `showWinMaxMinAnima` | 用临时元素 + CSS transition 模拟窗口过渡 |

### 一句话概括

**HTML 只提供空容器 → JS 动态拼 DOM 并在拼装时同步绑事件 → 事件通过修改 `currWin`/`WinStatus` 状态驱动 DOM 样式变化 → z-index 数组维护层级 → 拖动/缩放用「子选中 + 父移动」两段式保证流畅。**

---

## 相关文件

- `src/scripts/ts/ui/UIWindow.ts` —— 桌面环境、窗口、Dock 栏、默认事件绑定、动画
- `src/scripts/ts/ui/testJadeUI.ts` —— 测试窗口子类与桌面初始化
- `src/html/test-jade-window-ui.html` —— 测试页面入口
