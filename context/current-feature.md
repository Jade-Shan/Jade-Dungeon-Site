# 当前需求

## 状态

未开始

## 需求文档

<!-- 执行 `/feature load` 加载需求文档 -->

## 目标

<!-- 成功标准的要点列表 -->

## 说明

<!-- 来自需求文档的额外上下文、约束或详细信息 -->

## 修改汇总

<!-- 解释本次修改的内容 -->

## 历史记录

- **editor 元素列表：补回「资源文件」分类**（2026-11-06）
  - 老系统的元素列表有 6 个标签（team / creater / furnishing / door / wall /
    image），迁移时漏了 `image`（对应数据源 `imgResources`）。`sandboxScene.ts`
    加 `putImage()` / `removeImage()` 两个方法
  - `sandboxEditor.ts`：`currGroup: TokenGroup` 改成 `currTab: ListTab`
    （`TokenGroup | 'images'`），加 `selectedImage` 状态；`renderGroupBar()`
    遍历 `ALL_TABS`（五个 Token 分组 + 资源文件）；`renderTokenList()` 分叉
    到新的 `renderImageList()`（id + url 列表 + 「新建资源」按钮）
  - 属性窗口分叉：`renderImageProps()`（id + url 两字段）+ `applyImageProps()`
    （改 id 删旧键、复用旧 `imgElem` 重设 src，引用它的 Token 不用重建）
    + `selectImage()` / `createImage()` / `deleteImage()`
  - 点地图选中 Token 时标签页跟着切过去（`select()` 里同步 `currTab` 并
    `renderGroupBar()`），否则可能「资源文件」标签亮着、列表却显示 Token
  - 新增 3 条测试（`sandbox.scene.test.ts` 的 `putImage / removeImage`），
    站点侧 187 → 190
  - **未做浏览器手工验证** —— 标签页、资源列表、新建/删除/改 url 都要在浏览器里看
- **editor 属性窗口：裁剪区域支持鼠标交互**（2026-11-06）
  - `sandboxWindows.ts` 的 `SandboxPropsWindow` 加 `setFieldValue()`（直接改
    `input.value`，不触发 change）
  - `sandboxEditor.ts` 加 `bindPropsEvents()`：在裁剪预览画布上
    Shift+拖动=框选新矩形、Ctrl+拖动已选区域=平移、Alt+拖动已选区域=缩放
    （dx 改宽、dy 改高，下限 1，对齐 `RectangleToken.scaleTo`）
  - 拖动过程只更新表单字段 + 实时重画预览，松手才 `applyProps()` 写回 Token；
    `clipToCanvasPoint()` 用 `getBoundingClientRect` 按比例换算（画布位图 = 图片
    原始尺寸，但 CSS 显示尺寸可能被压缩）
  - `keydown/keyup` 增加 Shift 状态跟踪（`shiftDown`）
  - **未做浏览器手工验证** —— 三种拖动、坐标换算（图片比窗口大时的缩放）要在浏览器里看
- **editor 场景窗口：加「当前角色视野」开关**（2026-11-06）
  - `sandboxWindows.ts` 的 `SandboxSceneWindow` 加 `autoView` checkbox
    （文本「当前角色视野」，位于「定时刷新」下方，默认非选中）
  - `sandboxEditor.ts`：`loadScene` 成功后构造一个 `SandTable`（复用 view 页的
    视野渲染，缺背景图时跳过、编辑照常）；`redraw()` 分叉 —— `viewMode` 开启且
    选中对象是玩家/生物时，以它为观察者调 `drawSceneWithUserView()` 画迷雾+遮挡，
    画完补选中高亮；否则走原来的 `paintScene()` 全图
  - `toggleViewMode()`：checkbox 选中时检查有没有选中对象、是不是玩家/生物，
    不是就弹回 checkbox、什么都不做；取消选中恢复全图。`select()` 里同步 ——
    视野模式开启时选中墙/门/陈设会自动退出视野模式，避免 checkbox 勾着却显示全图
  - 视野范围 500、迷雾色 `rgba(0,0,0,0.7)` 与 view 页对齐
  - **未做浏览器手工验证** —— 视野遮挡、选中切换、checkbox 弹回都要在浏览器里看
- **editor 五窗口初始位置平铺**（2026-11-06）
  - `sandboxEditor.ts` 加 `tileWindows()`：五个窗口 `renderIn()` 之后统一重排，
    不再用 `renderWindowTplt` 的自动叠放。地图贴桌面左上（距上/左 20px）；
    场景 + 检定贴桌面底部（距底 20px）左右并排；元素列表 + 属性贴桌面右边
    （距右 20px）上下并排，间距统一 20px
  - 位置同时写 `style.left/top` 和 `status.lastPos` —— 只改 style 的话，
    窗口最大化/还原后会跳回 `renderWindowTplt` 自动叠放的位置
  - 尺寸读 `ui.win.offsetWidth/offsetHeight`（窗口实际大小，含标题栏），
    桌面尺寸读 `desktop.desktopDiv.clientWidth/clientHeight`
  - **未做浏览器手工验证** —— 平铺效果、dock 是否遮挡底部窗口要在浏览器里看
- **editor 选中高亮：两层同心圆**（2026-11-06）
  - `sandboxEditor.ts` 的 `highlightSelected()`：原来单层黄色虚线在浅色地图上
    对比不明显，改成两层同心圆——先画 7px 实线做深色衬底，再画虚线；
    直径（半径 34）不变。颜色最终定为：实线 `#9400d3`（紫）、虚线 `#7cfc00`（绿）
  - **未做浏览器手工验证** —— 两层圆圈的实际视觉效果要在浏览器里看
- **editor 场景窗口：加「定时刷新」开关**（2026-11-06）
  - `sandboxWindows.ts` 的 `SandboxSceneWindow` 加 `autoRefresh` checkbox
    （文本「定时刷新」，默认非选中）。98.css 的 checkbox 靠 `input + label`
    相邻兄弟选择器画外观，所以 label 紧跟 input 且用 `for` 关联
  - `sandboxEditor.ts`：`bindSceneEvents()` 绑 change 事件——选中启动
    `setInterval` 每 3 秒自动执行 `loadMoveRequests()`，取消就 `clearInterval`；
    `loadMoveRequests()` 加 `refreshInFlight` 防重入（上一次没返回就跳过下一次，
    避免网络慢时每 3 秒堆一堆请求）
  - **未做浏览器手工验证** —— checkbox 外观与 3 秒定时刷新要在浏览器里看
- **editor 的元素列表：分组按钮改成 98.css 标签页**（2026-11-06）
  - `sandboxWindows.ts` 的 `SandboxTokenListWindow`：分组切换从一排 `<button>`
    改成 98.css 的 `menu[role=tablist]` 标签页，列表 + 创建按钮包进
    `.window[role=tabpanel]` 内容面板（`groupBar` 字段类型 div → menu）
  - `sandboxEditor.ts` 的 `renderGroupBar()`：每个分组渲染成
    `<li role="tab"><a>标签</a></li>`，当前分组设 `aria-selected="true"`，
    点击切换后**重画标签页更新选中态**（原来的按钮没有选中态，切了也不知道在哪）
  - **未做浏览器手工验证** —— 标签页的选中态凸起外观要在浏览器里看
- **修遮挡阴影的绘制顺序：阴影与 Token 从远到近交错**（2026-11-06）
  - 上一版给 view 页加遮挡阴影时，明亮层「先画完所有遮挡物阴影、再画所有可见
    Token」，被遮挡的 Token 又画在了自己的阴影**上面**，墙后仍是亮的
  - `trpg/sandtable.ts`：`filterOccluders` 拆成 `isOccluder()`（判断是否投射阴影：
    `blockView` 且非自己/spectator）+ `filterTokensInView()`（视野内**所有** Token
    从远到近排序，**含不挡视线的**）；`drawSceneWithUserView()` 改成单个交错循环——
    逐个 Token「遮挡物先投阴影 → 可见再画自己」，对齐老系统 `renderTokensOnSandbox`。
    远处 Token（阴影+自身）先画成背景，被更近的阴影遮挡
  - 重写 `site-page/src/test/ts/sandtable.occlusion.test.ts`（9 → 11 条），
    新增「`filterTokensInView` 保留不挡视线 Token」的用例 —— 这是本次语义变化的核心
  - 站点侧 185 → 187，总数 435 → 437
  - **未做浏览器手工验证** —— 像素效果只能在浏览器看，
    `docs/sandbox-refactor.md` 7.4 节验收清单第 2 条「墙后面是暗的」还没走
- **给 view 页沙盘加遮挡阴影（战争迷雾的墙后阴影）**（2026-11-06）
  - 原来 `SandTableUtils.drawSceneWithUserView()` 只做「暗图 + 亮图（直接画可见
    Token）+ 圆形视野裁剪」，墙后面的东西在视野圆内仍是亮的，不挡视线
  - `trpg/sandtable.ts`：`SandTableUtils` 新增纯函数 `filterOccluders()`——
    过滤「不挡视线（`blockView=false`）」「距离超出视野范围」「自己」「spectator」，
    再按距离**从远到近**排序；`IObserver` 加可选 `id`；`drawSceneWithUserView()`
    在明亮层先给每个遮挡物用 `CanvasUtils.drawVertexShadowFrom` 投射阴影
    （填充用暗图纹理，对齐老系统 `shadowImage`），再画可见 Token
  - 过滤/排序/距离对齐老系统 `Observer.filterTokensInView` +
    `renderTokensOnSandbox`；距离用 `getMostCloseVertex`（点到图形最短距离）；
    阴影绘制复用 common-utils 现有 `CanvasUtils.drawVertexShadowFrom`（库侧未改）
  - `sandbox/sandboxView.ts`：构造 observer 时带上 `id: myToken.id`
  - 新增 `site-page/src/test/ts/sandtable.occlusion.test.ts`（9 条，只测纯函数），
    站点侧 176 → 185，总数 435
  - **未做浏览器手工验证** —— 像素效果只能在浏览器看，
    `docs/sandbox-refactor.md` 7.4 节验收清单第 2 条「墙后面是暗的」还没走
- **补回老版本的拖动预览：Ctrl 移动、Alt 缩放**（2026-11-06，
  详见 `site-page/docs/sandbox-refactor.md` 11.1.2 节）
  - 老应用 `sandtable.html` / `sandtable-editor.html` 在**拖动过程中**就画效果，
    迁移时漏了。`trpg/sandtable.ts` 给三种 Token 各补三个方法：
    `drawPreviewGhost()` / `drawMovePreview()` / `drawScalePreview()`
    （对应老代码的 `onWantMoveing` / `onMoveing` / `onScaleing`）
  - **editor 原来完全没有 `mousemove`** —— Ctrl/Alt 只在松手那一刻生效，
    拖的过程里什么都看不到。补了 `mousemove`，每帧重画底再压预览
  - **view 侧修了一个坐标 bug**：原来按**光标绝对位置**画预览，
    老代码是**位移量**语义。从棋子边缘抓住拖动时中心会瞬移到光标底下
    （半径 25 最多偏 25px），**而且提交给后端的坐标也跟着偏**
  - **预览的落点走 `moveTo()` / `scaleTo()`，和松手时提交的是同一个方法** ——
    老代码预览与提交各算一遍公式，改一边忘另一边就「看到的 ≠ 得到的」且不报错。
    有一条用例拿两者对比钉着
  - `redraw()` 拆出同步的 `paintScene()` —— `mousemove` 是同步回调，
    里面 `void this.redraw()` 会让预览画在重画之前、然后被盖掉（一闪就没）
  - 顺带：`resizeCanvas()` 加「尺寸没变就不赋值」判断（它会清位图，赋同值也清，
    拖动时每帧都走）；加 `previewing` 标记擦掉中途松开修饰键留下的幽灵
  - 预览颜色收成 `PREVIEW_STYLE` 常量 —— **老代码这组值在六处各写一遍且不一致**
  - 新增 `site-page/src/test/ts/sandtable.preview.test.ts`（19 条，用记录调用的
    假 2D 上下文，jsdom 没有 `getContext('2d')`），站点侧 157 → 176，总数 426
  - **改了一条原有用例的锚点**：`sandbox.canvasorder.test.ts` 按
    `private async redraw()` 定位查「`resizeCanvas` 在 `drawImage` 之前」，
    拆出 `paintScene()` 之后在那里找不到了，已改成按 `paintScene` 定位
  - **未做浏览器手工验证** —— 像素效果只能在浏览器里看，
    `docs/sandbox-refactor.md` 11.1 节那张验收表的第 3、6 项还没走
- **`ablum` → `album`，并清掉「为旧后端保留」的过时说法**（2026-11-05，旧后端已停用）
  - 后端：`blogService.ts` 的 `IAlbumDetail.album` 及三处赋值、`gallery.ts` 注释、
    `backupBlogData.ts` 的 `IAlbum.album`
  - 前端：`common.ts` 的 `UserArticle.album` + 两处读取
  - **`migrateBlogRedisToSqlite.ts` 的 `ablum` 保留** —— 它读 Redis 里的存量旧数据，
    那边的 key 本来就叫 `ablum`，改了一张图都读不到。文件里加了注释钉住
  - **`scence` 没改** —— 它是 Redis key 前缀的一部分，约束来自存量场景数据、
    不是来自旧后端，改名要连带写迁移脚本。这台机器上 redis-cli 没装、
    Redis 没起，当时也验不了存量规模
  - 过时说法清了 5 处代码注释（`sandtableService.ts` 的「两代后端看不到彼此」、
    `diceService.ts` 的「否则旧后端解析不了」、`config.ts` 的「与旧后端共享」等）
    + 4 篇文档（`site-api/CLAUDE.md`、`migration-history.md`、
    `design-blog-gallery-sqlite.md`、根 `CLAUDE.md`）。
    **措辞统一成「约束换了来源，不是消失了」** —— Redis key 和 JSON 形状的限制
    现在来自存量数据，跟后端版本无关
  - 新增 1 条自检用例（52 个）：后端给旧字段名 `ablum` 时必须渲染不出图。
    没有它的话「前端改回读 `ablum`」测不出来 —— 这个失败模式是静默的
    （相册页只剩说明文字、没有图，不报错）
  - 真机验证：后端响应字段是 `album`（无 `ablum`）；jsdom 跑编译产物打真后端，
    5 组相册 9 张缩略图，与后端 `album` 数组总数一致
- **修掉 `recommand` 拼写，前后端一起改**（2026-11-05，接着上一条）
  - 后端 `site-api/routes/blog.ts`：路径 `loadRecommandArticles` →
    `loadRecommendArticles`，响应字段 `recommands` → `recommends`
  - 前端 `site-page/blog/blog.ts`：请求 URL、`RecommendArticlesResp` 的字段、
    读取处三处同步改
  - **顺带修了一个真 bug**：`recommends` 字段缺失时 `for...of undefined` 会抛错。
    原来的 `recoms.body ? ... : 默认值` 只在 body 为 null 时兜底，响应体在但缺字段
    （后端报错、或字段名对不上）兜不住。而这个函数是 `initBlogPage()` 里
    `Promise.all` 的一支，抛了会把用户信息和文章列表一起带走。
    加了 `?? []`，并把 `recommends` 的类型改成可选（照实写，否则 `?? []` 像废代码）
  - 新增 4 个用例（站点侧 47 → 51，总数 297 → 301），其中一条是自检用的：
    后端给旧字段名时必须渲染不出东西 —— 否则「前端改回读 `recommands`」这种
    回退测不出来。**就是这条自检把上面那个 bug 炸出来的**
  - 改动涉及 URL，改前全盘搜过调用方：旧前端 `Jade-Dungeon-page` 不在磁盘上
    （只有 `Jade-Dungeon.20261105.tar.gz` 备份），`sync-prj/` 里也没有
  - 真机验证：新路径 200 且返回 `recommends`、旧路径 404；jsdom 跑编译产物
    渲染出 2 条推荐
  - `ablum`（`album` 之误）当时没动，**在下一条里改掉了**
  - 至此根 CLAUDE.md 那张「待跟进的后端 API 问题」表清空，已改写成「都修完了」
- **blog 列表改摘要 + 展开，分页两处修正**（2026-11-05，配合新后端 `site-api/`）
  - `site-page/blog/common.ts`：去掉 `pageCount + 1` 补偿（后端已用 `Math.ceil`，
    再补会多一个空白末页）；`renderArticleBody()` 按「有 `text` 过 showdown、
    只有 `excerpt` 只转义」分支；新增 `expandArticle()` / `bindExpandLinks()`，
    「展开」点了去 `api/blog/getArticle?id=N` 取 Markdown 全文再替换整块 `.body`
  - `site-page/blog/blog.ts`：传入 `detailUrl`；相册页不传，所以没有展开链接
  - `site-api/blogService.ts`：`normalizePaging()` 的 `pageSize` 下限 10 → 1。
    原来相册页请求的 `pageSize=5` 被静默抬成 10（`u001` 32 组：要 7 页给了 4 页）
  - `UserArticle` 的 `id` / `text` / `excerpt` 都改成可选 —— 三个接口字段形状不同
  - 新增 `site-page/src/test/ts/blog.article.test.ts`（14 个用例），
    站点侧 33 → 47，总数 283 → 297
  - 真机验证：起 `site-api`（8089）+ jsdom 跑编译产物。`teo` 36 篇 → 分页
    1 2 3 4、末页 6 条；id=40 摘要 201 字（带 `…`）展开成 533 字、`…` 消失、
    链接消失、只有展开后才过 showdown；相册 5 组无展开链接、9 张缩略图
  - 未动：`recommands` 拼写（后端那个接口还是假数据，字段名没改）
- **检查 TypeScript 源代码** （spec：[20260530-check.code.md](context/old-fixes/20260530-fix.03..md)）
  - 审查了 `src/scripts/ts/` 下全部 15 个 `.ts` 文件
  - 已跳过 CLAUDE.md 中记录的 2 个待后端修复的已知问题
- **检查 TypeScript 源代码** （spec：[20260530-check.code.md](context/old-fixes/20260530-fix.02..md)）
  - 审查了 `src/scripts/ts/` 下全部 15 个 `.ts` 文件
  - 发现 9 个问题：2 中等（硬编码提示文案、手机号正则未覆盖新号段）、6 低（浮点精度、废弃 API、死代码）、1 极低（宽松比较）
  - 已跳过 CLAUDE.md 中记录的 2 个待后端修复的已知问题
- **消除顶层 DOM 求值阻塞项** （spec：[20261029-tryPackate.md](context/old-features/20261029-tryPackate.md)）
  - 分支 `feature/remove-top-level-dom-eval`，仅改 `src/scripts/ts/web.ts` 一个文件
  - 顶层 `export class EscapeUnicode extends HTMLElement` 改为纯类型声明 `export type IEscapeUnicode = HTMLElement`，类定义整体挪入 `WebUtil.initCustomElements()` 方法体，类体逻辑逐字保留
  - 验证：`npx gulp process-typescript`（strict）编译通过；`web.js` / `ui/canvas.js` / `ui/UIWindow.js` 在 Node 下 import 成功，而从 `HEAD` 取旧版单独编译的对照组三者全部 `ReferenceError: HTMLElement is not defined`
  - 浏览器行为用 jsdom 验证等价：`esp-unicode` 注册成功，`<esp-unicode>&amp;#x26f5;</esp-unicode>` 仍渲染为 `⛵`
  - breaking change：`web.d.ts` 中 `EscapeUnicode` 类导出消失。`src/` 内零引用，影响仅限外部使用方
  - 需求文档标题含「打包方案与项目结构」，但正文只详述阻塞项；打包方案、`package.json` 元信息（`name`/`version`/`main`/`exports`/`types` 当前全缺）、入口拆分、项目结构调整均未做，需另起需求
  - review 阶段全模块 Node import 实测（14 个模块，13 成功 1 失败），发现 `workout/workout.ts:490-493` 顶层 `for` 循环在加载期调用 `document.createElementNS()`，是同类阻塞项，本次未改
  - 另发现 CLAUDE.md 两处过期：「无 `tsconfig.json`」（实际已存在）、「源码架构」仍描述扁平结构（实际已分 `blog/`、`ui/`、`trpg/`、`workout/` 目录，且 `workout/` 未被记录）
