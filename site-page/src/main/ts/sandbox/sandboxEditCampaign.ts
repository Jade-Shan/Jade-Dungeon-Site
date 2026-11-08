import { registerDefaultUIResource } from '@jade-dungeon/jade-utils/resource';
import {
	JadeWindowUI, UIDesktop, UIWindowAdapter, WinParam,
} from '@jade-dungeon/jade-utils/ui-window';
import { SandboxApi } from './sandboxApi.js';

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
 * 只差表格列、表单字段、以及三件回调（加载 / 保存 / 删除）。表格最右一列是 `✕`
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
	readonly fieldset: HTMLFieldSetElement = document.createElement('fieldset');
	/** 表格主体 */
	readonly tbody: HTMLTableSectionElement = document.createElement('tbody');
	/** 表单容器（字段在构造时按 fieldDefs 建好，不随选中变化） */
	private readonly form: HTMLDivElement = document.createElement('div');
	/** 选中记录的 ID 展示行 */
	private readonly idEl: HTMLParagraphElement = document.createElement('p');
	/** 新建按钮 */
	private readonly newBtn: HTMLButtonElement = document.createElement('button');
	/** 提交按钮 */
	private readonly submitBtn: HTMLButtonElement = document.createElement('button');
	/** fieldset 底部的状态行 */
	private readonly noteEl: HTMLParagraphElement = document.createElement('p');
	/** 字段名 → 输入控件 */
	private readonly fields: Map<string, HTMLInputElement | HTMLTextAreaElement> = new Map();

	private readonly columns: ColumnDef[];
	private readonly fieldDefs: FieldDef[];
	private readonly handlers: RecordEditorHandlers;
	/** 可选的「编辑场景」按钮（只有传了 editBtn 配置才建） */
	private readonly editBtn?: HTMLButtonElement;
	/** 当前选中的记录 id，`undefined` 表示新建态 */
	private selectedId: number | undefined;
	/** 当前选中的完整记录，`undefined` 表示未选中 / 新建态 */
	private selectedRec: RecordRow | undefined;

	constructor(id: string, title: string, opts: RecordEditorOpts) {
		this.columns = opts.columns;
		this.fieldDefs = opts.fieldDefs;
		this.handlers = opts.handlers;

		// legend 标题
		const legend = document.createElement('legend');
		legend.textContent = title;
		this.fieldset.appendChild(legend);

		// 给几个元素挂上基于面板 id 的 id，方便单元测试定位（也方便调试）
		this.tbody.id = `${id}-rows`;
		this.form.id = `${id}-form`;
		this.idEl.id = `${id}-id`;
		this.noteEl.id = `${id}-note`;

		this.newBtn.id = `${id}-new`;
		this.submitBtn.id = `${id}-submit`;
		this.newBtn.textContent = '新建';
		this.submitBtn.textContent = '提交';
		this.submitBtn.classList.add('default');
		this.newBtn.addEventListener('click', () => { this.newRecord(); });
		this.submitBtn.addEventListener('click', () => { void this.submit(); });

		if (opts.editBtn) {
			const btn = document.createElement('button');
			btn.id = `${id}-edit`;
			btn.textContent = opts.editBtn.label;
			btn.addEventListener('click', () => { opts.editBtn!.onClick(this.selectedRec); });
			this.editBtn = btn;
		}

		this.buildForm();
		this.buildFieldset();
	}

	/** 组装 fieldset 的内部结构：上表格，下属性编辑区，末尾状态行 */
	private buildFieldset(): void {
		// 上：表格（98.css 没有 grid 辅助，sunken-panel 里放整宽表格）
		const panel = document.createElement('div');
		panel.classList.add('sunken-panel');
		const table = document.createElement('table');
		table.classList.add('interactive');
		table.style.width = '100%';
		table.appendChild(this.buildHead());
		table.appendChild(this.tbody);
		panel.appendChild(table);
		this.fieldset.appendChild(panel);

		// 下：属性编辑区
		this.idEl.style.margin = '4px 0';
		this.fieldset.appendChild(this.idEl);
		this.fieldset.appendChild(this.form);
		const btns = document.createElement('div');
		btns.classList.add('field-row');
		btns.appendChild(this.newBtn);
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
		for (const c of this.columns) {
			const th = document.createElement('th');
			th.textContent = c.label;
			tr.appendChild(th);
		}
		const thDel = document.createElement('th');
		tr.appendChild(thDel);
		thead.appendChild(tr);
		return thead;
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

		const tdDel = document.createElement('td');
		const del = document.createElement('button');
		del.textContent = '✕';
		// stopPropagation：删记录不该同时触发整行选中
		del.addEventListener('click', (e) => {
			e.stopPropagation();
			void this.handlers.remove(rec.id);
		});
		tdDel.appendChild(del);
		tr.appendChild(tdDel);

		tr.style.cursor = 'pointer';
		tr.addEventListener('click', () => { this.select(rec); });
		return tr;
	}

	/** 选中一条记录，高亮该行并回填下方表单 */
	private select(rec: RecordRow): void {
		this.selectedId = rec.id;
		this.selectedRec = rec;
		for (const tr of this.tbody.querySelectorAll<HTMLTableRowElement>('tr')) {
			tr.classList.toggle('highlighted', tr.dataset.rid === String(rec.id));
		}
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
	}

	/** 「新建」：清掉选中，进入新建态 */
	private newRecord(): void {
		this.selectedId = undefined;
		for (const tr of this.tbody.querySelectorAll<HTMLTableRowElement>('tr')) {
			tr.classList.remove('highlighted');
		}
		this.clearForm();
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

	constructor(desktop: UIDesktop, id: string, title: string, cfg: WinParam,
		private readonly placePanel: SandboxRecordEditorPanel,
		private readonly scenePanel: SandboxRecordEditorPanel) //
	{
		super(desktop, id, title, cfg);
		this.hintEl.id = `${id}-hint`;
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

			body.appendChild(this.hintEl);

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
			columns: [{ key: 'placeName', label: '地点名' }],
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
				{ key: 'sceneName', label: '场景名' },
				{ key: 'placeId', label: '地点 ID' },
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
		});

		this.win = new SandboxEditCampaignWindow(desktop, 'edit-campaign', '编辑战役',
			{
				icons: this.icon('actions', 'application-menu.png'),
				body: { initSize: { width: 1160, height: 560 }, overflow: 'auto' },
			},
			this.placePanel, this.scenePanel);
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
