import { WebUtil } from '@jade-dungeon/jade-utils/web';
import {
	JadeUIResource, DefaultIconGroup, registerDefaultUIResource,
} from '@jade-dungeon/jade-utils/resource';
import { UIDesktop } from '@jade-dungeon/jade-utils/ui-window';
import { IToken2D, SandTable } from '../trpg/sandtable.js';
import { renderRollResults, SandboxApi, SceneId } from './sandboxApi.js';
import { SandboxScene } from './sandboxScene.js';
import { SandboxDiceWindow, SandboxMapWindow } from './sandboxWindows.js';

/**
 * 沙盘的玩家视图
 *
 * 对应老应用的 `sandtable.html` + `sandtable-view.js`。玩家能做三件事：
 * 看自己视野内的场景、拖自己的棋子提移动申请、掷骰。
 *
 * ## 与老实现的差别
 *
 * | | 老实现 | 现在 |
 * |---|-------|------|
 * | 布局 | Bootstrap 栅格 + `resizeLayout()` 手算高度 | 两个窗口，自己管大小 |
 * | 坐标换算 | `sumCanvasOffset()` 递归累加 offset | `getBoundingClientRect()` |
 * | 网络层 | 10 个 `$.ajax` | `SandboxApi` |
 * | 提示 | `alert()` 打断操作 | 窗口状态栏 |
 * | 掷骰结果 | **永远是空的**（`lenght` 拼写 bug） | 修了，见 `renderRollResults` |
 *
 * ## 配置
 *
 * 页面从 `envs.js` 注入三个值，见 `src/main/html/sandbox/view.html`。
 */
export interface SandboxViewConfig {
	/** 后端根路径，来自 `envs.js` 的 `apiRoot` */
	apiRoot: string;
	/**
	 * 老相对路径图片的落点，一般传 `@@staticRoot/themes/trpg/images`
	 *
	 * 只有**存量老数据**里的相对路径会用到它 —— 新数据存的是绝对 URL。
	 * 见 `docs/sandbox-refactor.md` 4.2 节
	 */
	assetRoot: string;
	/** 桌面容器的元素 id */
	desktopId: string;
	/** 场景三级定位 */
	scene: SceneId;
	/** 当前玩家的用户名。棋子 ID 与它一致的那个就是「自己」 */
	username: string;
	/** 登录 token，提移动请求时带上 */
	loginToken?: string;
}

/** 视野范围（像素）。老代码写死 500，这里保持一致 */
const VIEW_RANGE = 500;

/** 迷雾的颜色与透明度。老代码的值 */
const SHADOW_STYLE = 'rgba(0, 0, 0, 0.7)';

/**
 * 玩家视图
 *
 * 用法见 `view.html`：构造之后调 `start()`。
 */
export class SandboxView {

	private readonly cfg: SandboxViewConfig;
	private readonly api: SandboxApi;
	private readonly scene = new SandboxScene();
	private mapWin!: SandboxMapWindow;
	private diceWin!: SandboxDiceWindow;
	private sandTable!: SandTable;

	/** 自己的棋子。找不到时为 undefined（旁观者场景下可能没有） */
	private myToken: IToken2D | undefined;
	/** 合成好的视野快照，拖动预览时用它擦掉上一帧 */
	private viewSnapshot: HTMLImageElement | undefined;
	/** 是否按住了 Ctrl（老代码的 `isMovingItem`） */
	private ctrlDown = false;
	/** 正在拖动的起点 */
	private dragFrom: { x: number, y: number } | undefined;
	/** 拖动的目标位置，鼠标松开时提交 */
	private dragTo: { x: number, y: number } | undefined;

	/**
	 * @param cfg - 页面注入的配置
	 */
	constructor(cfg: SandboxViewConfig) {
		this.cfg = cfg;
		this.api = new SandboxApi(cfg.apiRoot);
	}

	/**
	 * 启动：建窗口 → 载场景 → 画一帧 → 绑交互
	 *
	 * @returns {Promise<void>}
	 */
	async start(): Promise<void> {
		// 要用内置图标，必须在构造窗口之前调
		registerDefaultUIResource();
		const host = document.getElementById(this.cfg.desktopId);
		if (!host) {
			throw new Error(`找不到桌面容器 #${this.cfg.desktopId} —— ` +
				`页面里要有一个 <div id="${this.cfg.desktopId}" class="desktop dock-content">`);
		}
		const desktop = new UIDesktop(host, { dockBar: { range: 300, maxScale: 1.8 } });

		const icons = JadeUIResource.getDefaultIcon(DefaultIconGroup.ELEC_FACE);
		this.mapWin = new SandboxMapWindow(desktop, 'sandbox-map',
			`${this.cfg.scene.campaignId} / ${this.cfg.scene.sceneId}`,
			{ icons: icons, body: { initSize: { width: 800, height: 600 }, overflow: 'scroll' } });
		this.mapWin.renderIn();

		this.diceWin = new SandboxDiceWindow(desktop, 'sandbox-dice', '检定',
			{ icons: icons, body: { initSize: { width: 360, height: 300 }, overflow: 'auto' } });
		this.diceWin.renderIn();

		await this.loadScene();
		this.bindMapEvents();
		this.bindDiceEvents();
		await this.refreshRollResults();
	}

	/**
	 * 载入场景并渲染一帧
	 *
	 * @returns {Promise<void>}
	 */
	private async loadScene(): Promise<void> {
		this.mapWin.setStatus('载入场景……');
		const r = await this.api.loadMap(this.cfg.scene);
		if (!r.ok || !r.data) {
			// 场景不存在时后端回 msg: 'empty'
			this.mapWin.setStatus(`载入失败：${r.msg ?? '未知错误'}`);
			return;
		}
		// loadFrom 内部已经等图片加载完才建 Token —— 顺序反了棋子图片就不显示，
		// 详见 sandboxScene.ts 的 loadFrom 注释
		await this.scene.loadFrom(r.data, this.cfg.assetRoot, this.api.imageProxyUrl);

		// 缺 map 项会在这里抛可读的错，而不是在取宽高时抛 undefined.image
		const mapImg = this.scene.requireMapImage();

		this.myToken = this.scene.list('teams')
			.find(t => t.id === this.cfg.username);

		const bufCtx = this.mapWin.bufferCanvas.getContext('2d')!;
		const shwCtx = this.mapWin.finalCanvas.getContext('2d')!;
		this.sandTable = new SandTable({
			visibility: 'default',
			map: { imageUrl: mapImg.url, width: 0, height: 0, shadowStyle: SHADOW_STYLE },
			frame: {
				buff: { cvs: this.mapWin.bufferCanvas, ctx: bufCtx },
				show: { cvs: this.mapWin.finalCanvas, ctx: shwCtx },
			},
		});
		// 观察者站在自己的棋子上。没有自己的棋子时用默认位置（旁观者）
		if (this.myToken) {
			const c = this.myToken.getCenter();
			this.sandTable.observer = {
				c: { x: c.x, y: c.y },
				viewRange: () => VIEW_RANGE,
				// 带上自己的 id，遮挡阴影会跳过自己（不给自己投阴影）
				id: this.myToken.id,
			};
		}
		await this.redraw();
		this.mapWin.setStatus(this.myToken
			? '按住 Ctrl 拖动自己的棋子可以申请移动'
			: '没找到你的棋子（旁观模式）—— 棋子 ID 要和用户名一致');
	}

	/**
	 * 重画整个场景（迷雾 + 可见的 Token），并缓存一张快照
	 *
	 * 快照用于拖动预览：每帧先贴快照擦掉上一帧的预览线，再画新的预览，
	 * 这样不用整场重算迷雾（那个要跑一遍阴影投射，很慢）。
	 *
	 * @returns {Promise<void>}
	 */
	private async redraw(): Promise<void> {
		// ⚠️ **画完之后不要再碰 canvas 的 width / height** ——
		// 按 HTML 规范，给它们赋值会走 "set bitmap dimensions"，
		// 其中一步是重置上下文并**清空位图**，而且**赋同值也执行**。
		// 这里原来在下面调了一次 `resizeCanvas(w, h)`，
		// 赋的正是 drawSceneWithUserView 刚设好的那两个值 ——
		// 尺寸没变、画面全没了，表现是**窗口里一片空白且不报错**。
		//
		// 不需要补设尺寸：`drawSceneWithUserView()` 内部已经把两张画布的
		// width / height / style 四项都按地图尺寸设好了（见 sandtable.ts）。
		await this.sandTable.drawSceneWithUserView(this.scene.allTokens(),
			{ proxyUrl: this.api.imageProxyUrl });

		// 把合成结果存成图片，拖动预览时拿它当底
		const snap = new Image();
		await WebUtil.loadImageByProxy(snap, this.mapWin.finalCanvas.toDataURL());
		this.viewSnapshot = snap;
	}

	/**
	 * 绑定地图上的交互：Ctrl + 拖动自己的棋子 → 提移动申请
	 */
	private bindMapEvents(): void {
		const cvs = this.mapWin.finalCanvas;
		const ctx = cvs.getContext('2d')!;

		// Ctrl 是「进入拖动模式」的开关，沿用老代码的操作习惯
		document.addEventListener('keydown', e => {
			if (e.key === 'Control') { this.ctrlDown = true; }
		});
		document.addEventListener('keyup', e => {
			if (e.key === 'Control') { this.ctrlDown = false; }
		});

		cvs.addEventListener('mousedown', e => {
			const p = this.mapWin.toCanvasPoint(e);
			// 点在上一次的移动目标上 = 撤销请求
			if (this.dragTo && this.myToken?.isHit(p.x, p.y) === false
				&& this.hitDragTarget(p)) {
				void this.cancelMove();
				return;
			}
			if (!this.myToken?.isHit(p.x, p.y)) { return; }
			this.dragFrom = p;
		});

		cvs.addEventListener('mousemove', e => {
			if (!this.dragFrom || !this.ctrlDown || !this.myToken) { return; }
			const p = this.mapWin.toCanvasPoint(e);
			// ⚠️ **按位移量算，不是光标坐标。** 从棋子边缘抓住拖动时，
			// 直接用光标坐标会把棋子中心瞬移到光标底下（半径 25 的棋子最多偏 25px），
			// 而且**提交的坐标也跟着偏** —— 老代码是位移量语义，这里对齐它。
			const dx = p.x - this.dragFrom.x;
			const dy = p.y - this.dragFrom.y;
			// 落点用 moveTo 算，和 submitMove 提交的是同一个值
			this.dragTo = this.myToken.moveTo(dx, dy).getCenter();
			// 贴快照擦掉上一帧的预览，再画新预览
			if (this.viewSnapshot) {
				ctx.clearRect(0, 0, cvs.width, cvs.height);
				ctx.drawImage(this.viewSnapshot, 0, 0);
			}
			this.myToken.drawMovePreview(ctx, dx, dy);
		});

		cvs.addEventListener('mouseup', () => {
			if (this.dragFrom && this.ctrlDown && this.dragTo) {
				void this.submitMove(this.dragTo);
			}
			this.dragFrom = undefined;
		});
	}

	/**
	 * 点是否落在上一次申请的目标位置上（用来撤销）
	 *
	 * @param p - 画布坐标
	 * @returns {boolean}
	 */
	private hitDragTarget(p: { x: number, y: number }): boolean {
		if (!this.dragTo || !this.myToken) { return false; }
		// 目标圈的大小就是棋子自己的大小，这里用一个保守的半径判定
		const r = 25;
		const dx = p.x - this.dragTo.x;
		const dy = p.y - this.dragTo.y;
		return dx * dx + dy * dy <= r * r;
	}

	/**
	 * 提交移动申请
	 *
	 * 玩家**不能直接移动棋子** —— 本工具没有碰撞检测，是否符合移动范围与
	 * 地形条件全靠 GM 人工判断。所以这里只提申请，GM 在编辑器里裁定。
	 *
	 * @param to - 目标位置
	 * @returns {Promise<void>}
	 */
	private async submitMove(to: { x: number, y: number }): Promise<void> {
		this.mapWin.setStatus('提交移动申请……');
		const r = await this.api.requestMove(this.cfg.scene, this.cfg.username,
			to.x, to.y, this.cfg.loginToken);
		this.mapWin.setStatus(r.ok
			? `已申请移动到 (${to.x}, ${to.y})，等 GM 裁定。点目标圈可撤销`
			: `申请失败：${r.msg ?? '未知错误'}`);
	}

	/**
	 * 撤销移动申请
	 * @returns {Promise<void>}
	 */
	private async cancelMove(): Promise<void> {
		const r = await this.api.cancelMove(this.cfg.scene, this.cfg.username,
			this.cfg.loginToken);
		if (r.ok) {
			this.dragTo = undefined;
			// 擦掉预览，回到纯视野画面
			const ctx = this.mapWin.finalCanvas.getContext('2d')!;
			if (this.viewSnapshot) {
				ctx.clearRect(0, 0, this.mapWin.finalCanvas.width,
					this.mapWin.finalCanvas.height);
				ctx.drawImage(this.viewSnapshot, 0, 0);
			}
			this.mapWin.setStatus('已撤销移动申请');
		} else {
			this.mapWin.setStatus(`撤销失败：${r.msg ?? '未知错误'}`);
		}
	}

	/**
	 * 绑定掷骰窗口：回车掷骰，点结果区刷新
	 */
	private bindDiceEvents(): void {
		this.diceWin.cmdInput.addEventListener('keydown', e => {
			if (e.key === 'Enter') { void this.rollDice(); }
		});
		// 老代码是 textarea 的 onClick 刷新，保留这个习惯
		this.diceWin.logArea.addEventListener('click', () => {
			void this.refreshRollResults();
		});
	}

	/**
	 * 掷骰
	 * @returns {Promise<void>}
	 */
	private async rollDice(): Promise<void> {
		const cmd = this.diceWin.cmdInput.value.trim();
		if (cmd.length < 1) {
			this.diceWin.setLog('请输入骰子表达式，例如 2d6+1d4+3');
			return;
		}
		const r = await this.api.rollDice(this.cfg.scene, this.cfg.username,
			cmd, this.cfg.loginToken);
		if (!r.ok) {
			// 常见失败：GM 还没设阈值（not your turn）、本轮已掷过
			this.diceWin.setLog(`掷骰失败：${r.msg ?? '未知错误'}`);
			return;
		}
		await this.refreshRollResults();
	}

	/**
	 * 刷新全场检定结果
	 *
	 * **玩家侧不显示阈值** —— `renderRollResults` 的第二个参数传 false。
	 *
	 * @returns {Promise<void>}
	 */
	private async refreshRollResults(): Promise<void> {
		const r = await this.api.getRollResults(this.cfg.scene);
		if (!r.ok) {
			this.diceWin.setLog(`读取失败：${r.msg ?? '未知错误'}`);
			return;
		}
		const text = renderRollResults(r.data ?? [], false);
		this.diceWin.setLog(text.length > 0 ? text : '（还没有检定记录）');
	}

}

/**
 * 玩家视图的页面入口
 *
 * 页面里这么调（见 `src/main/html/sandbox/view.html`）：
 *
 * ```javascript
 * initSandboxView({
 *   apiRoot: '@@apiRoot',
 *   assetRoot: '@@staticRoot/themes/trpg/images',
 *   desktopId: 'sandbox-desktop',
 *   scene: {campaignId, placeId, sceneId},
 *   username: WebUtil.loadCookieValue('username'),
 *   loginToken: WebUtil.loadCookieValue('loginToken'),
 * });
 * ```
 *
 * @param cfg - 页面注入的配置
 * @returns {Promise<SandboxView>} 已启动的视图实例
 */
export async function initSandboxView(cfg: SandboxViewConfig): Promise<SandboxView> {
	const view = new SandboxView(cfg);
	await view.start();
	return view;
}
