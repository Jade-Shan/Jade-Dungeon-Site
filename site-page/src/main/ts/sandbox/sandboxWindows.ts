import {
	JadeWindowUI, UIDesktop, UIWindowAdapter, WinParam,
} from '@jade-dungeon/jade-utils/ui-window';

/**
 * 沙盘的窗口类
 *
 * 老应用把地图和各个面板堆在一个 Bootstrap 栅格里，靠 `resizeLayout()`
 * 手算 7 个 `clientHeight` 再减出地图高度。改成窗口之后那套全删了 ——
 * 窗口自己管大小，这是换 UI 最大的收益。
 *
 * 窗口划分见 `docs/sandbox-refactor.md` 第 5.2 节：
 * 玩家开 Map + Dice 两个，GM 另外开 Tokens / Properties / Scene。
 *
 * ## 为什么每个窗口自带一个 `renderBody()`
 *
 * `UIWindowAdapter.renderIn()` 是抽象方法，子类必须自己拼窗体。
 * 这里的模式是：`renderIn()` 只负责把 `renderBody()` 的结果交给
 * `JadeWindowUI.renderWindowTplt()`，具体内容由各窗口实现 ——
 * 和 `testJadeTRPG.ts` 的 `TestCanvasWindow` 同一套写法。
 */

/** 窗体默认尺寸，各窗口可以在 `cfg.body.initSize` 里覆盖 */
const DEFAULT_BODY = { width: 640, height: 480 };

/**
 * 带双层 Canvas 的地图窗口
 *
 * **两张 Canvas 是渲染管线要求的**，不是冗余：
 *
 * | Canvas | 作用 |
 * |--------|------|
 * | `bufferCanvas` | 离屏缓冲。画暗层/亮层、再 `toDataURL()` 取快照 |
 * | `finalCanvas` | 展示用。只贴合成好的结果，鼠标事件也绑在它上面 |
 *
 * `SandTable.drawSceneWithUserView()` 要的就是这一对（`IScene.frame`）。
 * 缓冲那张**不进 DOM** —— 它只是个像素暂存区，塞进文档会被用户看到中间态。
 */
export class SandboxMapWindow extends UIWindowAdapter {

	/** 离屏缓冲画布，不加进 DOM */
	readonly bufferCanvas: HTMLCanvasElement = document.createElement('canvas');
	/** 展示画布，鼠标事件绑在它上面 */
	readonly finalCanvas: HTMLCanvasElement = document.createElement('canvas');
	/** 窗口底部状态栏的文字元素，用来显示坐标与提示 */
	private statusText: HTMLParagraphElement | null = null;

	/**
	 * @param desktop - 所在桌面
	 * @param id - 窗口 ID
	 * @param title - 窗口标题，一般用场景名
	 * @param cfg - 窗口参数
	 */
	constructor(desktop: UIDesktop, id: string, title: string, cfg?: WinParam) {
		super(desktop, id, title, cfg);
		const size = this.cfg.body.initSize ?? DEFAULT_BODY;
		for (const cvs of [this.bufferCanvas, this.finalCanvas]) {
			cvs.width = size.width;
			cvs.height = size.height;
		}
		this.finalCanvas.id = `sandbox-canvas-${this.id}`;
		this.bufferCanvas.id = `sandbox-buffer-${this.id}`;
	}

	/**
	 * 把地图画布放进窗体，底部加状态栏
	 */
	renderIn(): void {
		const renderBody = (): HTMLDivElement => {
			const body = this.ui.windowBody;
			const size = this.cfg.body.initSize ?? DEFAULT_BODY;
			body.style.width = `${size.width}px`;
			body.style.height = `${size.height}px`;
			// 地图通常比窗口大，所以窗体自己滚动
			body.style.overflow = 'scroll';
			body.appendChild(this.finalCanvas);
			return body;
		};

		const renderStatusBar = (): HTMLDivElement => {
			const bar = document.createElement('div');
			bar.classList.add('status-bar');
			this.statusText = document.createElement('p');
			this.statusText.classList.add('status-bar-field');
			this.statusText.textContent = '就绪';
			bar.appendChild(this.statusText);
			return bar;
		};

		JadeWindowUI.renderWindowTplt(this, undefined, renderBody, renderStatusBar);
	}

	/**
	 * 改状态栏的文字
	 *
	 * 用来显示「按住 Ctrl 拖动棋子」这类操作提示，以及移动请求的结果。
	 * 老应用用 `alert()` 报这些，每次都打断操作。
	 *
	 * @param text - 要显示的文字
	 */
	setStatus(text: string): void {
		if (this.statusText) { this.statusText.textContent = text; }
	}

	/**
	 * 把画布尺寸调整成地图的实际大小
	 *
	 * ## ⚠️ 这个方法会清空画布，**只能在绘制之前调**
	 *
	 * 给 canvas 的 `width` / `height` 赋值会按 HTML 规范走
	 * "set bitmap dimensions"，其中一步是重置上下文并**清空位图** ——
	 * **赋同值也照样执行**。
	 *
	 * 本方法原来的注释写的是「这一步在 `drawSceneWithUserView()` 之后调」，
	 * 那是**反的**：`sandboxView` 照着做，于是每次重画都把刚合成好的画面
	 * 擦成空白，而且不报错。已改正（2026-11-05）。
	 *
	 * 另外 **view 侧根本不需要调它** ——
	 * `SandTable.drawSceneWithUserView()` 内部已经把两张画布的
	 * width / height / style 四项都按地图尺寸设好了。
	 * 需要它的是 `sandboxEditor`：那边自己画、不走 `SandTable`，
	 * 而且**在 `drawImage` 之前**调。
	 *
	 * 两张画布都要改 —— 缓冲那张尺寸不对，合成出来的快照会被裁掉。
	 *
	 * @param width - 地图宽
	 * @param height - 地图高
	 */
	resizeCanvas(width: number, height: number): void {
		for (const cvs of [this.bufferCanvas, this.finalCanvas]) {
			cvs.width = width;
			cvs.height = height;
		}
		this.finalCanvas.style.width = `${width}px`;
		this.finalCanvas.style.height = `${height}px`;
	}

	/**
	 * 把鼠标事件的页面坐标换算成画布坐标
	 *
	 * ⚠️ **不要用老代码的 `sumCanvasOffset()`** —— 那是递归累加
	 * `offsetLeft/offsetTop`，而且 view 与 editor 两份实现符号还相反
	 *（一个减一个加）。窗口可拖动、可滚动之后那套必然失效。
	 *
	 * `getBoundingClientRect()` 返回的是元素在视口里的真实位置，
	 * 已经把窗口位移、窗体滚动、页面滚动全算进去了。
	 *
	 * @param e - 鼠标事件
	 * @returns {{x: number, y: number}} 画布坐标
	 */
	toCanvasPoint(e: MouseEvent): { x: number, y: number } {
		const rect = this.finalCanvas.getBoundingClientRect();
		return { x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) };
	}

}

/**
 * 掷骰窗口
 *
 * 玩家侧：输入表达式（`2d6+1d4+3`）按回车掷骰，下方显示全场结果。
 * GM 侧多一行「给谁设阈值」，由 {@link SandboxDiceWindow.enableGmPanel} 打开。
 *
 * 结果文本由 `sandboxApi.ts` 的 `renderRollResults()` 生成 ——
 * 玩家看不到 GM 设的阈值，所以同一份数据两种渲染。
 */
export class SandboxDiceWindow extends UIWindowAdapter {

	/** 骰子表达式输入框 */
	readonly cmdInput: HTMLInputElement = document.createElement('input');
	/** 结果显示区（只读多行文本） */
	readonly logArea: HTMLTextAreaElement = document.createElement('textarea');
	/** GM 用：选被要求检定的玩家 */
	readonly targetSelect: HTMLSelectElement = document.createElement('select');
	/** GM 用：阈值输入框 */
	readonly thresholdInput: HTMLInputElement = document.createElement('input');
	/** GM 面板的容器，默认隐藏 */
	private gmPanel: HTMLDivElement = document.createElement('div');

	/**
	 * @param desktop - 所在桌面
	 * @param id - 窗口 ID
	 * @param title - 窗口标题
	 * @param cfg - 窗口参数
	 */
	constructor(desktop: UIDesktop, id: string, title: string, cfg?: WinParam) {
		super(desktop, id, title, cfg);
		this.cmdInput.type = 'text';
		this.cmdInput.placeholder = '例如 2d6+1d4+3，回车掷骰';
		this.cmdInput.style.width = '100%';
		this.logArea.readOnly = true;
		this.logArea.rows = 10;
		this.logArea.style.width = '100%';
		this.thresholdInput.type = 'number';
		this.thresholdInput.placeholder = '阈值';
	}

	/**
	 * 拼窗体：GM 面板（默认隐藏）+ 掷骰输入 + 结果区
	 *
	 * 用的全是 98.css 的原生标签样式与 `.field-row` —— 不自己写表单样式。
	 */
	renderIn(): void {
		const renderBody = (): HTMLDivElement => {
			const body = this.ui.windowBody;

			// GM 面板：给某个玩家设检定阈值
			this.gmPanel.style.display = 'none';
			const gmRow = document.createElement('div');
			gmRow.classList.add('field-row');
			const gmLabel = document.createElement('label');
			gmLabel.textContent = '要求检定：';
			gmRow.appendChild(gmLabel);
			gmRow.appendChild(this.targetSelect);
			gmRow.appendChild(this.thresholdInput);
			this.gmPanel.appendChild(gmRow);
			body.appendChild(this.gmPanel);

			// 玩家掷骰
			const rollRow = document.createElement('div');
			rollRow.classList.add('field-row-stacked');
			const rollLabel = document.createElement('label');
			rollLabel.textContent = '掷骰：';
			rollRow.appendChild(rollLabel);
			rollRow.appendChild(this.cmdInput);
			body.appendChild(rollRow);

			// 结果区。外面套 sunken-panel 是 98.css 给列表/文本区的内凹边框
			const panel = document.createElement('div');
			panel.classList.add('sunken-panel');
			panel.appendChild(this.logArea);
			body.appendChild(panel);
			return body;
		};

		JadeWindowUI.renderWindowTplt(this, undefined, renderBody, undefined);
	}

	/**
	 * 打开 GM 面板，并填入可选的玩家名单
	 *
	 * ⚠️ `set-roll-threshold` 的 `username` 是**被设定的对象**，不是调用者 ——
	 * 所以这里列的是场景里的玩家棋子 ID，GM 自己不在其中。
	 *
	 * @param usernames - 玩家名单（取自场景的 teams 分组）
	 */
	enableGmPanel(usernames: Array<string>): void {
		this.gmPanel.style.display = '';
		this.targetSelect.innerHTML = '';
		for (const name of usernames) {
			const opt = document.createElement('option');
			opt.value = name;
			opt.textContent = name;
			this.targetSelect.appendChild(opt);
		}
	}

	/**
	 * 显示检定结果
	 * @param text - `renderRollResults()` 生成的文本
	 */
	setLog(text: string): void {
		this.logArea.value = text;
	}

}

/**
 * Token 列表窗口（GM 用）
 *
 * 老界面是一排 emoji 分组按钮 + 一张表格 + 下方的创建按钮，
 * 挤在 `#tokenGroupBtns` / `#tokenListArea` / `#createTokenArea` 三个 div 里，
 * 高度靠 `resizeLayout()` 手算。这里合成一个窗口。
 *
 * 分组切换用 98.css 的 `menu[role=tablist]` 标签页（选中态靠
 * `aria-selected`），内容包在 `.window[role=tabpanel]` 里；
 * 表格用 `table.interactive` + `tr.highlighted` 做选中态，
 * 外面套 `.sunken-panel` 给内凹边框 —— 不自己写样式。
 */
export class SandboxTokenListWindow extends UIWindowAdapter {

	/** 分组标签页的容器（98.css 的 menu[role=tablist]） */
	readonly groupBar: HTMLMenuElement = document.createElement('menu');
	/** Token 列表的表格主体 */
	readonly listBody: HTMLTableSectionElement = document.createElement('tbody');
	/** 创建新 Token 的按钮容器（按分组变化） */
	readonly createBar: HTMLDivElement = document.createElement('div');

	/**
	 * 拼窗体：标签页 → 列表 → 创建按钮
	 */
	renderIn(): void {
		const renderBody = (): HTMLDivElement => {
			const body = this.ui.windowBody;
			const size = this.cfg.body.initSize ?? DEFAULT_BODY;
			body.style.width = `${size.width}px`;
			body.style.height = `${size.height}px`;
			body.style.overflow = 'auto';

			// 98.css 的标签页：menu[role=tablist] 是标签栏
			this.groupBar.setAttribute('role', 'tablist');
			body.appendChild(this.groupBar);

			// 标签内容面板：98.css 的 .window[role=tabpanel] 给内凹窗口边框
			const tabPanel = document.createElement('div');
			tabPanel.classList.add('window');
			tabPanel.setAttribute('role', 'tabpanel');
			const tabBody = document.createElement('div');
			tabBody.classList.add('window-body');
			tabPanel.appendChild(tabBody);

			const panel = document.createElement('div');
			panel.classList.add('sunken-panel');
			// 列表可能很长，给个固定高度让它自己滚
			panel.style.height = `${Math.max(120, size.height - 110)}px`;
			const table = document.createElement('table');
			table.classList.add('interactive');
			table.style.width = '100%';
			table.appendChild(this.listBody);
			panel.appendChild(table);
			tabBody.appendChild(panel);

			this.createBar.classList.add('field-row');
			tabBody.appendChild(this.createBar);

			body.appendChild(tabPanel);
			return body;
		};

		JadeWindowUI.renderWindowTplt(this, undefined, renderBody, undefined);
	}

}

/**
 * Token 属性编辑窗口（GM 用）
 *
 * 老界面把属性表单塞在地图下方的 `#tk-prop-editer` 里，
 * 用四段拼好的 HTML 字符串（`editorHtmlLine` / `Rect` / `Circ` / `Img`）
 * 按 Token 类型替换 `innerHTML`，再用 `$('#tkX').val()` 逐个读回。
 *
 * 这里保留「按类型换表单」的思路，但表单由 {@link SandboxPropsWindow.renderFields}
 * 按字段描述生成，读值走 `fieldValue()` —— 不再手写 20 个 id。
 */
/** 属性表单里一个字段的控件：单个输入框/下拉框，或一组单选框 */
type FieldControl =
	| { kind: 'single', el: HTMLInputElement | HTMLSelectElement }
	| { kind: 'radio', radios: HTMLInputElement[] };

export class SandboxPropsWindow extends UIWindowAdapter {

	/** 表单容器 */
	readonly form: HTMLDivElement = document.createElement('div');
	/** 图片裁剪预览画布 */
	readonly clipCanvas: HTMLCanvasElement = document.createElement('canvas');
	/** 字段名 → 控件（单选组是多个 radio 共用一个 key） */
	private readonly fields: Map<string, FieldControl> = new Map();

	/**
	 * 拼窗体：表单 + 图片裁剪预览
	 */
	renderIn(): void {
		const renderBody = (): HTMLDivElement => {
			const body = this.ui.windowBody;
			const size = this.cfg.body.initSize ?? DEFAULT_BODY;
			body.style.width = `${size.width}px`;
			body.style.height = `${size.height}px`;
			body.style.overflow = 'auto';
			body.appendChild(this.form);

			const panel = document.createElement('div');
			panel.classList.add('sunken-panel');
			panel.appendChild(this.clipCanvas);
			body.appendChild(panel);
			return body;
		};

		const renderStatusBar = (): HTMLDivElement => {
			const bar = document.createElement('div');
			bar.classList.add('status-bar');
			const p = document.createElement('p');
			p.classList.add('status-bar-field');
			p.textContent = '点选元素：Shift+拖动=框选裁剪；Ctrl+拖动=移动；Alt+拖动=缩放';
			bar.appendChild(p);
			return bar;
		};

		JadeWindowUI.renderWindowTplt(this, undefined, renderBody, renderStatusBar);
	}

	/**
	 * 按字段描述重建表单
	 *
	 * @param defs - 字段描述。带 `options` 的字段：`widget: 'radio'` 渲染成
	 * 98.css 的 OptionButton（一组 radio），否则渲染成 `<select>` 下拉框。
	 * 不带 `options` 的渲染成 `<input>`。
	 */
	renderFields(defs: Array<{
		key: string, label: string, value: string,
		type?: string, options?: Array<[string, string]>, widget?: 'radio',
	}>): void {
		this.form.innerHTML = '';
		this.fields.clear();
		for (const d of defs) {
			const row = document.createElement('div');
			row.classList.add('field-row');
			const label = document.createElement('label');
			label.textContent = d.label;
			label.style.width = '5em';
			row.appendChild(label);

			if (d.options) {
				if (d.widget === 'radio') {
					// 98.css 的 OptionButton：`input[type=radio]` 后面紧跟 `label`，
					// 圆点与选中点全靠这两个相邻选择器画出来 —— 别拆开，
					// 也不要用「label 包 input」，那会让 `+` 选择器失效。
					const radios: HTMLInputElement[] = [];
					d.options.forEach(([v, t], i) => {
						const radio = document.createElement('input');
						radio.type = 'radio';
						radio.name = d.key;
						radio.value = v;
						radio.checked = v === d.value;
						radio.id = `fld-${d.key}-${i}`;
						row.appendChild(radio);
						const optLabel = document.createElement('label');
						optLabel.htmlFor = radio.id;
						optLabel.textContent = t;
						row.appendChild(optLabel);
						radios.push(radio);
					});
					this.fields.set(d.key, { kind: 'radio', radios });
				} else {
					// 下拉框：选项多的字段用它（如「图片」的图片资源列表）
					const sel = document.createElement('select');
					for (const [v, t] of d.options) {
						const opt = document.createElement('option');
						opt.value = v;
						opt.textContent = t;
						sel.appendChild(opt);
					}
					sel.value = d.value;
					row.appendChild(sel);
					this.fields.set(d.key, { kind: 'single', el: sel });
				}
			} else {
				const ipt = document.createElement('input');
				ipt.type = d.type ?? 'text';
				ipt.value = d.value;
				row.appendChild(ipt);
				this.fields.set(d.key, { kind: 'single', el: ipt });
			}
			this.form.appendChild(row);
		}
	}

	/**
	 * 读某个字段的当前值
	 *
	 * @param key - 字段名
	 * @returns {string} 字段不存在时返回空串
	 */
	fieldValue(key: string): string {
		const f = this.fields.get(key);
		if (!f) { return ''; }
		if (f.kind === 'radio') { return f.radios.find(r => r.checked)?.value ?? ''; }
		return f.el.value;
	}

	/**
	 * 设置某个字段的值（裁剪区域拖动用）
	 *
	 * 直接改 `input.value`，不触发 change 事件 —— 拖动的实时反馈由调用方
	 * 自己重画预览，松手时再统一走 `applyProps` 写回 Token。
	 *
	 * @param key - 字段名
	 * @param value - 新值
	 */
	setFieldValue(key: string, value: string): void {
		const f = this.fields.get(key);
		if (!f) { return; }
		if (f.kind === 'radio') {
			for (const r of f.radios) { r.checked = r.value === value; }
		} else {
			f.el.value = value;
		}
	}

	/**
	 * 给表单的每个字段绑定变更回调
	 *
	 * 老代码是「改完按按钮提交」，这里改成**改完即生效** ——
	 * 编辑地图时属性改一下就要看到效果，多一次点击很烦。
	 *
	 * @param onChange - 任一字段变更时调用
	 */
	bindChange(onChange: () => void): void {
		for (const f of this.fields.values()) {
			if (f.kind === 'radio') {
				for (const r of f.radios) { r.addEventListener('change', onChange); }
			} else {
				f.el.addEventListener('change', onChange);
			}
		}
	}

	/** 清空表单与预览（没选中 Token 时） */
	clear(): void {
		this.form.innerHTML = '';
		this.fields.clear();
		this.clipCanvas.width = 10;
		this.clipCanvas.height = 10;
	}

}

/**
 * 场景操作窗口（GM 用）
 *
 * 装「保存并发布」「刷新请求」两个按钮、「定时刷新」开关和场景信息。
 * 老界面这两个按钮在 `#optSaveBtns` 里，由 `listGroupTokens()` 顺手
 * 用 `innerHTML` 重建 —— 切一次分组就重建一遍，没必要。
 */
export class SandboxSceneWindow extends UIWindowAdapter {

	/** 保存并发布 */
	readonly saveBtn: HTMLButtonElement = document.createElement('button');
	/** 刷新移动请求 */
	readonly refreshBtn: HTMLButtonElement = document.createElement('button');
	/** 定时刷新开关（选中后每 3 秒自动刷新一次移动请求） */
	readonly autoRefresh: HTMLInputElement = document.createElement('input');
	/** 当前角色视野开关（选中后以选中的玩家/生物为观察者显示视野与遮挡） */
	readonly autoView: HTMLInputElement = document.createElement('input');
	/** 信息显示区 */
	readonly info: HTMLParagraphElement = document.createElement('p');

	/**
	 * 拼窗体：两个按钮 + 定时刷新开关 + 信息行
	 */
	renderIn(): void {
		const renderBody = (): HTMLDivElement => {
			const body = this.ui.windowBody;
			body.style.overflow = 'auto';
			this.saveBtn.textContent = '保存并发布';
			// 98.css 的 button.default 是带强调边框的主按钮
			this.saveBtn.classList.add('default');
			this.refreshBtn.textContent = '刷新请求';
			const row = document.createElement('div');
			row.classList.add('field-row');
			row.appendChild(this.saveBtn);
			row.appendChild(this.refreshBtn);
			body.appendChild(row);

			// 定时刷新开关。98.css 的 checkbox 用 `input + label` 相邻兄弟
			// 选择器画外观，所以 label 必须紧跟 input、且用 for 关联。
			this.autoRefresh.type = 'checkbox';
			this.autoRefresh.id = 'sandbox-auto-refresh';
			const refreshRow = document.createElement('div');
			refreshRow.classList.add('field-row');
			const refreshLabel = document.createElement('label');
			refreshLabel.htmlFor = 'sandbox-auto-refresh';
			refreshLabel.textContent = '定时刷新';
			refreshRow.appendChild(this.autoRefresh);
			refreshRow.appendChild(refreshLabel);
			body.appendChild(refreshRow);

			// 当前角色视野开关。同样是 98.css checkbox，label 紧跟 input、用 for 关联。
			this.autoView.type = 'checkbox';
			this.autoView.id = 'sandbox-auto-view';
			const viewRow = document.createElement('div');
			viewRow.classList.add('field-row');
			const viewLabel = document.createElement('label');
			viewLabel.htmlFor = 'sandbox-auto-view';
			viewLabel.textContent = '当前角色视野';
			viewRow.appendChild(this.autoView);
			viewRow.appendChild(viewLabel);
			body.appendChild(viewRow);

			body.appendChild(this.info);
			return body;
		};

		JadeWindowUI.renderWindowTplt(this, undefined, renderBody, undefined);
	}

	/**
	 * 显示一行信息
	 * @param text - 要显示的文字
	 */
	setInfo(text: string): void {
		this.info.textContent = text;
	}

}
