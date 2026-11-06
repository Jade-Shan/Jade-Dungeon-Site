import {
	JadeUIResource, DefaultIconGroup, registerDefaultUIResource,
} from '@jade-dungeon/jade-utils/resource';
import { UIDesktop, UIWindowAdapter } from '@jade-dungeon/jade-utils/ui-window';
import { WebUtil } from '@jade-dungeon/jade-utils/web';
import {
	CircleToken, ImageResource, IToken2D, LineToken, RectangleToken, SandTable,
} from '../trpg/sandtable.js';
import { renderRollResults, SandboxApi, SceneId } from './sandboxApi.js';
import { SandboxScene, TokenGroup, TOKEN_GROUPS } from './sandboxScene.js';
import {
	SandboxDiceWindow, SandboxMapWindow, SandboxPropsWindow,
	SandboxSceneWindow, SandboxTokenListWindow,
} from './sandboxWindows.js';

/**
 * 沙盘的 GM 编辑器
 *
 * 对应老应用的 `sandtable-editor.html` + `sandtable-editor.js`。
 * 和玩家视图的区别：**看全图、不画迷雾**，能改 Token、能保存发布、能设检定阈值。
 *
 * ## 五个窗口
 *
 * | 窗口 | 内容 |
 * |------|------|
 * | Map | 地图画布，点选 Token、Ctrl 拖动、Alt 缩放 |
 * | Tokens | 分组切换 + Token 列表 + 创建按钮 |
 * | Properties | 选中 Token 的属性表单 + 图片裁剪预览 |
 * | Scene | 保存并发布、刷新移动请求 |
 * | Dice | 给玩家设阈值、看全场检定结果 |
 *
 * ## ⚠️ 改 Token 位置/尺寸要用返回值替换
 *
 * `moveTo()` / `scaleTo()` 返回新实例（`docs/sandbox-refactor.md` 4.6 节）。
 * 本文件所有改位置的地方都走
 * `scene.replace(group, token.moveTo(...))` —— 不要原地改坐标。
 */
export interface SandboxEditorConfig {
	/** 后端根路径 */
	apiRoot: string;
	/** 老相对路径图片的落点 */
	assetRoot: string;
	/** 桌面容器的元素 id */
	desktopId: string;
	/** 场景三级定位 */
	scene: SceneId;
	/** GM 的用户名 */
	username: string;
	/** GM 的登录 token。保存时塞进 jsonStr，后端靠它鉴权 */
	loginToken: string;
}

/**
 * 元素列表窗口的标签页：五个 Token 分组 + 资源文件
 *
 * 「资源文件」不是 Token 分组 —— 数据层单独存在 `SandboxScene.images`
 *（对应数据源的 `imgResources`），不参与 Token 的渲染层次 / 命中测试。
 * 只是编辑器的元素列表里让它和五个分组并排展示，沿用老界面的六个标签。
 */
type ListTab = TokenGroup | 'images';

/** 标签页的显示名与 emoji 图标，沿用老界面 */
const GROUP_LABEL: Record<ListTab, string> = {
	teams: '👤 玩家',
	creaters: '👾 生物',
	furnishings: '🗄 陈设',
	doors: '🚪 门',
	walls: '🏗 墙壁',
	images: '🌠 资源文件',
};

/** 标签页的顺序：五个 Token 分组在前，资源文件垫底 */
const ALL_TABS: readonly ListTab[] = [...TOKEN_GROUPS, 'images'];

/** 各分组允许创建的形状 */
const GROUP_SHAPES: Record<TokenGroup, Array<'Line' | 'Rectangle' | 'Circle'>> = {
	teams: ['Circle'],
	creaters: ['Circle'],
	furnishings: ['Rectangle', 'Circle'],
	doors: ['Line', 'Rectangle', 'Circle'],
	walls: ['Line', 'Rectangle', 'Circle'],
};

/** 形状的按钮文字 */
const SHAPE_ICON = { Line: '╱', Rectangle: '▢', Circle: '◯' };

/** 新建 Token 的默认尺寸 */
const NEW_SIZE = { radius: 25, width: 50, height: 50, lineLen: 50 };

/** 视野范围（像素），对齐玩家视图 view 页的值 */
const VIEW_RANGE = 500;

/** 迷雾的颜色与透明度，对齐玩家视图 */
const SHADOW_STYLE = 'rgba(0, 0, 0, 0.7)';

/**
 * GM 编辑器
 */
export class SandboxEditor {

	private readonly cfg: SandboxEditorConfig;
	private readonly api: SandboxApi;
	private readonly scene = new SandboxScene();
	private mapWin!: SandboxMapWindow;
	private listWin!: SandboxTokenListWindow;
	private propsWin!: SandboxPropsWindow;
	private sceneWin!: SandboxSceneWindow;
	private diceWin!: SandboxDiceWindow;

	/** 当前查看的标签页 */
	private currTab: ListTab = 'teams';
	/** 当前选中的 Token */
	private selected: { group: TokenGroup, token: IToken2D } | undefined;
	/** 当前选中的图片资源（「资源文件」标签页里选中） */
	private selectedImage: ImageResource | undefined;
	/** 按住 Ctrl = 移动模式 */
	private ctrlDown = false;
	/** 按住 Alt = 缩放模式 */
	private altDown = false;
	/** 按住 Shift = 框选裁剪区域模式 */
	private shiftDown = false;
	/** 拖动起点 */
	private dragFrom: { x: number, y: number } | undefined;
	/** 裁剪区域的拖动状态（Shift 框选 / Ctrl 移动 / Alt 缩放） */
	private clipDrag: {
		mode: 'select' | 'move' | 'scale',
		start: { x: number, y: number },
		rect: { sx: number, sy: number, sw: number, sh: number },
	} | undefined;
	/**
	 * 画面上有没有预览的幽灵
	 *
	 * 用来判断「要不要重画一次把它擦掉」—— 拖动中途松开 Ctrl / Alt 时，
	 * 幽灵不会自己消失。没有这个标记就得每次 `mousemove` 都重画，
	 * 不按修饰键的纯拖动也跟着整场重画一遍。
	 */
	private previewing = false;
	/** 待创建的形状，点地图时落下 */
	private pendingShape: { group: TokenGroup, shape: 'Line' | 'Rectangle' | 'Circle' } | undefined;
	/** 定时刷新的计时器句柄（选中「定时刷新」时启动，取消时清掉） */
	private autoRefreshTimer: number | undefined;
	/** 刷新请求是否正在进行 —— 防止上一次没返回就叠下一次 */
	private refreshInFlight = false;
	/** 视野预览用的沙盘（场景载入成功后构造，缺背景图时保持 undefined） */
	private sandTable: SandTable | undefined;
	/** 「当前角色视野」是否开启 */
	private viewMode = false;

	/**
	 * @param cfg - 页面注入的配置
	 */
	constructor(cfg: SandboxEditorConfig) {
		this.cfg = cfg;
		this.api = new SandboxApi(cfg.apiRoot);
	}

	/**
	 * 启动编辑器
	 * @returns {Promise<void>}
	 */
	async start(): Promise<void> {
		registerDefaultUIResource();
		const host = document.getElementById(this.cfg.desktopId);
		if (!host) {
			throw new Error(`找不到桌面容器 #${this.cfg.desktopId}`);
		}
		const desktop = new UIDesktop(host, { dockBar: { range: 300, maxScale: 1.8 } });
		const icons = JadeUIResource.getDefaultIcon(DefaultIconGroup.ELEC_FACE);

		this.mapWin = new SandboxMapWindow(desktop, 'sandbox-map',
			`编辑：${this.cfg.scene.campaignId} / ${this.cfg.scene.sceneId}`,
			{ icons, body: { initSize: { width: 800, height: 560 }, overflow: 'scroll' } });
		this.mapWin.renderIn();

		this.listWin = new SandboxTokenListWindow(desktop, 'sandbox-tokens', '元素列表',
			{ icons, body: { initSize: { width: 330, height: 320 }, overflow: 'auto' } });
		this.listWin.renderIn();

		this.propsWin = new SandboxPropsWindow(desktop, 'sandbox-props', '属性',
			{ icons, body: { initSize: { width: 320, height: 420 }, overflow: 'auto' } });
		this.propsWin.renderIn();

		this.sceneWin = new SandboxSceneWindow(desktop, 'sandbox-scene', '场景',
			{ icons, body: { initSize: { width: 300, height: 140 }, overflow: 'auto' } });
		this.sceneWin.renderIn();

		this.diceWin = new SandboxDiceWindow(desktop, 'sandbox-dice', '检定',
			{ icons, body: { initSize: { width: 340, height: 300 }, overflow: 'auto' } });
		this.diceWin.renderIn();

		this.tileWindows();

		await this.loadScene();
		this.bindMapEvents();
		this.bindSceneEvents();
		this.bindDiceEvents();
		this.bindPropsEvents();
		this.renderGroupBar();
		this.renderTokenList();
		await this.refreshRollResults();
	}

	/**
	 * 平铺五个窗口的初始位置
	 *
	 * 在五个窗口都 `renderIn()` 完成、各自尺寸确定之后调用。窗口是
	 * `position:absolute` 相对桌面定位，`renderWindowTplt` 只做了自动叠放，
	 * 这里按需求重排：地图在左上角，场景+检定在下方贴底左右并排，
	 * 元素列表+属性在右方贴边上下并排，间距统一 20px。
	 */
	private tileWindows(): void {
		const M = 20;
		const desktop = this.mapWin.desktop.desktopDiv;
		const W = desktop.clientWidth;
		const H = desktop.clientHeight;

		// 只有定位相关的尺寸才需要读：场景宽（算检定横坐标）、场景/检定高
		// （贴底对齐）、元素列表宽高（算属性位置）、属性宽（贴右边对齐）。
		const sceneW = this.sceneWin.ui.win.offsetWidth;
		const sceneH = this.sceneWin.ui.win.offsetHeight;
		const diceH = this.diceWin.ui.win.offsetHeight;
		const listW = this.listWin.ui.win.offsetWidth;
		const listH = this.listWin.ui.win.offsetHeight;
		const propsW = this.propsWin.ui.win.offsetWidth;

		// 地图：桌面左上角
		this.placeWindow(this.mapWin, M, M);
		// 场景 + 检定：地图下方，都贴桌面底部，左右并排
		this.placeWindow(this.sceneWin, M, H - M - sceneH);
		this.placeWindow(this.diceWin, M + sceneW + M, H - M - diceH);
		// 元素列表 + 属性：地图右方，都贴桌面右边，上下并排
		this.placeWindow(this.listWin, W - M - listW, M);
		this.placeWindow(this.propsWin, W - M - propsW, M + listH + M);
	}

	/**
	 * 把窗口放到指定位置，并同步 lastPos
	 *
	 * `lastPos` 是窗口系统记的「上次位置」，拖动 / 最大化 / 还原都拿它做基准 ——
	 * 只改 `style` 不改它的话，窗口一旦还原就会跳回 `renderWindowTplt` 自动叠放
	 * 的位置，平铺就白做了。
	 */
	private placeWindow(win: UIWindowAdapter, left: number, top: number): void {
		win.status.lastPos.x = left;
		win.status.lastPos.y = top;
		win.ui.win.style.left = `${left}px`;
		win.ui.win.style.top = `${top}px`;
	}

	/**
	 * 载入场景
	 *
	 * **编辑器先查 owner** —— 老应用不查，改完按保存才发现「无权修改该战役」，
	 * 一屏的改动白做。这里进场景就提示。
	 *
	 * @returns {Promise<void>}
	 */
	private async loadScene(): Promise<void> {
		this.mapWin.setStatus('载入场景……');
		const owner = await this.api.mapOwner(this.cfg.scene.campaignId);
		if (owner.ok && owner.data && owner.data !== this.cfg.username) {
			this.sceneWin.setInfo(`⚠️ 本战役属于 ${owner.data}，你的改动存不上`);
		} else if (owner.ok && !owner.data) {
			this.sceneWin.setInfo('这是无主战役 —— 你第一次保存后会成为它的拥有者');
		} else {
			this.sceneWin.setInfo(`拥有者：${this.cfg.username}`);
		}

		const r = await this.api.loadMap(this.cfg.scene);
		if (!r.ok || !r.data) {
			// 新建场景时后端回 empty，这是正常路径 —— 从空场景开始编辑
			this.mapWin.setStatus(`新场景（${r.msg ?? '空'}）—— ` +
				`先在「图片资源」里加一张 id 为 map 的图`);
			return;
		}
		// loadFrom 内部已经等图片加载完才建 Token —— 顺序反了棋子图片就不显示，
		// 详见 sandboxScene.ts 的 loadFrom 注释
		await this.scene.loadFrom(r.data, this.cfg.assetRoot, this.api.imageProxyUrl);

		// 建视野预览用的沙盘。缺背景图（requireMapImage 抛错）时跳过 ——
		// 「当前角色视野」用不了，但编辑照常。
		try {
			const mapImg = this.scene.requireMapImage();
			this.sandTable = new SandTable({
				visibility: 'default',
				map: { imageUrl: mapImg.url, width: 0, height: 0, shadowStyle: SHADOW_STYLE },
				frame: {
					buff: {
						cvs: this.mapWin.bufferCanvas,
						ctx: this.mapWin.bufferCanvas.getContext('2d')!,
					},
					show: {
						cvs: this.mapWin.finalCanvas,
						ctx: this.mapWin.finalCanvas.getContext('2d')!,
					},
				},
			});
		} catch {
			this.sandTable = undefined;
		}

		await this.redraw();
		this.mapWin.setStatus('点选元素；Ctrl+拖动=移动，Alt+拖动=缩放');
	}

	/**
	 * 重画地图
	 *
	 * 平时是 GM 视角的全图（不带迷雾），用各 Token 的 `drawDesign()` 而不是
	 * `draw()` —— 后者对 `visible: false` 的元素什么都不画，而墙壁几乎都是
	 * 隐形的，编辑时必须看得见。
	 *
	 * 「当前角色视野」开启时改走玩家视角：以选中的棋子为观察者，
	 * 调 `SandTable.drawSceneWithUserView()` 画迷雾 + 遮挡，和 view 页一致。
	 * 画完再补一个选中高亮，让 GM 知道观察者是谁。
	 *
	 * @returns {Promise<void>}
	 */
	private async redraw(): Promise<void> {
		if (this.viewMode && this.canPreviewView && this.sandTable) {
			const sel = this.selected!;
			const c = sel.token.getCenter();
			this.sandTable.observer = {
				c: { x: c.x, y: c.y },
				viewRange: () => VIEW_RANGE,
				// 带上自己的 id，遮挡阴影会跳过自己（不给自己投阴影）
				id: sel.token.id,
			};
			await this.sandTable.drawSceneWithUserView(this.scene.allTokens(),
				{ proxyUrl: this.api.imageProxyUrl });
			const ctx = this.mapWin.finalCanvas.getContext('2d');
			if (ctx) { this.highlightSelected(ctx); }
		} else {
			this.paintScene();
		}
	}

	/**
	 * 当前选中对象能否作为视野观察者（玩家或生物）
	 *
	 * 视野预览要有一个「站在哪」的对象，只有玩家棋子（teams）和生物（creaters）
	 * 符合 —— 墙 / 门 / 陈设是场景道具，没有「视野」可言。
	 */
	private get canPreviewView(): boolean {
		return this.selected !== undefined &&
			(this.selected.group === 'teams' || this.selected.group === 'creaters');
	}

	/**
	 * 同步画一帧：地图 + 全部 Token + 选中高亮
	 *
	 * 从 `redraw()` 里拆出来的，因为**拖动预览每帧都要先重画一次底** ——
	 * `mousemove` 是同步回调，里面 `void this.redraw()` 的话这一帧的预览
	 * 会画在重画**之前**的画面上，然后被重画盖掉，表现是预览一闪就没。
	 *
	 * 没有异步的事可做（图片在 `loadFrom()` 里就加载完了），所以这里是同步的。
	 *
	 * @returns {boolean} 画成了没有。缺背景地图时返回 false 并把原因写进状态栏
	 */
	private paintScene(): boolean {
		const cvs = this.mapWin.finalCanvas;
		const ctx = cvs.getContext('2d');
		if (!ctx) { return false; }
		let mapImg;
		try {
			mapImg = this.scene.requireMapImage();
		} catch (e) {
			this.mapWin.setStatus((e as Error).message);
			return false;
		}
		const img = mapImg.imgElem;
		// ⚠️ 尺寸没变就别赋值 —— `resizeCanvas()` 会清空位图，赋同值也清
		//（见 sandboxWindows.ts 的说明）。拖动时每帧都走这里，
		// 无条件赋值等于每帧重建一次位图。
		if (img && img.width > 0 //
			&& (cvs.width !== img.width || cvs.height !== img.height)) //
		{
			this.mapWin.resizeCanvas(img.width, img.height);
		}
		ctx.clearRect(0, 0, cvs.width, cvs.height);
		if (img) { ctx.drawImage(img, 0, 0); }
		// 按渲染层次画，墙在下、玩家在上
		for (const tk of this.scene.allTokens()) { tk.drawDesign(ctx); }
		this.highlightSelected(ctx);
		return true;
	}

	/**
	 * 给选中的 Token 画一个高亮框
	 *
	 * 两层同心圆：先画 7px 的紫色实线做深色衬底，再画绿色虚线 ——
	 * 单层虚线在浅色地图上对比不明显，加一层深色底圈才看得清。
	 * 直径（半径 34）两处一致。
	 *
	 * @param ctx - Canvas 2D 上下文
	 */
	private highlightSelected(ctx: CanvasRenderingContext2D): void {
		if (!this.selected) { return; }
		const c = this.selected.token.getCenter();
		ctx.save();
		// 第一层：7px 紫色实线
		ctx.strokeStyle = '#9400d3';
		ctx.lineWidth = 7;
		ctx.setLineDash([]);
		ctx.beginPath();
		ctx.arc(c.x, c.y, 34, 0, Math.PI * 2);
		ctx.stroke();
		// 第二层：绿色虚线
		ctx.strokeStyle = '#7cfc00';
		ctx.lineWidth = 3;
		ctx.setLineDash([6, 4]);
		ctx.beginPath();
		ctx.arc(c.x, c.y, 34, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
	}

	/**
	 * 渲染分组切换标签页（98.css 的 menu[role=tablist]）
	 *
	 * 每个分组一个 `<li role="tab">`，选中态用 `aria-selected="true"`。
	 * 点击后重画标签页更新选中态，再刷新列表。
	 */
	private renderGroupBar(): void {
		this.listWin.groupBar.innerHTML = '';
		for (const g of ALL_TABS) {
			const li = document.createElement('li');
			li.setAttribute('role', 'tab');
			if (g === this.currTab) { li.setAttribute('aria-selected', 'true'); }
			const a = document.createElement('a');
			a.href = '#';
			a.textContent = GROUP_LABEL[g];
			li.appendChild(a);
			// 绑在 li 上，整个标签都可点；preventDefault 拦掉 <a href="#"> 的跳转
			li.addEventListener('click', (e) => {
				e.preventDefault();
				this.currTab = g;
				this.renderGroupBar();
				this.renderTokenList();
			});
			this.listWin.groupBar.appendChild(li);
		}
	}

	/**
	 * 渲染当前标签页的列表与创建按钮
	 *
	 * 「资源文件」标签页走 {@link SandboxEditor.renderImageList}，这里只处理
	 * Token 分组。开头把 `currTab` 收窄后的值存成局部变量 `group`，
	 * 点选/删除的回调里用它 —— 闭包里直接读 `this.currTab` 的话，
	 * TS 对可变类字段的窄化会失效，得回退成 `ListTab` 再 cast 一遍。
	 */
	private renderTokenList(): void {
		if (this.currTab === 'images') {
			this.renderImageList();
			return;
		}
		const group = this.currTab;
		const body = this.listWin.listBody;
		body.innerHTML = '';
		for (const tk of this.scene.list(group)) {
			const tr = document.createElement('tr');
			if (this.selected?.token.id === tk.id) { tr.classList.add('highlighted'); }

			const tdName = document.createElement('td');
			tdName.textContent = tk.id;
			tdName.style.cursor = 'pointer';
			tdName.addEventListener('click', () => { this.select(group, tk.id); });
			tr.appendChild(tdName);

			const tdVis = document.createElement('td');
			// 隐形的元素标出来 —— 墙壁几乎都是隐形的，列表里要能分辨
			tdVis.textContent = tk.visible ? '可见' : '隐形';
			tr.appendChild(tdVis);

			const tdDel = document.createElement('td');
			const del = document.createElement('button');
			del.textContent = '✕';
			del.addEventListener('click', () => { void this.deleteToken(group, tk.id); });
			tdDel.appendChild(del);
			tr.appendChild(tdDel);

			body.appendChild(tr);
		}

		// 创建按钮：按分组允许的形状给
		const bar = this.listWin.createBar;
		bar.innerHTML = '';
		const label = document.createElement('span');
		label.textContent = '新建：';
		bar.appendChild(label);
		for (const shape of GROUP_SHAPES[group]) {
			const btn = document.createElement('button');
			btn.textContent = SHAPE_ICON[shape];
			btn.title = `新建${shape}，然后点地图落位`;
			btn.addEventListener('click', () => {
				this.pendingShape = { group, shape };
				this.mapWin.setStatus(`点地图放下这个${SHAPE_ICON[shape]}`);
			});
			bar.appendChild(btn);
		}
	}

	/**
	 * 渲染「资源文件」标签页的图片资源列表与「新建资源」按钮
	 *
	 * 列表项显示 id 和 url（跨源图片在编辑期也可能很长，截短显示）。
	 * 图片资源没有「可见/隐形」这一列 —— 它是数据，不是地图元素。
	 */
	private renderImageList(): void {
		const body = this.listWin.listBody;
		body.innerHTML = '';
		for (const img of this.scene.imageList()) {
			const tr = document.createElement('tr');
			if (this.selectedImage?.id === img.id) { tr.classList.add('highlighted'); }

			const tdName = document.createElement('td');
			tdName.textContent = img.id;
			tr.appendChild(tdName);

			const tdUrl = document.createElement('td');
			// 只给个短预览，完整地址在属性窗口里看
			tdUrl.textContent = img.url.length > 32 ? `${img.url.slice(0, 32)}…` : img.url;
			tr.appendChild(tdUrl);

			const tdDel = document.createElement('td');
			const del = document.createElement('button');
			del.textContent = '✕';
			// 删除按钮 stopPropagation，避免点了删除又触发整行的选中
			del.addEventListener('click', (e) => {
				e.stopPropagation();
				void this.deleteImage(img.id);
			});
			tdDel.appendChild(del);
			tr.appendChild(tdDel);

			// 整行都可点选中（不只 id 列）—— url 那列很长，用户容易点到它
			tr.style.cursor = 'pointer';
			tr.addEventListener('click', () => { this.selectImage(img.id); });

			body.appendChild(tr);
		}

		// 新建资源：图片资源不是地图元素，点了直接建、不用去地图落位
		const bar = this.listWin.createBar;
		bar.innerHTML = '';
		const label = document.createElement('span');
		label.textContent = '新建：';
		bar.appendChild(label);
		const btn = document.createElement('button');
		btn.textContent = '🌠';
		btn.title = '新建图片资源（id 为 map 的那张是场景背景图）';
		btn.addEventListener('click', () => { this.createImage(); });
		bar.appendChild(btn);
	}

	/**
	 * 选中一个 Token，刷新属性表单
	 *
	 * @param group - 分组
	 * @param id - Token ID
	 */
	private select(group: TokenGroup, id: string): void {
		const token = this.scene.get(group, id);
		if (!token) { return; }
		// 点地图选中 Token 时，标签页要跟着切过去并更新选中态 ——
		// 否则可能「资源文件」标签还亮着、列表却显示的是 Token 分组
		if (this.currTab !== group) {
			this.currTab = group;
			this.renderGroupBar();
		}
		this.selected = { group, token };
		this.selectedImage = undefined;
		this.renderProps();
		this.renderTokenList();
		// 视野预览只在选中玩家/生物时有效；选中别的对象就自动退出视野模式，
		// 否则 checkbox 还勾着、画面却是全图，状态对不上
		if (this.viewMode && !this.canPreviewView) {
			this.viewMode = false;
			this.sceneWin.autoView.checked = false;
		}
		void this.redraw();
	}

	/**
	 * 选中「资源文件」标签页里的一个图片资源
	 *
	 * 选中资源会清掉 Token 选中（两者互斥，属性窗口同一时刻只显示一种表单）。
	 * 图片资源没有视野，选中它时退出视野模式。
	 *
	 * @param id - 图片资源 ID
	 */
	private selectImage(id: string): void {
		const img = this.scene.images.get(id);
		if (!img) { return; }
		this.selectedImage = img;
		this.selected = undefined;
		if (this.viewMode) {
			this.viewMode = false;
			this.sceneWin.autoView.checked = false;
		}
		this.renderImageProps();
		this.renderImageList();
		void this.redraw();
	}

	/**
	 * 把选中 Token 的属性渲染成表单
	 *
	 * 字段按形状不同：线段有两端坐标、矩形有宽高、圆形有半径。
	 * 老代码是四段写死的 HTML 字符串，这里按字段描述生成。
	 */
	private renderProps(): void {
		if (this.selectedImage) { this.renderImageProps(); return; }
		if (!this.selected) { this.propsWin.clear(); return; }
		const tk = this.selected.token;
		const rec = tk.toRecord() as unknown as Record<string, unknown>;
		const imgOpts: Array<[string, string]> = this.scene.imageList()
			.map(i => [i.id, i.id]);

		const defs: Array<{
			key: string, label: string, value: string,
			type?: string, options?: Array<[string, string]>, widget?: 'radio',
		}> = [
			{ key: 'id', label: 'ID', value: String(rec.id ?? '') },
			{ key: 'x', label: 'x', value: String(rec.x ?? 0), type: 'number' },
			{ key: 'y', label: 'y', value: String(rec.y ?? 0), type: 'number' },
		];

		if (rec.type === 'Line') {
			defs.push({ key: 'x2', label: 'x2', value: String(rec.x2 ?? 0), type: 'number' });
			defs.push({ key: 'y2', label: 'y2', value: String(rec.y2 ?? 0), type: 'number' });
		} else if (rec.type === 'Rectangle') {
			defs.push({ key: 'width', label: '宽', value: String(rec.width ?? 0), type: 'number' });
			defs.push({ key: 'height', label: '高', value: String(rec.height ?? 0), type: 'number' });
		} else if (rec.type === 'Circle') {
			defs.push({ key: 'radius', label: '半径', value: String(rec.radius ?? 0), type: 'number' });
		}

		defs.push({
			key: 'visible', label: '可见', value: tk.visible ? 'true' : 'false',
			options: [['true', '可见'], ['false', '隐形']], widget: 'radio',
		});
		defs.push({
			key: 'blockView', label: '遮挡', value: tk.blockView ? 'true' : 'false',
			options: [['true', '遮挡视线'], ['false', '后方可见']], widget: 'radio',
		});
		defs.push({ key: 'color', label: '颜色', value: String(rec.color ?? '#0000FF') });

		// 线段没有图片裁剪
		if (rec.type !== 'Line' && imgOpts.length > 0) {
			const img = rec.img as { imgKey?: string, sx?: number, sy?: number, width?: number, height?: number } | undefined;
			defs.push({ key: 'imgKey', label: '图片', value: String(img?.imgKey ?? ''), options: imgOpts });
			defs.push({ key: 'sx', label: '裁剪x', value: String(img?.sx ?? 0), type: 'number' });
			defs.push({ key: 'sy', label: '裁剪y', value: String(img?.sy ?? 0), type: 'number' });
			defs.push({ key: 'sw', label: '裁剪宽', value: String(img?.width ?? 50), type: 'number' });
			defs.push({ key: 'sh', label: '裁剪高', value: String(img?.height ?? 50), type: 'number' });
		}

		this.propsWin.renderFields(defs);
		this.propsWin.bindChange(() => { void this.applyProps(); });
		this.drawClipPreview();
	}

	/**
	 * 把表单的值写回 Token
	 *
	 * ⚠️ 重建一个新 Token 而不是改旧的 —— 几何字段是 `readonly`（4.6 节）。
	 * 顺带：改 ID 时要先删旧键再放新的，否则列表里会出现两条。
	 *
	 * @returns {Promise<void>}
	 */
	private async applyProps(): Promise<void> {
		if (!this.selected) { return; }
		const { group, token } = this.selected;
		const oldId = token.id;
		const rec = token.toRecord() as unknown as Record<string, unknown>;
		const num = (k: string, dflt: number) => {
			const v = parseFloat(this.propsWin.fieldValue(k));
			return Number.isFinite(v) ? v : dflt;
		};

		const next: Record<string, unknown> = {
			...rec,
			id: this.propsWin.fieldValue('id') || oldId,
			x: num('x', Number(rec.x ?? 0)),
			y: num('y', Number(rec.y ?? 0)),
			visible: this.propsWin.fieldValue('visible') === 'true',
			blockView: this.propsWin.fieldValue('blockView') === 'true',
			color: this.propsWin.fieldValue('color') || String(rec.color ?? '#0000FF'),
		};
		if (rec.type === 'Line') {
			next.x2 = num('x2', Number(rec.x2 ?? 0));
			next.y2 = num('y2', Number(rec.y2 ?? 0));
		} else if (rec.type === 'Rectangle') {
			next.width = Math.max(1, num('width', Number(rec.width ?? 1)));
			next.height = Math.max(1, num('height', Number(rec.height ?? 1)));
		} else if (rec.type === 'Circle') {
			next.radius = Math.max(1, num('radius', Number(rec.radius ?? 1)));
		}
		if (rec.type !== 'Line') {
			next.img = {
				imgKey: this.propsWin.fieldValue('imgKey'),
				sx: num('sx', 0), sy: num('sy', 0),
				width: num('sw', 50), height: num('sh', 50),
			};
		}

		const rebuilt = this.rebuild(next);
		if (!rebuilt) { return; }
		// 改了 ID 要清掉旧键
		if (rebuilt.id !== oldId) { this.scene.remove(group, oldId); }
		this.scene.replace(group, rebuilt);
		this.selected = { group, token: rebuilt };
		this.drawClipPreview();
		this.renderTokenList();
		await this.redraw();
	}

	/**
	 * 渲染选中图片资源的属性表单
	 *
	 * 只有 id 和 url 两个字段（`type` 固定 `"Image"`，编辑时不让改）。
	 * 改完即生效，走 {@link SandboxEditor.applyImageProps}。
	 */
	private renderImageProps(): void {
		if (!this.selectedImage) { this.propsWin.clear(); return; }
		// 图片资源没有裁剪预览，先清掉上一个 Token 留下的预览图
		this.propsWin.clear();
		this.propsWin.renderFields([
			{ key: 'id', label: 'ID', value: this.selectedImage.id },
			{ key: 'url', label: '地址', value: this.selectedImage.url },
		]);
		this.propsWin.bindChange(() => { void this.applyImageProps(); });
		this.drawImagePreview();
	}

	/**
	 * 把选中资源的图片画到属性窗口下方的预览画布
	 *
	 * 和 Token 的 {@link SandboxEditor.drawClipPreview} 同一块画布，但资源没有
	 * 裁剪参数，所以只画整张图、不叠裁剪红框。`imgElem` 是加载期备好的
	 * （`loadFrom` 里 `loadImageResources` 填的），新建的资源 url 还没填时
	 * `imgElem` 为空，画 10×10 的空白占位。
	 */
	private drawImagePreview(): void {
		const cvs = this.propsWin.clipCanvas;
		const ctx = cvs.getContext('2d');
		if (!ctx) { return; }
		const img = this.selectedImage?.imgElem;
		if (!img || !img.width) {
			cvs.width = 10; cvs.height = 10;
			ctx.clearRect(0, 0, 10, 10);
			return;
		}
		cvs.width = img.width;
		cvs.height = img.height;
		ctx.clearRect(0, 0, cvs.width, cvs.height);
		ctx.drawImage(img, 0, 0);
	}

	/**
	 * 把资源属性表单的值写回图片资源
	 *
	 * 两个要点：
	 *
	 * - **改了 ID 要删旧键** —— 和 Token 改 ID 一样，否则列表里会出现两条
	 * - **复用旧 `imgElem` 重新加载** —— Token 的 `imgClip.imageElem` 是图片资源
	 *   `imgElem` 的**同一个引用**（`clipFromRecord` 浅拷贝），所以只要往这个
	 *   对象上重设 `src`，引用它的 Token 不用重建就能看到新图。新建一个
	 *   `HTMLImageElement` 反而会让 Token 手里的引用停在一张旧图上。
	 *
	 * @returns {Promise<void>}
	 */
	private async applyImageProps(): Promise<void> {
		if (!this.selectedImage) { return; }
		const old = this.selectedImage;
		const newId = this.propsWin.fieldValue('id').trim() || old.id;
		const url = this.propsWin.fieldValue('url').trim();

		if (newId !== old.id) { this.scene.removeImage(old.id); }
		const next: ImageResource = { type: old.type, id: newId, url };
		if (url) {
			// 复用旧元素，保持 Token 侧的引用不断
			next.imgElem = old.imgElem ?? new Image();
			await WebUtil.loadImageByProxy(next.imgElem, url,
				{ proxyUrl: this.api.imageProxyUrl });
		}
		this.scene.putImage(next);
		this.selectedImage = next;
		this.renderImageList();
		this.drawImagePreview();
		await this.redraw();
		this.mapWin.setStatus(newId === old.id
			? `已更新资源 ${newId}`
			: `资源已从 ${old.id} 改名为 ${newId}（引用它的棋子保存重载后才生效）`);
	}

	/**
	 * 新建一个空的图片资源
	 *
	 * 图片资源不是地图元素，点了「新建」就直接建出来、进入属性编辑 ——
	 * 不像 Token 那样还要去地图上落位。url 留空，等 GM 在属性窗口填。
	 */
	private createImage(): void {
		const id = `image-${Date.now()}`;
		this.scene.putImage({ type: 'Image', id, url: '' });
		this.selectedImage = this.scene.images.get(id)!;
		this.selected = undefined;
		this.renderImageProps();
		this.renderImageList();
		this.mapWin.setStatus(`已创建资源 ${id}，在属性窗口填地址`);
	}

	/**
	 * 删掉一个图片资源
	 *
	 * 不检查有没有 Token 还在引用 —— 引用它的 Token 持有 `imgElem` 快照，
	 * 内存里照常显示，但保存重载后找不到图（见 `SandboxScene.removeImage`）。
	 * 用状态栏提示这一点。
	 *
	 * @param id - 图片资源 ID
	 */
	private async deleteImage(id: string): Promise<void> {
		this.scene.removeImage(id);
		if (this.selectedImage?.id === id) {
			this.selectedImage = undefined;
			this.propsWin.clear();
		}
		this.renderImageList();
		await this.redraw();
		this.mapWin.setStatus(`已删除资源 ${id}（引用它的棋子保存重载后才生效）`);
	}

	/**
	 * 从记录重建 Token
	 *
	 * @param rec - Token 记录
	 * @returns {IToken2D | undefined} 类型不认识时返回 undefined
	 */
	private rebuild(rec: Record<string, unknown>): IToken2D | undefined {
		const imgs = this.scene.imageList();
		if (rec.type === 'Line') {
			return LineToken.fromRecord(rec as never);
		} else if (rec.type === 'Rectangle') {
			return RectangleToken.fromRecord(rec as never, imgs);
		} else if (rec.type === 'Circle') {
			return CircleToken.fromRecord(rec as never, imgs);
		}
		return undefined;
	}

	/**
	 * 画图片裁剪预览：整张图 + 被裁区域的红框
	 *
	 * 老代码在 `#tkImgCanvas` 上做同样的事。这是编辑棋子图标时唯一的参照 ——
	 * 没有它只能靠猜 `sx/sy/width/height` 四个数。
	 */
	private drawClipPreview(): void {
		const cvs = this.propsWin.clipCanvas;
		const ctx = cvs.getContext('2d');
		if (!ctx) { return; }
		const key = this.propsWin.fieldValue('imgKey');
		const img = key ? this.scene.images.get(key)?.imgElem : undefined;
		if (!img || !img.width) {
			cvs.width = 10; cvs.height = 10;
			ctx.clearRect(0, 0, 10, 10);
			return;
		}
		cvs.width = img.width;
		cvs.height = img.height;
		ctx.clearRect(0, 0, cvs.width, cvs.height);
		ctx.drawImage(img, 0, 0);
		const sx = parseFloat(this.propsWin.fieldValue('sx')) || 0;
		const sy = parseFloat(this.propsWin.fieldValue('sy')) || 0;
		const sw = parseFloat(this.propsWin.fieldValue('sw')) || 0;
		const sh = parseFloat(this.propsWin.fieldValue('sh')) || 0;
		ctx.save();
		ctx.fillStyle = 'rgba(0, 0, 255, 0.35)';
		ctx.fillRect(sx, sy, sw, sh);
		ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
		ctx.lineWidth = 2;
		ctx.strokeRect(sx, sy, sw, sh);
		ctx.restore();
	}

	/**
	 * 删一个 Token
	 *
	 * @param group - 分组
	 * @param id - Token ID
	 * @returns {Promise<void>}
	 */
	private async deleteToken(group: TokenGroup, id: string): Promise<void> {
		this.scene.remove(group, id);
		if (this.selected?.token.id === id) {
			this.selected = undefined;
			this.propsWin.clear();
		}
		this.renderTokenList();
		await this.redraw();
		this.mapWin.setStatus(`已删除 ${id}（还没发布，要按「保存并发布」才生效）`);
	}

	/**
	 * 在地图上落下一个新 Token
	 *
	 * ID 用 `<分组>-<时间戳>`，沿用老代码的做法 ——
	 * 玩家棋子要改成和用户名一致，所以 GM 建完得去属性里改 ID。
	 *
	 * @param at - 落位坐标
	 * @returns {Promise<void>}
	 */
	private async createToken(at: { x: number, y: number }): Promise<void> {
		if (!this.pendingShape) { return; }
		const { group, shape } = this.pendingShape;
		this.pendingShape = undefined;
		const id = `${group}-${Date.now()}`;
		const firstImg = this.scene.imageList()[0];
		const clip = {
			imgKey: firstImg?.id ?? '', sx: 0, sy: 0, width: 50, height: 50,
			imageElem: firstImg?.imgElem,
		};
		// 墙壁默认隐形（玩家不该看见墙本身，只受它遮挡）；陈设默认不遮挡
		const visible = group !== 'walls';
		const blockView = group !== 'furnishings';

		let tk: IToken2D;
		if (shape === 'Line') {
			tk = new LineToken(id, at.x, at.y, at.x + NEW_SIZE.lineLen, at.y,
				6, '', '#00FF00', visible, blockView);
		} else if (shape === 'Rectangle') {
			tk = new RectangleToken(id, at.x, at.y, NEW_SIZE.width, NEW_SIZE.height,
				0, '#0000FF', '#0000FF', visible, blockView, '#0000FF', clip);
		} else {
			tk = new CircleToken(id, at.x, at.y, NEW_SIZE.radius,
				0, '#0000FF', '#0000FF', visible, blockView, '#0000FF', clip);
		}
		this.scene.replace(group, tk);
		this.select(group, id);
		this.mapWin.setStatus(`已创建 ${id}` +
			(group === 'teams' ? ' —— 玩家棋子的 ID 要改成玩家的用户名' : ''));
	}

	/**
	 * 绑定地图交互：点选 / Ctrl 拖动 / Alt 缩放 / 落新元素
	 */
	private bindMapEvents(): void {
		const cvs = this.mapWin.finalCanvas;

		document.addEventListener('keydown', e => {
			if (e.key === 'Control') { this.ctrlDown = true; }
			if (e.key === 'Alt') { this.altDown = true; }
			if (e.key === 'Shift') { this.shiftDown = true; }
		});
		document.addEventListener('keyup', e => {
			if (e.key === 'Control') { this.ctrlDown = false; }
			if (e.key === 'Alt') { this.altDown = false; }
			if (e.key === 'Shift') { this.shiftDown = false; }
		});

		cvs.addEventListener('mousedown', e => {
			const p = this.mapWin.toCanvasPoint(e);
			if (this.pendingShape) { void this.createToken(p); return; }
			const hit = this.scene.hitTest(p.x, p.y);
			if (hit) {
				this.select(hit.group, hit.token.id);
				this.dragFrom = p;
			} else {
				this.selected = undefined;
				this.selectedImage = undefined;
				this.propsWin.clear();
				void this.redraw();
			}
		});

		cvs.addEventListener('mousemove', e => {
			if (!this.dragFrom || !this.selected) { return; }
			// 没按修饰键就没有预览可画。**已经画了的要擦掉** ——
			// 拖动中途松开 Ctrl 的话，上一帧的幽灵会留在画面上
			if (!this.ctrlDown && !this.altDown) {
				if (this.previewing) {
					this.previewing = false;
					this.paintScene();
				}
				return;
			}
			const p = this.mapWin.toCanvasPoint(e);
			const dx = p.x - this.dragFrom.x;
			const dy = p.y - this.dragFrom.y;
			// 先重画底，再把预览压在上面 —— 不重画的话上一帧的幽灵会留着，
			// 拖一段距离就糊成一串
			if (!this.paintScene()) { return; }
			const ctx = cvs.getContext('2d');
			if (!ctx) { return; }
			this.previewing = true;
			if (this.ctrlDown) {
				this.selected.token.drawMovePreview(ctx, dx, dy);
			} else {
				this.selected.token.drawScalePreview(ctx, dx, dy);
			}
		});

		cvs.addEventListener('mouseup', e => {
			this.previewing = false;
			if (!this.dragFrom || !this.selected) { this.dragFrom = undefined; return; }
			const p = this.mapWin.toCanvasPoint(e);
			const dx = p.x - this.dragFrom.x;
			const dy = p.y - this.dragFrom.y;
			this.dragFrom = undefined;
			if (dx === 0 && dy === 0) { return; }

			const { group, token } = this.selected;
			// ⚠️ moveTo / scaleTo 返回新实例，必须 replace 回去（4.6 节）
			let next: IToken2D | undefined;
			if (this.ctrlDown) { next = token.moveTo(dx, dy); }
			else if (this.altDown) { next = token.scaleTo(dx, dy); }
			if (!next) {
				this.mapWin.setStatus('按住 Ctrl 拖动=移动，按住 Alt 拖动=缩放');
				return;
			}
			this.scene.replace(group, next);
			this.selected = { group, token: next };
			this.renderProps();
			void this.redraw();
		});
	}

	/**
	 * 绑定属性窗口裁剪预览的交互：Shift 框选 / Ctrl 移动 / Alt 缩放
	 *
	 * 三种修饰键和编辑窗口里拖元素的语义一致（见 bindMapEvents）：
	 *
	 * | 键 | 动作 |
	 * |----|------|
	 * | Shift + 拖动 | 从起点框一个矩形，重新圈定裁剪区域 |
	 * | Ctrl + 拖动已选中的区域 | 平移裁剪区域 |
	 * | Alt + 拖动已选中的区域 | 改裁剪宽高（dx 改宽、dy 改高） |
	 *
	 * 拖动过程只更新表单字段并实时重画预览，松手才走 `applyProps()` 写回
	 * Token —— 和地图拖动「拖动看预览、松手生效」同一套节奏。
	 */
	private bindPropsEvents(): void {
		const cvs = this.propsWin.clipCanvas;

		cvs.addEventListener('mousedown', e => {
			const p = this.clipToCanvasPoint(e);
			const rect = this.clipRect();
			const inside = p.x >= rect.sx && p.x <= rect.sx + rect.sw &&
				p.y >= rect.sy && p.y <= rect.sy + rect.sh;

			if (this.shiftDown) {
				this.clipDrag = { mode: 'select', start: p, rect };
			} else if (this.ctrlDown && inside) {
				this.clipDrag = { mode: 'move', start: p, rect };
			} else if (this.altDown && inside) {
				this.clipDrag = { mode: 'scale', start: p, rect };
			}
		});

		cvs.addEventListener('mousemove', e => {
			if (!this.clipDrag) { return; }
			const p = this.clipToCanvasPoint(e);
			const { mode, start, rect } = this.clipDrag;
			const dx = p.x - start.x;
			const dy = p.y - start.y;

			let next: { sx: number, sy: number, sw: number, sh: number } | undefined;
			if (mode === 'select') {
				const sw = Math.abs(dx);
				const sh = Math.abs(dy);
				// 还没拖出有效区域就不动，避免点一下把裁剪缩成 0
				if (sw < 1 || sh < 1) { return; }
				next = { sx: Math.min(start.x, p.x), sy: Math.min(start.y, p.y), sw, sh };
			} else if (mode === 'move') {
				next = { sx: rect.sx + dx, sy: rect.sy + dy, sw: rect.sw, sh: rect.sh };
			} else {
				// 缩放：dx 改宽、dy 改高，下限 1（对齐 RectangleToken.scaleTo）
				next = {
					sx: rect.sx, sy: rect.sy,
					sw: Math.max(1, rect.sw + dx), sh: Math.max(1, rect.sh + dy),
				};
			}

			this.writeClipRect(next);
			this.drawClipPreview();
		});

		cvs.addEventListener('mouseup', () => {
			if (!this.clipDrag) { return; }
			this.clipDrag = undefined;
			void this.applyProps();
		});
	}

	/**
	 * 把鼠标事件换算成裁剪预览画布上的坐标
	 *
	 * 画布位图尺寸 = 图片原始尺寸，但 CSS 显示尺寸可能被窗口宽度压缩，
	 * 所以用 `getBoundingClientRect` 按比例换算（对齐 `SandboxMapWindow.toCanvasPoint`）。
	 */
	private clipToCanvasPoint(e: MouseEvent): { x: number, y: number } {
		const cvs = this.propsWin.clipCanvas;
		const rect = cvs.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) { return { x: 0, y: 0 }; }
		const x = (e.clientX - rect.left) * (cvs.width / rect.width);
		const y = (e.clientY - rect.top) * (cvs.height / rect.height);
		return { x: Math.round(x), y: Math.round(y) };
	}

	/** 读当前裁剪区域（来自表单字段） */
	private clipRect(): { sx: number, sy: number, sw: number, sh: number } {
		return {
			sx: parseFloat(this.propsWin.fieldValue('sx')) || 0,
			sy: parseFloat(this.propsWin.fieldValue('sy')) || 0,
			sw: parseFloat(this.propsWin.fieldValue('sw')) || 0,
			sh: parseFloat(this.propsWin.fieldValue('sh')) || 0,
		};
	}

	/** 把裁剪区域写回表单字段（不触发 change） */
	private writeClipRect(rect: { sx: number, sy: number, sw: number, sh: number }): void {
		this.propsWin.setFieldValue('sx', String(rect.sx));
		this.propsWin.setFieldValue('sy', String(rect.sy));
		this.propsWin.setFieldValue('sw', String(rect.sw));
		this.propsWin.setFieldValue('sh', String(rect.sh));
	}

	/**
	 * 绑定场景窗口：保存并发布、刷新移动请求、定时刷新开关
	 */
	private bindSceneEvents(): void {
		this.sceneWin.saveBtn.addEventListener('click', () => { void this.save(); });
		this.sceneWin.refreshBtn.addEventListener('click', () => { void this.loadMoveRequests(); });
		// 定时刷新：选中启动 3 秒一次的自动刷新，取消就停
		this.sceneWin.autoRefresh.addEventListener('change', () => {
			if (this.sceneWin.autoRefresh.checked) {
				this.autoRefreshTimer = window.setInterval(() => { void this.loadMoveRequests(); }, 3000);
			} else if (this.autoRefreshTimer !== undefined) {
				window.clearInterval(this.autoRefreshTimer);
				this.autoRefreshTimer = undefined;
			}
		});
		// 当前角色视野：以选中的玩家/生物为观察者预览视野与遮挡
		this.sceneWin.autoView.addEventListener('change', () => { void this.toggleViewMode(); });
	}

	/**
	 * 切换「当前角色视野」
	 *
	 * 选中时先检查有没有选中的对象、是不是玩家/生物 —— 不是就弹回 checkbox、
	 * 什么都不做；是则以它为观察者画视野。取消选中则恢复 GM 的全图。
	 *
	 * @returns {Promise<void>}
	 */
	private async toggleViewMode(): Promise<void> {
		if (this.sceneWin.autoView.checked && !this.canPreviewView) {
			// 没选中对象、或选中的不是玩家/生物：什么都不做，checkbox 弹回
			this.sceneWin.autoView.checked = false;
			return;
		}
		this.viewMode = this.sceneWin.autoView.checked;
		await this.redraw();
	}

	/**
	 * 保存并发布
	 *
	 * 这一步同时完成 [4.1 节](sandbox-refactor.md)的「存量数据自动转正」——
	 * `toJsonStr()` 只写 `visible`，所以老场景保存一次之后就没有 `visiable` 了。
	 *
	 * @returns {Promise<void>}
	 */
	private async save(): Promise<void> {
		this.sceneWin.setInfo('保存中……');
		const json = this.scene.toJsonStr(this.cfg.username, this.cfg.loginToken);
		const r = await this.api.saveMap(this.cfg.scene, json);
		if (r.ok) {
			this.sceneWin.setInfo(`已发布（${new Date().toLocaleTimeString()}）`);
		} else {
			// 最常见的是 not owner
			this.sceneWin.setInfo(`保存失败：${r.msg === 'not owner'
				? '你不是这个战役的拥有者' : (r.msg ?? '未知错误')}`);
		}
	}

	/**
	 * 读玩家的移动请求，画在地图上
	 *
	 * 请求用「从当前位置到目标位置」的预览表示，GM 看完自己决定拖不拖。
	 * **不自动移动棋子** —— 本工具没有碰撞检测，是否合规由 GM 判断。
	 *
	 * @returns {Promise<void>}
	 */
	private async loadMoveRequests(): Promise<void> {
		if (this.refreshInFlight) { return; }
		this.refreshInFlight = true;
		try {
			const r = await this.api.loadMoveRequests(this.cfg.scene);
			if (!r.ok) {
				this.sceneWin.setInfo(`读取请求失败：${r.msg ?? '未知错误'}`);
				return;
			}
			await this.redraw();
			const ctx = this.mapWin.finalCanvas.getContext('2d');
			const list = r.data ?? [];
			if (ctx) {
				for (const req of list) {
					const tk = this.scene.get('teams', req.userId);
					// drawNextLocation 只有圆形 Token 有，玩家棋子都是圆形
					const drawable = tk as unknown as {
						drawNextLocation?: (c: CanvasRenderingContext2D, x: number, y: number) => void
					} | undefined;
					drawable?.drawNextLocation?.(ctx, req.pos.x, req.pos.y);
				}
			}
			this.sceneWin.setInfo(list.length > 0
				? `${list.length} 个移动请求（Ctrl+拖动棋子来裁定）`
				: '没有待裁定的移动请求');
		} finally {
			this.refreshInFlight = false;
		}
	}

	/**
	 * 绑定掷骰窗口：GM 给玩家设阈值
	 */
	private bindDiceEvents(): void {
		this.diceWin.thresholdInput.addEventListener('keydown', e => {
			if (e.key === 'Enter') { void this.setThreshold(); }
		});
		this.diceWin.logArea.addEventListener('click', () => {
			void this.refreshRollResults();
		});
	}

	/**
	 * 给某个玩家设检定阈值
	 *
	 * ⚠️ 下拉里选的是**被要求检定的玩家**，不是 GM 自己。
	 *
	 * @returns {Promise<void>}
	 */
	private async setThreshold(): Promise<void> {
		const target = this.diceWin.targetSelect.value;
		const threshold = parseInt(this.diceWin.thresholdInput.value, 10);
		if (!target || !Number.isFinite(threshold)) {
			this.diceWin.setLog('请选玩家并填一个数字阈值');
			return;
		}
		const r = await this.api.setRollThreshold(this.cfg.scene, target,
			threshold, this.cfg.loginToken);
		if (!r.ok) {
			this.diceWin.setLog(`设定失败：${r.msg ?? '未知错误'}`);
			return;
		}
		await this.refreshRollResults();
	}

	/**
	 * 刷新检定结果
	 *
	 * **GM 侧显示阈值** —— `renderRollResults` 第二个参数传 true，
	 * 这是和玩家视图唯一的差别。
	 *
	 * @returns {Promise<void>}
	 */
	private async refreshRollResults(): Promise<void> {
		// 玩家名单取自场景的 teams 分组
		this.diceWin.enableGmPanel(this.scene.list('teams').map(t => t.id));
		const r = await this.api.getRollResults(this.cfg.scene);
		if (!r.ok) {
			this.diceWin.setLog(`读取失败：${r.msg ?? '未知错误'}`);
			return;
		}
		const text = renderRollResults(r.data ?? [], true);
		this.diceWin.setLog(text.length > 0 ? text : '（还没有检定记录）');
	}

}

/**
 * GM 编辑器的页面入口
 *
 * @param cfg - 页面注入的配置
 * @returns {Promise<SandboxEditor>} 已启动的编辑器实例
 */
export async function initSandboxEditor(
	cfg: SandboxEditorConfig): Promise<SandboxEditor> //
{
	const editor = new SandboxEditor(cfg);
	await editor.start();
	return editor;
}
