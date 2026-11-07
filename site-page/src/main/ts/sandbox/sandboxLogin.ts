import { registerDefaultUIResource } from '@jade-dungeon/jade-utils/resource';
import { JadeWindowUI, UIDesktop, UIWindowAdapter, WinParam } from '@jade-dungeon/jade-utils/ui-window';
import { WebUtil } from '@jade-dungeon/jade-utils/web';
import { SandboxApi } from './sandboxApi.js';

/**
 * 沙盘的入口页：登录页（login.html）+ 选场景页（index.html）+ 修改密码页（changePassword.html）
 *
 * 对应老应用的 `sandtable-index.html` + `sandtable-index.js`。
 * 老应用把「登录」和「选场景」塞在一个页面里；迁移时也照搬了
 *（`sandbox/index.html` 一个窗口里上半是「身份」表单、下半是「场景」表单）。
 * 2026-11-07 拆成两个页面，随后又把登录页的「注册」换成「修改密码」单开一页：
 *
 * | 页面 | 内容 |
 * |------|------|
 * | `login.html` | 登录，成功后带着场景参数回 `index.html`；「修改密码」跳 `changePassword.html` |
 * | `index.html` | 选场景 + 显示登录态；「以其他身份登录」跳 `login.html` |
 * | `changePassword.html` | 旧密码 + 新密码×2，成功后回 `login.html` 重新登录 |
 *
 * 三个页面都是「桌面 + 一个窗口」的结构（和 view / editor 一致）：
 * 挂在 `UIDesktop` 上、窗口继承 `UIWindowAdapter`，共用拖动 / 缩放 /
 * 最小化那一套。登录之后带着场景参数跳 view / editor。
 *
 * ## 场景参数怎么在两页之间传递
 *
 * 场景三级定位（`campaignId / placeId / sceneId`）始终走 URL 参数：
 * `index.html` 填好之后，「以其他身份登录」把它们带到 `login.html`，
 * 登录成功（或放弃返回）再原样带回 `index.html`，用户不用重填。
 *
 * ## 与老实现的差别
 *
 * | | 老实现 | 现在 |
 * |---|-------|------|
 * | 提示 | `alert()` 五处 | 页面上的一行状态文字 |
 * | 登录即跳转 | 「进入场景」按钮内部先 login 再跳 | 登录与进入分开，登录态可见 |
 * | 密码传输 | POST（已经是对的） | 不变 |
 *
 * 老代码的 `goSandtable()` / `editSandtable()` 各自又调一次 `userLogin()`，
 * 所以点「进入场景」时会再登录一遍、拿一个新 token（旧的被作废）。
 * 这里改成「登录一次，之后用已有的 token」。
 */

/** 存身份的 cookie 名，和老应用一致（页面侧也靠它读） */
const COOKIE_USER = 'username';
const COOKIE_TOKEN = 'loginToken';

/** 场景三级定位的参数名，两个页面都靠它们传递 */
const SCENE_KEYS = ['campaignId', 'placeId', 'sceneId'] as const;

/** 去掉选择器前面的 `#`，得到元素 id */
function idOf(slt: string): string {
	return slt.startsWith('#') ? slt.slice(1) : slt;
}

/** label + 输入框的一行 */
function fieldRow(label: string, input: HTMLInputElement): HTMLDivElement {
	const row = document.createElement('div');
	row.classList.add('field-row');
	const lbl = document.createElement('label');
	lbl.htmlFor = input.id;
	lbl.textContent = label;
	row.appendChild(lbl);
	row.appendChild(input);
	return row;
}

/** 读输入框的值（去掉首尾空白），元素不存在时返回空串 */
function readValue(slt: string): string {
	const el = document.querySelector<HTMLInputElement>(slt);
	return el ? el.value.trim() : '';
}

/** 写输入框的值 */
function writeValue(slt: string, v: string): void {
	const el = document.querySelector<HTMLInputElement>(slt);
	if (el) { el.value = v; }
}

/** 显示状态文字 */
function writeStatus(slt: string, text: string): void {
	const el = document.querySelector(slt);
	if (el) { el.textContent = text; }
}

/** 给按钮绑点击 */
function onClick(slt: string, fn: () => void): void {
	const el = document.querySelector(slt);
	if (el) { el.addEventListener('click', fn); }
}

/**
 * 把场景三级定位拼成查询串（含 `?` 前缀；三个都没有值时返回空串）
 * @param read - 读某个 key 的当前值
 */
function sceneQuery(read: (key: (typeof SCENE_KEYS)[number]) => string): string {
	const parts: string[] = [];
	for (const k of SCENE_KEYS) {
		const v = read(k);
		if (v) { parts.push(`${k}=${encodeURIComponent(v)}`); }
	}
	return parts.length > 0 ? `?${parts.join('&')}` : '';
}

// ── 登录页（login.html） ──────────────────────────────────────────────

/** 登录页的元素选择器，页面模板里要有这些 */
export interface SandboxLoginSelectors {
	/** 用户名输入框，默认 `#username` */
	username?: string;
	/** 密码输入框，默认 `#password` */
	password?: string;
	/** 登录按钮，默认 `#btn-login` */
	loginBtn?: string;
	/** 修改密码按钮，默认 `#btn-change-password` */
	changePasswordBtn?: string;
	/** 返回选场景按钮，默认 `#btn-back` */
	backBtn?: string;
	/** 状态提示区，默认 `#login-status` */
	status?: string;
}

/** {@link SandboxLoginSelectors} 的默认值 */
const LOGIN_SELECTORS: Required<SandboxLoginSelectors> = {
	username: '#username',
	password: '#password',
	loginBtn: '#btn-login',
	changePasswordBtn: '#btn-change-password',
	backBtn: '#btn-back',
	status: '#login-status',
};

/** 登录页配置 */
export interface SandboxLoginConfig {
	/** 后端根路径 */
	apiRoot: string;
	/** 登录成功后跳转的地址，默认 `./index.html` */
	indexUrl?: string;
	/** 修改密码页的地址，默认 `./changePassword.html` */
	changePasswordUrl?: string;
	/** 桌面容器的 id，默认 `sandbox-desktop` */
	desktopId?: string;
	/** 窗口 URL 图标的基地址（如 `…/3rd/SE98`），构造窗口 IconRec 时填入 */
	iconBaseUrl: string;
	/** 页面选择器，缺省项走默认 */
	selectors?: SandboxLoginSelectors;
	/**
	 * 跳转的实现，默认 `window.location.href = url`
	 *
	 * 留这个口子有两个用处：换路由方式（比如 hash 路由）不用改这个类，
	 * 以及**单元测试能观察到跳到哪** —— jsdom 的 `window.location`
	 * 是不可重定义的，没有这个参数就只能放弃测「URL 拼得对不对」，
	 * 而那正是容易出错的地方
	 *（参数没编码的话战役名里一个 `&` 就把后面的参数截断了）。
	 */
	navigate?: (url: string) => void;
}

/** 登录窗口里各元素的 id（不带 `#`，从 selectors 提出来） */
interface LoginFieldIds {
	username: string;
	password: string;
	loginBtn: string;
	changePasswordBtn: string;
	backBtn: string;
	status: string;
}

/**
 * 登录窗口：用户名 + 密码 + 登录/修改密码按钮 + 返回选场景
 *
 * 表单元素在构造时就创建好（带 id），`renderIn()` 只负责把它们按
 * 98.css 的 `fieldset` + `.field-row` 排版塞进窗体。这样 `SandboxLogin`
 * 那套 `document.querySelector` 读写逻辑不用改，元素在窗体渲染后就都在
 * document 里了。
 */
class SandboxLoginWindow extends UIWindowAdapter {

	private readonly username: HTMLInputElement = document.createElement('input');
	private readonly password: HTMLInputElement = document.createElement('input');
	private readonly loginBtn: HTMLButtonElement = document.createElement('button');
	private readonly changePasswordBtn: HTMLButtonElement = document.createElement('button');
	private readonly backBtn: HTMLButtonElement = document.createElement('button');
	private readonly statusEl: HTMLParagraphElement = document.createElement('p');

	constructor(desktop: UIDesktop, id: string, title: string, cfg: WinParam, ids: LoginFieldIds) {
		super(desktop, id, title, cfg);

		this.username.id = ids.username;
		this.username.type = 'text';
		this.password.id = ids.password;
		this.password.type = 'password';
		this.loginBtn.id = ids.loginBtn;
		this.loginBtn.classList.add('default');
		this.loginBtn.textContent = '登录';
		this.changePasswordBtn.id = ids.changePasswordBtn;
		this.changePasswordBtn.textContent = '修改密码';
		this.backBtn.id = ids.backBtn;
		this.backBtn.textContent = '返回选场景';
		this.statusEl.id = ids.status;
	}

	renderIn(): void {
		const renderBody = (): HTMLDivElement => {
			const body = this.ui.windowBody;
			body.style.overflow = 'auto';

			body.appendChild(this.buildIdentityFieldset());

			// 返回选场景：放弃换身份，带着场景参数回 index.html
			const backRow = document.createElement('div');
			backRow.classList.add('field-row');
			backRow.appendChild(this.backBtn);
			body.appendChild(backRow);

			body.appendChild(this.statusEl);
			return body;
		};

		JadeWindowUI.renderWindowTplt(this, undefined, renderBody, undefined);
	}

	/** 「身份」一栏：用户名 + 密码 + 登录/修改密码按钮 */
	private buildIdentityFieldset(): HTMLFieldSetElement {
		const fs = document.createElement('fieldset');
		const legend = document.createElement('legend');
		legend.textContent = '身份';
		fs.appendChild(legend);
		fs.appendChild(fieldRow('用户名', this.username));
		fs.appendChild(fieldRow('密码', this.password));
		const btns = document.createElement('div');
		btns.classList.add('field-row');
		btns.appendChild(this.loginBtn);
		btns.appendChild(this.changePasswordBtn);
		fs.appendChild(btns);
		return fs;
	}

}

/**
 * 登录页
 */
export class SandboxLogin {

	private readonly api: SandboxApi;
	private readonly cfg: SandboxLoginConfig;
	private readonly slt: Required<SandboxLoginSelectors>;
	private win?: SandboxLoginWindow;

	/**
	 * @param cfg - 页面注入的配置
	 */
	constructor(cfg: SandboxLoginConfig) {
		this.cfg = cfg;
		this.api = new SandboxApi(cfg.apiRoot);
		this.slt = { ...LOGIN_SELECTORS, ...cfg.selectors };
	}

	/**
	 * 建桌面 + 登录窗口，回填已登录的用户名、绑定按钮
	 */
	start(): void {
		registerDefaultUIResource();
		const desktopId = this.cfg.desktopId ?? 'sandbox-desktop';
		const host = document.getElementById(desktopId);
		if (!host) {
			throw new Error(`找不到桌面容器 #${desktopId}`);
		}
		const desktop = new UIDesktop(host, {
			dockBar: { range: 300, maxScale: 1.8 },
		});

		this.win = new SandboxLoginWindow(desktop, 'sandbox-login', '登录',
			{
				icons: { supportSizes: 30, baseUrl: this.cfg.iconBaseUrl, category: "actions", name: "blueman-pair.png" },
				body: { initSize: { width: 360, height: 300 }, overflow: 'auto' },
			},
			this.fieldIds());
		this.win.renderIn();

		// 已登录过就回填用户名，换身份时省一次输入
		const user = WebUtil.loadCookieValue(COOKIE_USER);
		if (user) { writeValue(this.slt.username, user); }

		this.onClick(this.slt.loginBtn, () => { void this.login(); });
		this.onClick(this.slt.changePasswordBtn, () => { this.goChangePassword(); });
		this.onClick(this.slt.backBtn, () => { this.back(); });
	}

	/** 从选择器提取各元素的 id（不带 `#`），交给窗口建元素 */
	private fieldIds(): LoginFieldIds {
		return {
			username: idOf(this.slt.username),
			password: idOf(this.slt.password),
			loginBtn: idOf(this.slt.loginBtn),
			changePasswordBtn: idOf(this.slt.changePasswordBtn),
			backBtn: idOf(this.slt.backBtn),
			status: idOf(this.slt.status),
		};
	}

	/**
	 * 跳转（默认 `window.location.href = url`，可用 `navigate` 覆盖）
	 * @param url - 目标地址
	 */
	private go(url: string): void {
		const fn = this.cfg.navigate ?? ((u: string) => { window.location.href = u; });
		fn(url);
	}

	/**
	 * 带着当前 URL 里的场景参数回选场景页
	 */
	private back(): void {
		const params = new URLSearchParams(window.location.search);
		const q = sceneQuery(k => params.get(k) ?? '');
		this.go(`${this.cfg.indexUrl ?? './index.html'}${q}`);
	}

	/**
	 * 登录，成功后把身份写进 cookie，再带场景参数回选场景页
	 *
	 * @returns {Promise<void>}
	 */
	private async login(): Promise<void> {
		const user = readValue(this.slt.username);
		const pw = readValue(this.slt.password);
		if (!user || !pw) { writeStatus(this.slt.status, '用户名和密码都要填'); return; }
		writeStatus(this.slt.status, '登录中……');
		const r = await this.api.login(user, pw);
		if (!r.ok || !r.data) {
			// 后端对错密码和不存在的用户都回同一个 msg，不区分
			writeStatus(this.slt.status, `登录失败：${r.msg ?? '用户名或密码错误'}`);
			return;
		}
		// path 显式设 '/'：老代码的 cookieOperator 不传 path，cookie 的作用域
		// 就落在当前目录上。三个沙盘页同目录所以能用，但换个部署布局就坏。
		// token 有效期 100 天（后端签发时定的），这里跟着设 30 天 ——
		// 过期了重新登录即可，不必让 cookie 活得比必要的更久
		const opt = { expireDays: 30, path: '/', sameSite: 'Lax' };
		WebUtil.setCookieValue(COOKIE_USER, r.data.username, opt);
		WebUtil.setCookieValue(COOKIE_TOKEN, r.data.token, opt);
		// 登录成功，带着场景参数回选场景页（不丢用户填好的三级定位）
		const params = new URLSearchParams(window.location.search);
		const q = sceneQuery(k => params.get(k) ?? '');
		this.go(`${this.cfg.indexUrl ?? './index.html'}${q}`);
	}

	/**
	 * 带着用户名跳修改密码页
	 */
	private goChangePassword(): void {
		const user = readValue(this.slt.username);
		const q = user ? `?username=${encodeURIComponent(user)}` : '';
		this.go(`${this.cfg.changePasswordUrl ?? './changePassword.html'}${q}`);
	}

	/** 给按钮绑点击 */
	private onClick(slt: string, fn: () => void): void {
		onClick(slt, fn);
	}

}

/**
 * 登录页的入口
 *
 * @param cfg - 页面注入的配置
 * @returns {SandboxLogin} 已绑定好的实例
 */
export function initSandboxLogin(cfg: SandboxLoginConfig): SandboxLogin {
	const page = new SandboxLogin(cfg);
	page.start();
	return page;
}

// ── 选场景页（index.html） ────────────────────────────────────────────

/** 选场景页的元素选择器，页面模板里要有这些 */
export interface SandboxIndexSelectors {
	/** 战役输入框，默认 `#campaignId` */
	campaignId?: string;
	/** 地点输入框，默认 `#placeId` */
	placeId?: string;
	/** 场景输入框，默认 `#sceneId` */
	sceneId?: string;
	/** 进入场景按钮，默认 `#btn-enter` */
	enterBtn?: string;
	/** 编辑场景按钮，默认 `#btn-edit` */
	editBtn?: string;
	/** 「以其他身份登录」按钮，默认 `#btn-switch-login` */
	switchBtn?: string;
	/** 登录态提示区，默认 `#login-status` */
	status?: string;
}

/** {@link SandboxIndexSelectors} 的默认值 */
const INDEX_SELECTORS: Required<SandboxIndexSelectors> = {
	campaignId: '#campaignId',
	placeId: '#placeId',
	sceneId: '#sceneId',
	enterBtn: '#btn-enter',
	editBtn: '#btn-edit',
	switchBtn: '#btn-switch-login',
	status: '#login-status',
};

/** 选场景页配置 */
export interface SandboxIndexConfig {
	/** 玩家视图页的地址，默认 `./view.html` */
	viewUrl?: string;
	/** 编辑器页的地址，默认 `./editor.html` */
	editorUrl?: string;
	/** 登录页的地址，默认 `./login.html` */
	loginUrl?: string;
	/** 桌面容器的 id，默认 `sandbox-desktop` */
	desktopId?: string;
	/** 窗口 URL 图标的基地址（如 `…/3rd/SE98`），构造窗口 IconRec 时填入 */
	iconBaseUrl: string;
	/** 页面选择器，缺省项走默认 */
	selectors?: SandboxIndexSelectors;
	/**
	 * 跳转的实现，默认 `window.location.href = url`
	 *（同 {@link SandboxLoginConfig.navigate}，给单元测试观察跳转目标用）
	 */
	navigate?: (url: string) => void;
}

/** 选场景窗口里各元素的 id（不带 `#`，从 selectors 提出来） */
interface IndexFieldIds {
	campaignId: string;
	placeId: string;
	sceneId: string;
	enterBtn: string;
	editBtn: string;
	switchBtn: string;
	status: string;
}

/**
 * 选场景窗口：战役/地点/场景 + 进入/编辑按钮 + 登录态 + 换身份按钮
 */
class SandboxIndexWindow extends UIWindowAdapter {

	private readonly campaignId: HTMLInputElement = document.createElement('input');
	private readonly placeId: HTMLInputElement = document.createElement('input');
	private readonly sceneId: HTMLInputElement = document.createElement('input');
	private readonly enterBtn: HTMLButtonElement = document.createElement('button');
	private readonly editBtn: HTMLButtonElement = document.createElement('button');
	private readonly switchBtn: HTMLButtonElement = document.createElement('button');
	private readonly statusEl: HTMLParagraphElement = document.createElement('p');

	constructor(desktop: UIDesktop, id: string, title: string, cfg: WinParam, ids: IndexFieldIds) {
		super(desktop, id, title, cfg);

		this.campaignId.id = ids.campaignId;
		this.campaignId.type = 'text';
		this.campaignId.placeholder = '如 费伦大陆从北到南';
		this.placeId.id = ids.placeId;
		this.placeId.type = 'text';
		this.placeId.placeholder = '如 深水城下大迷宫';
		this.sceneId.id = ids.sceneId;
		this.sceneId.type = 'text';
		this.sceneId.placeholder = '如 第一层的门房';
		this.enterBtn.id = ids.enterBtn;
		this.enterBtn.textContent = '进入场景';
		this.editBtn.id = ids.editBtn;
		this.editBtn.textContent = '编辑场景';
		this.switchBtn.id = ids.switchBtn;
		this.switchBtn.textContent = '以其他身份登录';
		this.statusEl.id = ids.status;
	}

	renderIn(): void {
		const renderBody = (): HTMLDivElement => {
			const body = this.ui.windowBody;
			body.style.overflow = 'auto';

			body.appendChild(this.buildSceneFieldset());

			// 登录态 + 换身份：状态文字在左、「以其他身份登录」在右
			const row = document.createElement('div');
			row.classList.add('field-row');
			row.appendChild(this.statusEl);
			row.appendChild(this.switchBtn);
			body.appendChild(row);
			return body;
		};

		const renderStatusBar = (): HTMLDivElement => {
			const bar = document.createElement('div');
			bar.classList.add('status-bar');
			const hint = document.createElement('p');
			hint.classList.add('status-bar-field');
			hint.textContent = '玩家棋子的 ID 必须与用户名一致，否则进场景会是旁观模式';
			bar.appendChild(hint);
			return bar;
		};

		JadeWindowUI.renderWindowTplt(this, undefined, renderBody, renderStatusBar);
	}

	/** 「场景」一栏：战役/地点/场景 + 进入/编辑按钮 */
	private buildSceneFieldset(): HTMLFieldSetElement {
		const fs = document.createElement('fieldset');
		const legend = document.createElement('legend');
		legend.textContent = '场景';
		fs.appendChild(legend);
		fs.appendChild(fieldRow('战役', this.campaignId));
		fs.appendChild(fieldRow('地点', this.placeId));
		fs.appendChild(fieldRow('场景', this.sceneId));
		const btns = document.createElement('div');
		btns.classList.add('field-row');
		btns.appendChild(this.enterBtn);
		btns.appendChild(this.editBtn);
		fs.appendChild(btns);
		const note = document.createElement('p');
		note.textContent = '第一个用新战役名保存的人成为它的拥有者，其他人改不了该战役的任何场景。';
		fs.appendChild(note);
		return fs;
	}

}

/**
 * 选场景页
 */
export class SandboxIndex {

	private readonly cfg: SandboxIndexConfig;
	private readonly slt: Required<SandboxIndexSelectors>;
	private win?: SandboxIndexWindow;

	/**
	 * @param cfg - 页面注入的配置
	 */
	constructor(cfg: SandboxIndexConfig) {
		this.cfg = cfg;
		this.slt = { ...INDEX_SELECTORS, ...cfg.selectors };
	}

	/**
	 * 建桌面 + 选场景窗口，回填 URL 参数与已登录的身份、绑定按钮
	 */
	start(): void {
		registerDefaultUIResource();
		const desktopId = this.cfg.desktopId ?? 'sandbox-desktop';
		const host = document.getElementById(desktopId);
		if (!host) {
			throw new Error(`找不到桌面容器 #${desktopId}`);
		}
		const desktop = new UIDesktop(host, {
			dockBar: { range: 300, maxScale: 1.8 },
		});

		this.win = new SandboxIndexWindow(desktop, 'sandbox-index', 'Jade Dungeon 沙盘',
			{
				icons: { supportSizes: 30, baseUrl: this.cfg.iconBaseUrl, category: "actions", name: "blueman-pair.png" },
				body: { initSize: { width: 360, height: 340 }, overflow: 'auto' },
			},
			this.fieldIds());
		this.win.renderIn();

		// URL 带了场景参数就回填，方便分享链接
		const params = new URLSearchParams(window.location.search);
		for (const key of SCENE_KEYS) {
			const v = params.get(key);
			if (v) { writeValue(this.slt[key], v); }
		}
		// 已登录过就显示身份，并提示当前身份
		const user = WebUtil.loadCookieValue(COOKIE_USER);
		const token = WebUtil.loadCookieValue(COOKIE_TOKEN);
		if (user && token) {
			writeStatus(this.slt.status, `已登录：${user}`);
		} else {
			writeStatus(this.slt.status, '请先登录');
		}

		this.onClick(this.slt.enterBtn, () => { this.enter(this.cfg.viewUrl ?? './view.html'); });
		this.onClick(this.slt.editBtn, () => { this.enter(this.cfg.editorUrl ?? './editor.html'); });
		this.onClick(this.slt.switchBtn, () => { this.switchLogin(); });
	}

	/** 从选择器提取各元素的 id（不带 `#`），交给窗口建元素 */
	private fieldIds(): IndexFieldIds {
		return {
			campaignId: idOf(this.slt.campaignId),
			placeId: idOf(this.slt.placeId),
			sceneId: idOf(this.slt.sceneId),
			enterBtn: idOf(this.slt.enterBtn),
			editBtn: idOf(this.slt.editBtn),
			switchBtn: idOf(this.slt.switchBtn),
			status: idOf(this.slt.status),
		};
	}

	/** 跳转（同 {@link SandboxLogin.go}） */
	private go(url: string): void {
		const fn = this.cfg.navigate ?? ((u: string) => { window.location.href = u; });
		fn(url);
	}

	/**
	 * 带着场景参数跳到 view 或 editor
	 *
	 * **跳转前检查登录态** —— 老代码是「点进入时顺便登录一次」，
	 * 那样每次进场景都换一个新 token（旧的被作废），
	 * 开两个标签页时前一个就失效了。
	 *
	 * @param baseUrl - 目标页地址
	 */
	private enter(baseUrl: string): void {
		const user = WebUtil.loadCookieValue(COOKIE_USER);
		const token = WebUtil.loadCookieValue(COOKIE_TOKEN);
		if (!user || !token) { writeStatus(this.slt.status, '请先登录'); return; }

		const campaignId = readValue(this.slt.campaignId);
		const placeId = readValue(this.slt.placeId);
		const sceneId = readValue(this.slt.sceneId);
		if (!campaignId || !placeId || !sceneId) {
			writeStatus(this.slt.status, '战役、地点、场景三个都要填');
			return;
		}
		const qs = `campaignId=${encodeURIComponent(campaignId)}`
			+ `&placeId=${encodeURIComponent(placeId)}`
			+ `&sceneId=${encodeURIComponent(sceneId)}`;
		this.go(`${baseUrl}?${qs}`);
	}

	/**
	 * 带着当前填好的场景参数跳登录页
	 */
	private switchLogin(): void {
		const q = sceneQuery(k => readValue(this.slt[k]));
		this.go(`${this.cfg.loginUrl ?? './login.html'}${q}`);
	}

	/** 给按钮绑点击 */
	private onClick(slt: string, fn: () => void): void {
		onClick(slt, fn);
	}

}

/**
 * 选场景页的入口
 *
 * @param cfg - 页面注入的配置
 * @returns {SandboxIndex} 已绑定好的实例
 */
export function initSandboxIndex(cfg: SandboxIndexConfig): SandboxIndex {
	const page = new SandboxIndex(cfg);
	page.start();
	return page;
}

// ── 修改密码页（changePassword.html） ────────────────────────────────

/** 修改密码页的元素选择器，页面模板里要有这些 */
export interface SandboxChangePasswordSelectors {
	/** 旧密码输入框，默认 `#old-password` */
	oldPassword?: string;
	/** 新密码输入框，默认 `#new-password` */
	newPassword?: string;
	/** 确认新密码输入框，默认 `#confirm-password` */
	confirmPassword?: string;
	/** 提交按钮，默认 `#btn-submit-change` */
	submitBtn?: string;
	/** 返回登录按钮，默认 `#btn-back-login` */
	backBtn?: string;
	/** 状态提示区，默认 `#change-password-status` */
	status?: string;
}

/** {@link SandboxChangePasswordSelectors} 的默认值 */
const CHANGE_PASSWORD_SELECTORS: Required<SandboxChangePasswordSelectors> = {
	oldPassword: '#old-password',
	newPassword: '#new-password',
	confirmPassword: '#confirm-password',
	submitBtn: '#btn-submit-change',
	backBtn: '#btn-back-login',
	status: '#change-password-status',
};

/** 修改密码页配置 */
export interface SandboxChangePasswordConfig {
	/** 后端根路径 */
	apiRoot: string;
	/** 修改成功后跳转的地址，默认 `./login.html` */
	loginUrl?: string;
	/** 桌面容器的 id，默认 `sandbox-desktop` */
	desktopId?: string;
	/** 窗口 URL 图标的基地址（如 `…/3rd/SE98`），构造窗口 IconRec 时填入 */
	iconBaseUrl: string;
	/** 页面选择器，缺省项走默认 */
	selectors?: SandboxChangePasswordSelectors;
	/**
	 * 跳转的实现，默认 `window.location.href = url`
	 *（同 {@link SandboxLoginConfig.navigate}，给单元测试观察跳转目标用）
	 */
	navigate?: (url: string) => void;
}

/** 修改密码窗口里各元素的 id（不带 `#`，从 selectors 提出来） */
interface ChangePasswordFieldIds {
	oldPassword: string;
	newPassword: string;
	confirmPassword: string;
	submitBtn: string;
	backBtn: string;
	status: string;
}

/**
 * 新密码强度校验：至少 8 位，且同时包含数字、字母、特殊字符
 *
 * 与后端 `authService.checkPasswordStrength` 同一套规则。这里先在前端
 * 拦一道给即时反馈（不等网络往返），后端再兜底（前端可被绕过）。
 */
function checkNewPassword(pw: string): { ok: boolean; msg: string } {
	if (pw.length < 8) { return { ok: false, msg: '新密码长度至少 8 位' }; }
	const hasDigit = /\d/.test(pw);
	const hasLetter = /[a-zA-Z]/.test(pw);
	const hasSpecial = /[^a-zA-Z0-9]/.test(pw);
	if (!hasDigit || !hasLetter || !hasSpecial) {
		return { ok: false, msg: '新密码需同时包含数字、字母、特殊字符' };
	}
	return { ok: true, msg: '' };
}

/**
 * 修改密码窗口：旧密码 + 新密码 + 确认新密码 + 提交/返回
 *
 * 三个输入框都是 password 类型。用户名从 URL 参数带来（登录页跳转时带上），
 * 窗口里只读展示、不另开输入框 —— 改谁由「从哪进来的」决定。
 */
class SandboxChangePasswordWindow extends UIWindowAdapter {

	private readonly oldPassword: HTMLInputElement = document.createElement('input');
	private readonly newPassword: HTMLInputElement = document.createElement('input');
	private readonly confirmPassword: HTMLInputElement = document.createElement('input');
	private readonly submitBtn: HTMLButtonElement = document.createElement('button');
	private readonly backBtn: HTMLButtonElement = document.createElement('button');
	private readonly statusEl: HTMLParagraphElement = document.createElement('p');
	private readonly username: string;

	constructor(desktop: UIDesktop, id: string, title: string, cfg: WinParam,
		ids: ChangePasswordFieldIds, username: string) //
	{
		super(desktop, id, title, cfg);

		this.username = username;
		this.oldPassword.id = ids.oldPassword;
		this.oldPassword.type = 'password';
		this.newPassword.id = ids.newPassword;
		this.newPassword.type = 'password';
		this.confirmPassword.id = ids.confirmPassword;
		this.confirmPassword.type = 'password';
		this.submitBtn.id = ids.submitBtn;
		this.submitBtn.classList.add('default');
		this.submitBtn.textContent = '修改密码';
		this.backBtn.id = ids.backBtn;
		this.backBtn.textContent = '返回登录';
		this.statusEl.id = ids.status;
	}

	renderIn(): void {
		const renderBody = (): HTMLDivElement => {
			const body = this.ui.windowBody;
			body.style.overflow = 'auto';

			const who = document.createElement('p');
			who.textContent = this.username ? `用户名：${this.username}` : '用户名：未指定（请从登录页进入）';
			body.appendChild(who);

			body.appendChild(this.buildFieldset());
			body.appendChild(this.statusEl);
			return body;
		};

		JadeWindowUI.renderWindowTplt(this, undefined, renderBody, undefined);
	}

	/** 「修改密码」一栏：旧密码 + 新密码×2 + 提交/返回 */
	private buildFieldset(): HTMLFieldSetElement {
		const fs = document.createElement('fieldset');
		const legend = document.createElement('legend');
		legend.textContent = '修改密码';
		fs.appendChild(legend);
		fs.appendChild(fieldRow('旧密码', this.oldPassword));
		fs.appendChild(fieldRow('新密码', this.newPassword));
		fs.appendChild(fieldRow('确认新密码', this.confirmPassword));
		const btns = document.createElement('div');
		btns.classList.add('field-row');
		btns.appendChild(this.submitBtn);
		btns.appendChild(this.backBtn);
		fs.appendChild(btns);
		const note = document.createElement('p');
		note.textContent = '新密码至少 8 位，且同时包含数字、字母、特殊字符。';
		fs.appendChild(note);
		return fs;
	}

}

/**
 * 修改密码页
 */
export class SandboxChangePassword {

	private readonly api: SandboxApi;
	private readonly cfg: SandboxChangePasswordConfig;
	private readonly slt: Required<SandboxChangePasswordSelectors>;
	/** 从 URL 参数带来的用户名（登录页跳转时带上） */
	private readonly username: string;
	private win?: SandboxChangePasswordWindow;

	constructor(cfg: SandboxChangePasswordConfig) {
		this.cfg = cfg;
		this.api = new SandboxApi(cfg.apiRoot);
		this.slt = { ...CHANGE_PASSWORD_SELECTORS, ...cfg.selectors };
		this.username = new URLSearchParams(window.location.search).get('username') ?? '';
	}

	start(): void {
		registerDefaultUIResource();
		const desktopId = this.cfg.desktopId ?? 'sandbox-desktop';
		const host = document.getElementById(desktopId);
		if (!host) {
			throw new Error(`找不到桌面容器 #${desktopId}`);
		}
		const desktop = new UIDesktop(host, {
			dockBar: { range: 300, maxScale: 1.8 },
		});

		this.win = new SandboxChangePasswordWindow(desktop, 'sandbox-change-password', '修改密码',
			{
				icons: { supportSizes: 30, baseUrl: this.cfg.iconBaseUrl, category: "actions", name: "blueman-pair.png" },
				body: { initSize: { width: 360, height: 360 }, overflow: 'auto' },
			},
			this.fieldIds(), this.username);
		this.win.renderIn();

		this.onClick(this.slt.submitBtn, () => { void this.submit(); });
		this.onClick(this.slt.backBtn, () => { this.back(); });
	}

	private fieldIds(): ChangePasswordFieldIds {
		return {
			oldPassword: idOf(this.slt.oldPassword),
			newPassword: idOf(this.slt.newPassword),
			confirmPassword: idOf(this.slt.confirmPassword),
			submitBtn: idOf(this.slt.submitBtn),
			backBtn: idOf(this.slt.backBtn),
			status: idOf(this.slt.status),
		};
	}

	/** 跳转（同 {@link SandboxLogin.go}） */
	private go(url: string): void {
		const fn = this.cfg.navigate ?? ((u: string) => { window.location.href = u; });
		fn(url);
	}

	/**
	 * 提交修改密码：本地校验（非空、一致、强度）→ 请求后端 → 成功回登录页
	 */
	private async submit(): Promise<void> {
		if (!this.username) {
			writeStatus(this.slt.status, '缺少用户名，请从登录页进入');
			return;
		}
		const oldPw = readValue(this.slt.oldPassword);
		const newPw = readValue(this.slt.newPassword);
		const confirmPw = readValue(this.slt.confirmPassword);
		if (!oldPw || !newPw || !confirmPw) {
			writeStatus(this.slt.status, '三个密码框都要填');
			return;
		}
		if (newPw !== confirmPw) {
			writeStatus(this.slt.status, '两次输入的新密码不一致');
			return;
		}
		const strength = checkNewPassword(newPw);
		if (!strength.ok) { writeStatus(this.slt.status, strength.msg); return; }

		writeStatus(this.slt.status, '修改中……');
		const r = await this.api.changePassword(this.username, oldPw, newPw);
		if (!r.ok) {
			writeStatus(this.slt.status, `修改失败：${r.msg ?? '未知错误'}`);
			return;
		}
		// 改成功后回登录页，用新密码重新登录（旧 token 已被后端作废）
		this.go(this.cfg.loginUrl ?? './login.html');
	}

	/** 返回登录页 */
	private back(): void {
		this.go(this.cfg.loginUrl ?? './login.html');
	}

	private onClick(slt: string, fn: () => void): void {
		onClick(slt, fn);
	}

}

/**
 * 修改密码页的入口
 *
 * @param cfg - 页面注入的配置
 * @returns {SandboxChangePassword} 已绑定好的实例
 */
export function initSandboxChangePassword(cfg: SandboxChangePasswordConfig): SandboxChangePassword {
	const page = new SandboxChangePassword(cfg);
	page.start();
	return page;
}
