# 沙盘表格列宽拖拽调整：实现与使用

状态：📝 记录
记录/更新日期：2026-11-12

## 这是什么

沙盘「编辑战役」页（`editCampaign.html`）的「地点编辑」「场景编辑」两个面板，
各自上部有一张记录表。给这些表的**数据列**加了「鼠标按住列右边线左右拖动、
实时调整列宽」的能力。

相关代码：

- 逻辑：[`site-page/src/main/ts/sandbox/sandboxEditCampaign.ts`](../site-page/src/main/ts/sandbox/sandboxEditCampaign.ts)
  的 `SandboxRecordEditorPanel` 类（`buildFieldset` / `buildHead` / `attachColResizer`）
- 样式：[`site-page/src/main/themes/trpg/styles/sandbox.less`](../site-page/src/main/themes/trpg/styles/sandbox.less)

## 怎么实现

### 核心：colgroup + `table-layout: fixed`

表格列宽由 `<colgroup>` 里的 `<col>` 决定。**只有 `table-layout: fixed` 下
`<col>` 的 `width` 才是权威** —— auto 布局里浏览器按单元格内容重算列宽，
改了 `<col>` 也不一定生效。所以：

1. 给 `<table>` 设 `table-layout: fixed`；
2. 每个数据列建一个 `<col>`，末尾删除列单独一个 `<col>` 固定窄宽；
3. 拖拽时只改对应 `<col>.style.width`。

```ts
this.table.classList.add('interactive', 'col-resizable');
this.table.style.width = '100%';
this.table.style.tableLayout = 'fixed';
const colgroup = document.createElement('colgroup');
for (let i = 0; i < this.columns.length; i++) {
	const col = document.createElement('col');
	this.colEls.push(col);           // 记下来，拖拽时改它
	colgroup.appendChild(col);
}
const delCol = document.createElement('col');
delCol.style.width = '40px';       // 删除列固定窄宽，不参与拖拽
colgroup.appendChild(delCol);
this.table.appendChild(colgroup);
```

### 把手：每个表头右侧的绝对定位竖条

每个数据列表头 `<th>` 里放一个 `<span class="col-resizer">`，绝对定位压在
列右边线上（`right: -3px` 让它跨到缝隙处更好抓）。样式在 `sandbox.less`：

```less
table.col-resizable th { position: relative; }
table.col-resizable .col-resizer {
	position: absolute; top: 0; right: -3px; width: 6px; height: 100%;
	cursor: col-resize; user-select: none;
}
table.col-resizable .col-resizer:hover { background: #a0a0a0; }
```

### 拖拽事件流

`attachColResizer(th, index)` 给把手绑 `mousedown`，按下后：

1. 记下起点 `startX` 与这一列当前渲染宽度 `startWidth`；
2. 在 `document` 上挂 `mousemove` / `mouseup`（挂在 document 而不是把手上，
   这样鼠标拖出表格也不丢）；
3. `mousemove` 里 `newWidth = max(MIN, startWidth + delta)`，写回
   `colEls[index].style.width`；
4. `mouseup` 里摘掉两个监听、还原 `body` 的 cursor / user-select。

```ts
private attachColResizer(th: HTMLTableCellElement, index: number): void {
	const handle = document.createElement('span');
	handle.className = 'col-resizer';
	th.appendChild(handle);

	handle.addEventListener('mousedown', (e) => {
		e.preventDefault();            // 阻止误选文本
		e.stopPropagation();
		const col = this.colEls[index];
		if (!col) { return; }
		const startX = e.clientX;
		const startWidth = th.getBoundingClientRect().width;
		const MIN = 24;

		const onMove = (ev: MouseEvent): void => {
			const w = Math.max(MIN, startWidth + ev.clientX - startX);
			col.style.width = `${w}px`;
		};
		const onUp = (): void => {
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
		};
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
	});
}
```

## 三个容易踩的坑

1. **必须 `table-layout: fixed`** —— auto 布局下 `<col>` 宽度只是「建议值」，
   内容一长就被撑开，拖了等于没拖。
2. **起点宽度读 `<th>`，别读 `<col>`** —— `<col>` 不是常规渲染盒子，
   `getBoundingClientRect().width` 在部分浏览器返回 0，用它算 delta 会把列宽
   直接算错（甚至归零）。
3. **设 `min-width` 兜底** —— 上面 `MIN = 24` 防止拖到负宽/0 把列拖没。
   顺带一提：98.css 给 `button` 设了 `min-width: 75px`，所以表格里那两个小
   按钮（删除/新建）要另外覆盖 `min-width`，见 `sandbox.less` 的
   `button.table-cell-opt-btn` 规则。

## 怎么用

### 现有页面：什么都不用做

`editCampaign.html` 已经加载 sandbox 样式（`sandbox.min.css`），
`SandboxRecordEditorPanel` 建表时自动套上 colgroup + 把手。
打开页面，把鼠标移到表头列的右边缘，光标变 `col-resize`，按住左右拖即可。

### 给一张新表加同样的能力

照着三步走：

1. `<table>` 加 class `col-resizable` + `table-layout: fixed`；
2. 建 `<colgroup>`，每个想拖的列一个 `<col>`（记得存引用），
   末尾固定列单独一个 `<col>` 并给固定宽度；
3. 每个数据列表头 `<th>` 里塞一个 `<span class="col-resizer">`，绑上面的
   mousedown / mousemove / mouseup。

样式已经在 `sandbox.less` 里（`table.col-resizable` 两条规则），
只要页面引了 `sandbox.css` / `sandbox.min.css` 就直接生效。

### 调整把手观感 / 最小列宽

| 想改什么 | 改哪里 |
|----------|--------|
| 把手粗细、悬停颜色 | `sandbox.less` 的 `.col-resizer`（`width` / `:hover background`） |
| 最小列宽 | `attachColResizer` 里的 `MIN` |
| 删除列固定宽 | `buildFieldset` 里的 `delCol.style.width` |

## 局限

- 列宽**只在本次会话内有效**，刷新页面就回到等分初始值（没做持久化）。
  需要记住的话可以仿照主题切换：把各列宽写进 cookie / localStorage，
  页面启动时再读回来填到各 `<col>`。
- 当前只给「编辑战役」页的两张表做了；沙盘其它页面（如选战役列表）要的话，
  按上面「给一张新表加能力」三步补。
