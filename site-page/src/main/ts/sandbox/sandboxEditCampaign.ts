import { registerDefaultUIResource } from '@jade-dungeon/jade-utils/resource';
import {
	JadeWindowUI, UIDesktop, UIWindowAdapter, WinParam,
} from '@jade-dungeon/jade-utils/ui-window';
import { SandboxApi } from './sandboxApi.js';
import { UIButton, UIFieldset } from './components/comm.js';

/**
 * 沙盘的「编辑战役」页（editCampaign.html）
 *
 * 战役的**地点（place）与场景（scene）目前是「开发人员线下手动 INSERT」的过渡状态**，
 * 前端没有任何界面能增删改这些记录 —— 本页补上这一环。从选战役页的「编辑战役」
 * 按钮跳进来（只带 `campaignId` + `campaignName`，不带 place / scene）。
 *
 * 页面上是**一个窗口**（风格和 index / editor 一致：98.css + 桌面 + 底部 dock），
 * 窗口 body 里放两个左右并排的 `<fieldset>`：
 *
 * | fieldset | 内容 |
 * |----------|------|
 * | 地点编辑 | 上表格列出该战役的地点，下属性编辑区改选中地点的属性 |
 * | 场景编辑 | 上表格列出该战役的场景，下属性编辑区改选中场景的属性 |
 *
 * 两个 fieldset 布局完全一样，所以抽成 {@link SandboxRecordEditorPanel} 一个类，
 * 只差表格列、表单字段、以及三件回调（加载 / 保存 / 删除）。表格最右一列是 `🗑️`
 * 删除按钮（`stopPropagation` 避免点了删除又触发整行选中，参考 `sandboxEditor.ts`
 * 的 `renderImageList()`）。
 *
 * 写操作（保存 / 删除）走 token 鉴权，非 owner 会得到「not owner」——
 * 页面进入时先查一次 owner，不是本人就提前在窗口顶部提示「改动存不上」。
 */

// ───────────────────────── 可复用的「上表格 + 下表单」fieldset ─────────────────────────

/** 表格里一列的定义 */
interface ColumnDef {
	/** 记录的字段名 */
	key: string;
	/** 表头文字 */
	label: string;
}

/** 属性编辑区一个字段的定义 */
interface FieldDef {
	/** 记录的字段名 */
	key: string;
	/** 字段标签 */
	label: string;
	/** 输入控件类型，缺省 `text` */
	type?: 'text' | 'number' | 'textarea';
}

/** 一条记录：数字 id + 若干字符串字段（地点 / 场景的字段值都按字符串读） */
interface RecordRow {
	id: number;
	[key: string]: string | number;
}

/** fieldset 要做的三件事，由页面注入（地点 / 场景各自实现） */
interface RecordEditorHandlers {
	/** 拉取列表并 `setRecords` */
	load: () => Promise<void>;
	/** 提交：`id` 为 `undefined` 表示新建 */
	save: (id: number | undefined, values: Record<string, string>) => Promise<void>;
	/** 删除某条记录 */
	remove: (id: number) => Promise<void>;
}

/** fieldset 的配置：列 / 表单字段 / 三件回调 + 可选的额外按钮 */
interface RecordEditorOpts {
	columns: ColumnDef[];
	fieldDefs: FieldDef[];
	handlers: RecordEditorHandlers;
	/** 可选：额外的按钮（放在「新建」「提交」之后），点击回调收到当前选中记录 */
	editBtn?: { label: string; onClick: (rec: RecordRow | undefined) => void };
	/** 可选：「新建」时填入表单的字段默认值（点「新建」时才求值） */
	newDefaults?: () => Record<string, string>;
}

/**
 * 一个「上表格 + 下属性编辑」的记录编辑面板，渲染成一个 `<fieldset>`
 *
 * 地点 / 场景两个 fieldset 共用它。表格列出记录（每行最右是删除按钮），点行选中；
 * 下面是选中记录的字段表单，「提交」走 upsert（新建时 id 为空），「新建」清空
 * 表单进入新建态。整个 fieldset 由窗口在 `renderIn()` 时塞进 body。
 */
class SandboxRecordEditorPanel {

	/** 整个 fieldset，交给窗口塞进 body */
	readonly fieldset: HTMLFieldSetElement;
	/** 表格主体 */
	readonly tbody: HTMLTableSectionElement = document.createElement('tbody');
	/** 表格本体（列宽拖拽改它的 <col>，见 buildFieldset） */
	private readonly table: HTMLTableElement = document.createElement('table');
	/** 每个数据列的 <col>，不含末尾删除列 —— 拖拽列宽时改它们的 width */
	private readonly colEls: HTMLTableColElement[] = [];
	/** 表单容器（字段在构造时按 fieldDefs 建好，不随选中变化） */
	private readonly form: HTMLDivElement = document.createElement('div');
	/** 选中记录的 ID 展示行 */
	private readonly idEl: HTMLParagraphElement = document.createElement('p');
	/** 新建按钮 */
	private readonly newBtn: HTMLButtonElement;
	/** 提交按钮 */
	private readonly submitBtn: HTMLButtonElement;
	/** fieldset 底部的状态行 */
	private readonly noteEl: HTMLParagraphElement = document.createElement('p');
	/** 字段名 → 输入控件 */
	private readonly fields: Map<string, HTMLInputElement | HTMLTextAreaElement> = new Map();

	private readonly columns: ColumnDef[];
	private readonly fieldDefs: FieldDef[];
	private readonly handlers: RecordEditorHandlers;
	/** 可选的「编辑场景」按钮（只有传了 editBtn 配置才建） */
	private readonly editBtn?: HTMLButtonElement;
	/** 可选：「新建」时填入表单的字段默认值 */
	private readonly newDefaults?: () => Record<string, string>;
	/** 当前选中的记录 id，`undefined` 表示新建态 */
	private selectedId: number | undefined;
	/** 当前选中的完整记录，`undefined` 表示未选中 / 新建态 */
	private selectedRec: RecordRow | undefined;

	/** 当前选中的记录 id（供别的面板读，如场景新建时带出地点 id） */
	get currentId(): number | undefined { return this.selectedId; }

	constructor(id: string, title: string, opts: RecordEditorOpts) {
		this.columns = opts.columns;
		this.fieldDefs = opts.fieldDefs;
		this.handlers = opts.handlers;
		this.newDefaults = opts.newDefaults;

		// legend 标题
		this.fieldset = UIFieldset.createElem({ title: title });
		

		// 给几个元素挂上基于面板 id 的 id，方便单元测试定位（也方便调试）
		this.tbody.id = `${id}-rows`;
		this.form.id = `${id}-form`;
		this.idEl.id = `${id}-id`;
		this.noteEl.id = `${id}-note`;

		this.newBtn = UIButton.createElem({
			id: `${id}-new`,
			textContent: '➕',
			classList: ["table-cell-opt-btn"],
			events: { click: (e) => { this.newRecord(); } }
		});
		this.submitBtn = UIButton.createElem({
			id: `${id}-submit`,
			textContent: '提交',
			classList: ["default"],
			events: { click: (e) => { void this.submit(); } }
		});
		if (opts.editBtn) {
			this.editBtn = UIButton.createElem({
				id: `${id}-edit`,
				textContent: opts.editBtn.label,
				events: { click: (e) => { opts.editBtn!.onClick(this.selectedRec); } }
			});
		}

		this.buildForm();
		this.buildFieldset();
	}

	/** 组装 fieldset 的内部结构：上表格，下属性编辑区，末尾状态行 */
	private buildFieldset(): void {
		// 上：表格（98.css 没有 grid 辅助，sunken-panel 里放整宽表格）
		const panel = document.createElement('div');
		panel.classList.add('sunken-panel');
		panel.style.height = '250px';
		panel.style.width = '350px';

		// 列宽可拖拽：fixed 布局下 <col> 的 width 才是权威，拖拽只改对应 <col>。
		// 数据列等分，末尾删除列固定窄宽、不参与拖拽（见 buildHead / attachColResizer）
		this.table.classList.add('interactive', 'col-resizable');
		this.table.style.width = '100%';
		this.table.style.tableLayout = 'fixed';
		const colgroup = document.createElement('colgroup');
		for (let i = 0; i < this.columns.length; i++) {
			const col = document.createElement('col');
			this.colEls.push(col);
			colgroup.appendChild(col);
		}
		const delCol = document.createElement('col');
		delCol.style.width = '40px';
		colgroup.appendChild(delCol);
		this.table.appendChild(colgroup);

		this.table.appendChild(this.buildHead());
		this.table.appendChild(this.tbody);
		panel.appendChild(this.table);
		this.fieldset.appendChild(panel);

		// 下：属性编辑区
		this.idEl.style.margin = '4px 0';
		this.fieldset.appendChild(this.idEl);
		this.fieldset.appendChild(this.form);
		const btns = document.createElement('div');
		btns.classList.add('field-row');
		btns.appendChild(this.submitBtn);
		if (this.editBtn) { btns.appendChild(this.editBtn); }
		this.fieldset.appendChild(btns);

		this.noteEl.style.marginTop = '6px';
		this.fieldset.appendChild(this.noteEl);
	}

	/** 表头：各列 + 末尾空的删除列 */
	private buildHead(): HTMLTableSectionElement {
		const thead = document.createElement('thead');
		const tr = document.createElement('tr');
		this.columns.forEach((c, i) => {
			const th = document.createElement('th');
			th.textContent = c.label;
			this.attachColResizer(th, i);
			tr.appendChild(th);
		});
		const thDel = document.createElement('th');
		tr.appendChild(thDel);
		thead.appendChild(tr);
		return thead;
	}

	/**
	 * 给表头列挂右侧的拖拽把手：按下把手后左右拖动改这一列的宽度。
	 * 宽度改在 `colEls[index]` 上（fixed 布局下它决定整列），
	 * 起点用 `<th>` 当前渲染宽度 —— 直接读 `<col>` 的 box 不可靠。
	 */
	private attachColResizer(th: HTMLTableCellElement, index: number): void {
		const handle = document.createElement('span');
		handle.className = 'col-resizer';
		th.appendChild(handle);

		handle.addEventListener('mousedown', (e) => {
			e.preventDefault();
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

	/** 按 fieldDefs 建表单字段（一次建好，之后只改值） */
	private buildForm(): void {
		this.form.innerHTML = '';
		this.fields.clear();
		for (const f of this.fieldDefs) {
			const row = document.createElement('div');
			row.classList.add('field-row-stacked');
			const label = document.createElement('label');
			label.textContent = f.label;
			row.appendChild(label);

			let el: HTMLInputElement | HTMLTextAreaElement;
			if (f.type === 'textarea') {
				el = document.createElement('textarea');
				el.rows = 3;
			} else {
				const ipt = document.createElement('input');
				ipt.type = f.type ?? 'text';
				el = ipt;
			}
			// 挂上字段名，测试按 data-field 定位输入控件
			el.dataset.field = f.key;
			this.fields.set(f.key, el);
			row.appendChild(el);
			this.form.appendChild(row);
		}
		this.clearForm();
	}

	/**
	 * 填充表格：清空旧行，按列表顺序重填，并回到「未选中」态
	 * @param records - 记录列表
	 */
	setRecords(records: RecordRow[]): void {
		this.selectedId = undefined;
		this.tbody.replaceChildren();
		for (const rec of records) {
			this.tbody.appendChild(this.buildRow(rec));
		}
		// 记录行之后追加一行，最后一列放「新建」按钮
		this.tbody.appendChild(this.buildNewRow());
		this.clearForm();
	}

	/** 建一行：各列 + 删除按钮，点整行选中 */
	private buildRow(rec: RecordRow): HTMLTableRowElement {
		const tr = document.createElement('tr');
		tr.dataset.rid = String(rec.id);

		for (const c of this.columns) {
			const td = document.createElement('td');
			td.textContent = String(rec[c.key] ?? '');
			tr.appendChild(td);
		}


		// stopPropagation：删记录不该同时触发整行选中
		const del = UIButton.createElem({
			textContent : '❌', // 🗑
			classList: ['table-cell-opt-btn'],
			events: { click: (e) => {
					e.stopPropagation();
					// 删除不可逆，先走浏览器默认确认弹框，取消则不删
					if (!window.confirm('确定要删除这条记录吗？')) { return; }
					void this.handlers.remove(rec.id);
				}}
		});

		const tdDel = document.createElement('td');
		tdDel.appendChild(del);
		tr.appendChild(tdDel);

		tr.style.cursor = 'pointer';
		tr.addEventListener('click', () => { this.select(rec); });
		return tr;
	}

	/** 建「新建」行：前面各列空着，最后一列（删除列）放「新建」按钮 */
	private buildNewRow(): HTMLTableRowElement {
		const tr = document.createElement('tr');
		for (let i = 0; i < this.columns.length; i++) {
			tr.appendChild(document.createElement('td'));
		}
		const td = document.createElement('td');
		td.appendChild(this.newBtn);
		tr.appendChild(td);
		return tr;
	}

	/** 选中一条记录，高亮该行并回填下方表单 */
	private select(rec: RecordRow): void {
		this.selectedId = rec.id;
		this.selectedRec = rec;
		for (const tr of this.tbody.querySelectorAll<HTMLTableRowElement>('tr')) {
			tr.classList.toggle('highlighted', tr.dataset.rid === String(rec.id));
		}
		this.setFormDisabled(false);
		this.setEditBtnDisabled(false);
		for (const f of this.fieldDefs) {
			const el = this.fields.get(f.key);
			if (el) { el.value = String(rec[f.key] ?? ''); }
		}
		this.idEl.textContent = `ID: ${rec.id}`;
	}

	/** 清空选中与表单（未选中 / 新建都走这里） */
	private clearForm(): void {
		this.selectedRec = undefined;
		for (const f of this.fieldDefs) {
			const el = this.fields.get(f.key);
			if (el) { el.value = ''; }
		}
		this.idEl.textContent = '（未选中记录）';
		this.setFormDisabled(true);
		this.setEditBtnDisabled(true);
	}

	/** 让表单字段与提交按钮整体启用/禁用：未选中时禁用，选中或新建时启用 */
	private setFormDisabled(disabled: boolean): void {
		for (const el of this.fields.values()) {
			el.disabled = disabled;
		}
		this.submitBtn.disabled = disabled;
	}

	/** 「编辑场景」按钮只在真正选中一条记录时可用（新建态也没有可跳转的场景） */
	private setEditBtnDisabled(disabled: boolean): void {
		if (this.editBtn) { this.editBtn.disabled = disabled; }
	}

	/** 「新建」：清掉选中，进入新建态 */
	private newRecord(): void {
		this.selectedId = undefined;
		for (const tr of this.tbody.querySelectorAll<HTMLTableRowElement>('tr')) {
			tr.classList.remove('highlighted');
		}
		this.clearForm();
		// 可选的新建默认值：清空之后再填，比如场景新建时带出地点 id
		if (this.newDefaults) {
			for (const [key, value] of Object.entries(this.newDefaults())) {
				const el = this.fields.get(key);
				if (el) { el.value = value; }
			}
		}
		// 新建态要能输入：clearForm 刚禁用了字段，这里再启用
		this.setFormDisabled(false);
		this.setNote('新建：填好下方字段后点「提交」');
	}

	/** 「提交」：收集字段值交给页面（新建时 id 为 undefined） */
	private async submit(): Promise<void> {
		const values: Record<string, string> = {};
		for (const f of this.fieldDefs) {
			values[f.key] = this.fields.get(f.key)?.value ?? '';
		}
		await this.handlers.save(this.selectedId, values);
	}

	/** fieldset 底部状态行 */
	setNote(text: string): void {
		this.noteEl.textContent = text;
	}

}

// ───────────────────────── 编辑战役页 ─────────────────────────

/**
 * 编辑战役页的**单个窗口**：body 顶部是 owner 提示，下面是两个并排的 fieldset
 *（地点编辑 + 场景编辑）
 */
class SandboxEditCampaignWindow extends UIWindowAdapter {

	/** 窗口顶部的提示行（owner 信息，两个 fieldset 共用） */
	private readonly hintEl: HTMLParagraphElement = document.createElement('p');
	/** 「退回首页」按钮（跳回选战役页） */
	private readonly homeBtn: HTMLButtonElement;

	constructor(desktop: UIDesktop, id: string, title: string, cfg: WinParam,
		private readonly placePanel: SandboxRecordEditorPanel,
		private readonly scenePanel: SandboxRecordEditorPanel,
		onBackHome: () => void) //
	{
		super(desktop, id, title, cfg);
		this.hintEl.id = `${id}-hint`;
		this.homeBtn = UIButton.createElem({
			id: `${id}-home`,
			textContent: '退回首页',
			classList: ['default'],
			events: { click: () => { onBackHome(); } },
		});
	}

	/** 窗口顶部提示行（owner 信息） */
	setHint(text: string): void {
		this.hintEl.textContent = text;
	}

	renderIn(): void {
		const renderBody = (): HTMLDivElement => {
			const body = this.ui.windowBody;
			body.style.overflow = 'auto';
			body.style.display = 'flex';
			body.style.flexDirection = 'column';
			body.style.gap = '6px';

			// 顶部一行：owner 提示在左、「退回首页」按钮在右
			const top = document.createElement('div');
			top.style.display = 'flex';
			top.style.justifyContent = 'space-between';
			top.style.alignItems = 'center';
			this.hintEl.style.margin = '0';
			top.appendChild(this.hintEl);
			top.appendChild(this.homeBtn);
			body.appendChild(top);

			// 两个 fieldset 左右并排（98.css 没有 grid 辅助，用 flex）
			const cols = document.createElement('div');
			cols.style.display = 'flex';
			cols.style.gap = '10px';
			cols.style.alignItems = 'flex-start';

			this.placePanel.fieldset.style.flex = '1';
			this.placePanel.fieldset.style.minWidth = '0';
			this.scenePanel.fieldset.style.flex = '1';
			this.scenePanel.fieldset.style.minWidth = '0';
			cols.appendChild(this.placePanel.fieldset);
			cols.appendChild(this.scenePanel.fieldset);

			body.appendChild(cols);
			return body;
		};

		JadeWindowUI.renderWindowTplt(this, undefined, renderBody, undefined);
	}

}

/** 编辑战役页的配置，由 editCampaign.html 从 URL / cookie / envs 注入 */
export interface SandboxEditCampaignConfig {
	/** 后端根路径 */
	apiRoot: string;
	/** 桌面容器的元素 id */
	desktopId: string;
	/** 窗口 URL 图标的基地址（如 `…/3rd/SE98`） */
	iconBaseUrl: string;
	/** 战役数字 ID */
	campaignId: number;
	/** 战役显示名，只给标题栏用 */
	campaignName: string;
	/** 当前登录用户名 */
	username: string;
	/** 登录 token，写操作鉴权用 */
	loginToken: string;
	/** 场景编辑器页的地址，默认 `./editScene.html` */
	editorUrl?: string;
	/** 选战役页（首页）的地址，默认 `./index.html`，点「退回首页」跳这里 */
	indexUrl?: string;
	/**
	 * 跳转的实现，默认 `window.location.href = url`
	 *（同选战役页的 `navigate`，给单元测试观察跳转目标用）
	 */
	navigate?: (url: string) => void;
}

/**
 * 编辑战役页
 */
export class SandboxEditCampaign {

	private readonly cfg: SandboxEditCampaignConfig;
	private readonly api: SandboxApi;
	private win!: SandboxEditCampaignWindow;
	private placePanel!: SandboxRecordEditorPanel;
	private scenePanel!: SandboxRecordEditorPanel;
	/** owner 检查结果的提示文字，两张表的加载完成后也要带上它 */
	private ownerHint = '';
	/** placeId → placeName，跳编辑器时带地点显示名 */
	private readonly placeNames = new Map<number, string>();

	/**
	 * @param cfg - 页面注入的配置
	 */
	constructor(cfg: SandboxEditCampaignConfig) {
		this.cfg = cfg;
		this.api = new SandboxApi(cfg.apiRoot);
	}

	/**
	 * 启动页面：建桌面 + 一个窗口（内含地点/场景两个 fieldset），
	 * 查 owner，再拉地点 / 场景两张表
	 * @returns {Promise<void>}
	 */
	async start(): Promise<void> {
		registerDefaultUIResource();
		const host = document.getElementById(this.cfg.desktopId);
		if (!host) {
			throw new Error(`找不到桌面容器 #${this.cfg.desktopId}`);
		}
		const desktop = new UIDesktop(host, {
			dockBar: { range: 300, maxScale: 1.8 },
		});

		this.placePanel = new SandboxRecordEditorPanel('edit-campaign-place', '地点编辑', {
			columns: [
				{ key: 'id', label: '地点ID' },
				{ key: 'placeName', label: '地点名' },
			],
			fieldDefs: [
				{ key: 'placeName', label: '地点名', type: 'text' },
				{ key: 'detailInfo', label: '描述', type: 'textarea' },
			],
			handlers: {
				load: () => this.loadPlaces(),
				save: (id, values) => this.savePlace(id, values),
				remove: (id) => this.removePlace(id),
			},
		});

		this.scenePanel = new SandboxRecordEditorPanel('edit-campaign-scene', '场景编辑', {
			columns: [
				{ key: 'id', label: '场景ID' },
				{ key: 'sceneName', label: '场景名' },
				{ key: 'placeId', label: '所属地点 ID' },
			],
			fieldDefs: [
				{ key: 'sceneName', label: '场景名', type: 'text' },
				{ key: 'placeId', label: '地点 ID', type: 'number' },
				{ key: 'detailInfo', label: '描述', type: 'textarea' },
			],
			handlers: {
				load: () => this.loadScenes(),
				save: (id, values) => this.saveScene(id, values),
				remove: (id) => this.removeScene(id),
			},
			editBtn: { label: '编辑场景', onClick: (rec) => this.editScene(rec) },
			// 点「新建」时，把地点表当前选中记录 id 带到「地点 ID」输入框
			newDefaults: () => {
				const defaults: Record<string, string> = {};
				const placeId = this.placePanel.currentId;
				if (placeId !== undefined) { defaults.placeId = String(placeId); }
				return defaults;
			},
		});

		this.win = new SandboxEditCampaignWindow(desktop, 'edit-campaign', '编辑战役',
			{
				icons: this.icon('actions', 'application-menu.png'),
				body: { initSize: { width: 1160, height: 560 }, overflow: 'auto' },
			},
			this.placePanel, this.scenePanel,
			() => this.backHome());
		this.win.renderIn();

		await this.checkOwner();
		await this.loadPlaces();
		await this.loadScenes();
	}

	/**
	 * 构造一个带完整基地址的 URL 图标记录（同 `sandboxEditor.ts` 的写法）
	 */
	private icon(category: string, name: string) {
		return { supportSizes: 30, baseUrl: this.cfg.iconBaseUrl, category, name };
	}

	/**
	 * 查战役 owner，把结果提示到窗口顶部
	 *
	 * 写操作本身靠 token 鉴权（后端会拦非 owner），这里提前提示是为了
	 * 别让非 owner 填了半天才发现存不上（对齐 editor 的 loadScene）。
	 *
	 * @returns {Promise<void>}
	 */
	private async checkOwner(): Promise<void> {
		const r = await this.api.mapOwner(this.cfg.campaignId);
		if (r.ok && r.data) {
			this.ownerHint = r.data === this.cfg.username
				? `拥有者：${this.cfg.username}`
				: `⚠️ 本战役属于 ${r.data}，你的改动存不上`;
		} else {
			this.ownerHint = '⚠️ 找不到这个战役 —— 检查战役 ID 是否已建';
		}
		this.win.setHint(this.ownerHint);
	}

	// ── 地点 ──

	/** 拉地点列表填表 */
	private async loadPlaces(): Promise<void> {
		this.placePanel.setNote('加载地点……');
		const r = await this.api.listPlaces(this.cfg.campaignId);
		if (!r.ok || !r.data) {
			this.placePanel.setNote(`加载地点失败：${r.msg ?? '未知错误'}`);
			return;
		}
		this.placeNames.clear();
		for (const p of r.data) { this.placeNames.set(p.id, p.placeName); }
		this.placePanel.setRecords(r.data.map((p): RecordRow => ({
			id: p.id, placeName: p.placeName, detailInfo: p.detailInfo,
		})));
		this.placePanel.setNote(`共 ${r.data.length} 个地点`);
	}

	/** 保存（新建或更新）地点 */
	private async savePlace(id: number | undefined, values: Record<string, string>): Promise<void> {
		const name = (values.placeName ?? '').trim();
		if (!name) { this.placePanel.setNote('地点名不能为空'); return; }
		this.placePanel.setNote('保存中……');
		const r = await this.api.savePlace(this.cfg.campaignId, id, name,
			values.detailInfo ?? '', this.cfg.loginToken);
		if (!r.ok) {
			this.placePanel.setNote(`保存失败：${this.ownerMsg(r.msg)}`);
			return;
		}
		await this.loadPlaces();
		this.placePanel.setNote(id === undefined ? '已新建地点' : '已保存地点');
	}

	/** 删除地点 */
	private async removePlace(id: number): Promise<void> {
		this.placePanel.setNote('删除中……');
		const r = await this.api.deletePlace(this.cfg.campaignId, id, this.cfg.loginToken);
		if (!r.ok) {
			this.placePanel.setNote(`删除失败：${r.msg ?? '未知错误'}`);
			return;
		}
		await this.loadPlaces();
		this.placePanel.setNote('已删除地点');
	}

	// ── 场景 ──

	/** 拉场景列表填表 */
	private async loadScenes(): Promise<void> {
		this.scenePanel.setNote('加载场景……');
		const r = await this.api.listCampaignScenes(this.cfg.campaignId);
		if (!r.ok || !r.data) {
			this.scenePanel.setNote(`加载场景失败：${r.msg ?? '未知错误'}`);
			return;
		}
		this.scenePanel.setRecords(r.data.map((s): RecordRow => ({
			id: s.id, sceneName: s.sceneName, placeId: s.placeId, detailInfo: s.detailInfo,
		})));
		this.scenePanel.setNote(`共 ${r.data.length} 个场景`);
	}

	/** 保存（新建或更新）场景 */
	private async saveScene(id: number | undefined, values: Record<string, string>): Promise<void> {
		const name = (values.sceneName ?? '').trim();
		if (!name) { this.scenePanel.setNote('场景名不能为空'); return; }
		const placeId = Number(values.placeId);
		if (!Number.isInteger(placeId) || placeId <= 0) {
			this.scenePanel.setNote('地点 ID 要是正整数');
			return;
		}
		this.scenePanel.setNote('保存中……');
		const r = await this.api.saveScene(this.cfg.campaignId, id, placeId, name,
			values.detailInfo ?? '', this.cfg.loginToken);
		if (!r.ok) {
			this.scenePanel.setNote(`保存失败：${this.ownerMsg(r.msg)}`);
			return;
		}
		await this.loadScenes();
		this.scenePanel.setNote(id === undefined ? '已新建场景' : '已保存场景');
	}

	/** 删除场景 */
	private async removeScene(id: number): Promise<void> {
		this.scenePanel.setNote('删除中……');
		const r = await this.api.deleteScene(this.cfg.campaignId, id, this.cfg.loginToken);
		if (!r.ok) {
			this.scenePanel.setNote(`删除失败：${r.msg ?? '未知错误'}`);
			return;
		}
		await this.loadScenes();
		this.scenePanel.setNote('已删除场景');
	}

	/**
	 * 「编辑场景」按钮：带着当前选中的场景跳编辑器页（editScene.html）
	 *
	 * 这里选中的是场景级记录（已有 placeId / 场景 id），三级定位的 3 个数字 id
	 * 都能凑齐：campaignId 用页面配置、placeId / sceneId 用选中记录。显示名里
	 * 地点名从地点表（placeId → placeName）反查，场景名直接用选中记录。
	 * 跳转前同样检查登录态与是否选中（对齐选战役页的 `enter` 逻辑）。
	 */
	private editScene(rec: RecordRow | undefined): void {
		if (!this.cfg.username || !this.cfg.loginToken) {
			this.scenePanel.setNote('请先登录');
			return;
		}
		if (!rec) {
			this.scenePanel.setNote('请先选中一个场景');
			return;
		}
		const placeId = Number(rec.placeId);
		const q = `?campaignId=${encodeURIComponent(String(this.cfg.campaignId))}`
			+ `&placeId=${encodeURIComponent(String(placeId))}`
			+ `&sceneId=${encodeURIComponent(String(rec.id))}`
			+ `&campaignName=${encodeURIComponent(this.cfg.campaignName)}`
			+ `&placeName=${encodeURIComponent(this.placeName(placeId))}`
			+ `&sceneName=${encodeURIComponent(String(rec.sceneName ?? ''))}`;
		this.go(`${this.cfg.editorUrl ?? './editScene.html'}${q}`);
	}

	/**
	 * 「退回首页」：带着当前战役参数回选战役页（index.html），
	 * 让选战役页能按 URL 里的 `campaignId` 回填选中（对齐选战役页的
	 * `editCampaign()` 和 editCampaign.html 里未登录时的跳转）。
	 */
	private backHome(): void {
		const q = `?campaignId=${encodeURIComponent(String(this.cfg.campaignId))}`
			+ `&campaignName=${encodeURIComponent(this.cfg.campaignName)}`;
		this.go(`${this.cfg.indexUrl ?? './index.html'}${q}`);
	}

	/** 按 placeId 反查地点显示名，查不到给空串 */
	private placeName(placeId: number): string {
		return this.placeNames.get(placeId) ?? '';
	}

	/** 跳转（默认 `window.location.href = url`，可用 `navigate` 覆盖） */
	private go(url: string): void {
		const fn = this.cfg.navigate ?? ((u: string) => { window.location.href = u; });
		fn(url);
	}

	/** 把后端的 `not owner` 翻成可读的中文提示 */
	private ownerMsg(msg?: string): string {
		return msg === 'not owner' ? '你不是这个战役的拥有者' : (msg ?? '未知错误');
	}

}

/**
 * 编辑战役页的入口
 *
 * @param cfg - 页面注入的配置
 * @returns {Promise<SandboxEditCampaign>} 已启动的页面实例
 */
export async function initSandboxEditCampaign(
	cfg: SandboxEditCampaignConfig): Promise<SandboxEditCampaign> //
{
	const page = new SandboxEditCampaign(cfg);
	await page.start();
	return page;
}
