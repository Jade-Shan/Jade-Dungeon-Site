import {
	JadeUIResource, DefaultIconGroup, registerDefaultUIResource,
} from '@jade-dungeon/jade-utils/resource';
import { JadeWindowUI, UIDesktop, UIWindowAdapter, WinParam } from '@jade-dungeon/jade-utils/ui-window';
import { WebUtil } from '@jade-dungeon/jade-utils/web';
import { SandboxApi } from './sandboxApi.js';

/**
 * 沙盘的登录与选场景页
 *
 * 对应老应用的 `sandtable-index.html` + `sandtable-index.js`。
 *
 * ## 为什么这一页也做成窗口
 *
 * 最初这页是普通页面（一个静态的 `.window` 壳子），因为它是**进入应用
 * 之前**的一步，当时还没有身份、也没有场景。2026-11-06 改成和
 * view / editor 一样挂在 `UIDesktop` 上、登录表单装进一个 `UIWindowAdapter`
 * 窗口 —— 桌面上有桌面背景、底部有 Dock，登录窗口和别的窗口共用
 * 拖动 / 缩放 / 最小化那一套。登录之后带着场景参数跳 view / editor。
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

/** 页面元素的 id，页面模板里要有这些 */
export interface SandboxLoginSelectors {
	/** 用户名输入框，默认 `#username` */
	username?: string;
	/** 密码输入框，默认 `#password` */
	password?: string;
	/** 战役输入框，默认 `#campaignId` */
	campaignId?: string;
	/** 地点输入框，默认 `#placeId` */
	placeId?: string;
	/** 场景输入框，默认 `#sceneId` */
	sceneId?: string;
	/** 登录按钮，默认 `#btn-login` */
	loginBtn?: string;
	/** 注册按钮，默认 `#btn-regist` */
	registBtn?: string;
	/** 进入场景按钮，默认 `#btn-enter` */
	enterBtn?: string;
	/** 编辑场景按钮，默认 `#btn-edit` */
	editBtn?: string;
	/** 状态提示区，默认 `#login-status` */
	status?: string;
}

/** {@link SandboxLoginSelectors} 的默认值 */
const DEFAULT_SELECTORS: Required<SandboxLoginSelectors> = {
	username: '#username',
	password: '#password',
	campaignId: '#campaignId',
	placeId: '#placeId',
	sceneId: '#sceneId',
	loginBtn: '#btn-login',
	registBtn: '#btn-regist',
	enterBtn: '#btn-enter',
	editBtn: '#btn-edit',
	status: '#login-status',
};

/** 登录页配置 */
export interface SandboxLoginConfig {
	/** 后端根路径 */
	apiRoot: string;
	/** 玩家视图页的地址，默认 `./view.html` */
	viewUrl?: string;
	/** 编辑器页的地址，默认 `./editor.html` */
	editorUrl?: string;
	/** 桌面容器的 id，默认 `sandbox-desktop` */
	desktopId?: string;
	/** 页面选择器，缺省项走默认 */
	selectors?: SandboxLoginSelectors;
	/**
	 * 跳转的实现，默认 `window.location.href = url`
	 *
	 * 留这个口子有两个用处：换路由方式（比如 hash 路由）不用改这个类，
	 * 以及**单元测试能观察到跳到哪** —— jsdom 的 `window.location`
	 * 是不可重定义的（`Cannot redefine property`），没有这个参数就只能
	 * 放弃测「URL 拼得对不对」，而那正是容易出错的地方
	 *（参数没编码的话战役名里一个 `&` 就把后面的参数截断了）。
	 */
	navigate?: (url: string) => void;
}

/**
 * 去掉选择器前面的 `#`，得到元素 id
 */
function idOf(slt: string): string {
	return slt.startsWith('#') ? slt.slice(1) : slt;
}

/** 登录窗口里各元素的 id（不带 `#`，从 selectors 提出来） */
interface LoginFieldIds {
	username: string;
	password: string;
	campaignId: string;
	placeId: string;
	sceneId: string;
	loginBtn: string;
	registBtn: string;
	enterBtn: string;
	editBtn: string;
	status: string;
}

/**
 * 登录窗口：把登录表单装进一个可拖动、会进 Dock 的窗口
 *
 * 表单元素在构造时就创建好（带 id），`renderIn()` 只负责把它们按
 * 98.css 的 `fieldset` + `.field-row` 排版塞进窗体。这样 `SandboxLogin`
 * 那套 `document.querySelector` 读写逻辑不用改，元素在窗体渲染后就都在
 * document 里了。
 */
class SandboxLoginWindow extends UIWindowAdapter {

	private readonly username: HTMLInputElement = document.createElement('input');
	private readonly password: HTMLInputElement = document.createElement('input');
	private readonly campaignId: HTMLInputElement = document.createElement('input');
	private readonly placeId: HTMLInputElement = document.createElement('input');
	private readonly sceneId: HTMLInputElement = document.createElement('input');
	private readonly loginBtn: HTMLButtonElement = document.createElement('button');
	private readonly registBtn: HTMLButtonElement = document.createElement('button');
	private readonly enterBtn: HTMLButtonElement = document.createElement('button');
	private readonly editBtn: HTMLButtonElement = document.createElement('button');
	private readonly statusEl: HTMLParagraphElement = document.createElement('p');

	constructor(desktop: UIDesktop, id: string, title: string, cfg: WinParam, ids: LoginFieldIds) {
		super(desktop, id, title, cfg);

		this.username.id = ids.username;
		this.username.type = 'text';
		this.password.id = ids.password;
		this.password.type = 'password';
		this.campaignId.id = ids.campaignId;
		this.campaignId.type = 'text';
		this.campaignId.placeholder = '如 费伦大陆从北到南';
		this.placeId.id = ids.placeId;
		this.placeId.type = 'text';
		this.placeId.placeholder = '如 深水城下大迷宫';
		this.sceneId.id = ids.sceneId;
		this.sceneId.type = 'text';
		this.sceneId.placeholder = '如 第一层的门房';
		this.loginBtn.id = ids.loginBtn;
		this.loginBtn.classList.add('default');
		this.loginBtn.textContent = '登录';
		this.registBtn.id = ids.registBtn;
		this.registBtn.textContent = '注册';
		this.enterBtn.id = ids.enterBtn;
		this.enterBtn.textContent = '进入场景';
		this.editBtn.id = ids.editBtn;
		this.editBtn.textContent = '编辑场景';
		this.statusEl.id = ids.status;
	}

	renderIn(): void {
		const renderBody = (): HTMLDivElement => {
			const body = this.ui.windowBody;
			body.style.overflow = 'auto';

			body.appendChild(this.buildIdentityFieldset());
			body.appendChild(this.buildSceneFieldset());
			body.appendChild(this.statusEl);

			const bar = document.createElement('div');
			bar.classList.add('status-bar');
			const hint = document.createElement('p');
			hint.classList.add('status-bar-field');
			hint.textContent = '玩家棋子的 ID 必须与用户名一致，否则进场景会是旁观模式';
			bar.appendChild(hint);
			body.appendChild(bar);
			return body;
		};

		JadeWindowUI.renderWindowTplt(this, undefined, renderBody, undefined);
	}

	/** 「身份」一栏：用户名 + 密码 + 登录/注册按钮 */
	private buildIdentityFieldset(): HTMLFieldSetElement {
		const fs = document.createElement('fieldset');
		const legend = document.createElement('legend');
		legend.textContent = '身份';
		fs.appendChild(legend);
		fs.appendChild(this.fieldRow('用户名', this.username));
		fs.appendChild(this.fieldRow('密码', this.password));
		const btns = document.createElement('div');
		btns.classList.add('field-row');
		btns.appendChild(this.loginBtn);
		btns.appendChild(this.registBtn);
		fs.appendChild(btns);
		return fs;
	}

	/** 「场景」一栏：战役/地点/场景 + 进入/编辑按钮 */
	private buildSceneFieldset(): HTMLFieldSetElement {
		const fs = document.createElement('fieldset');
		const legend = document.createElement('legend');
		legend.textContent = '场景';
		fs.appendChild(legend);
		fs.appendChild(this.fieldRow('战役', this.campaignId));
		fs.appendChild(this.fieldRow('地点', this.placeId));
		fs.appendChild(this.fieldRow('场景', this.sceneId));
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

	/** label + 输入框 的一行 */
	private fieldRow(label: string, input: HTMLInputElement): HTMLDivElement {
		const row = document.createElement('div');
		row.classList.add('field-row');
		const lbl = document.createElement('label');
		lbl.htmlFor = input.id;
		lbl.textContent = label;
		row.appendChild(lbl);
		row.appendChild(input);
		return row;
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
		this.slt = { ...DEFAULT_SELECTORS, ...cfg.selectors };
	}

	/**
	 * 建桌面 + 登录窗口，再回填 URL 参数与已登录的身份、绑定按钮
	 */
	start(): void {
		registerDefaultUIResource();
		const desktopId = this.cfg.desktopId ?? 'sandbox-desktop';
		const host = document.getElementById(desktopId);
		if (!host) {
			throw new Error(`找不到桌面容器 #${desktopId}`);
		}
		const desktop = new UIDesktop(host, { dockBar: { range: 300, maxScale: 1.8 } });
		const icons = JadeUIResource.getDefaultIcon(DefaultIconGroup.ELEC_FACE);

		this.win = new SandboxLoginWindow(desktop, 'sandbox-login', 'Jade Dungeon 沙盘',
			{ icons, body: { initSize: { width: 360, height: 430 }, overflow: 'auto' } },
			this.fieldIds());
		this.win.renderIn();

		// URL 带了场景参数就回填，方便分享链接
		const params = new URLSearchParams(window.location.search);
		for (const key of ['campaignId', 'placeId', 'sceneId'] as const) {
			const v = params.get(key);
			if (v) { this.setValue(this.slt[key], v); }
		}
		// 已登录过就回填用户名，并提示当前身份
		const user = WebUtil.loadCookieValue(COOKIE_USER);
		const token = WebUtil.loadCookieValue(COOKIE_TOKEN);
		if (user && token) {
			this.setValue(this.slt.username, user);
			this.setStatus(`已登录：${user}`);
		} else {
			this.setStatus('请先登录');
		}

		this.onClick(this.slt.loginBtn, () => { void this.login(); });
		this.onClick(this.slt.registBtn, () => { void this.regist(); });
		this.onClick(this.slt.enterBtn, () => { this.enter(this.cfg.viewUrl ?? './view.html'); });
		this.onClick(this.slt.editBtn, () => { this.enter(this.cfg.editorUrl ?? './editor.html'); });
	}

	/** 从选择器提取各元素的 id（不带 `#`），交给窗口建元素 */
	private fieldIds(): LoginFieldIds {
		return {
			username: idOf(this.slt.username),
			password: idOf(this.slt.password),
			campaignId: idOf(this.slt.campaignId),
			placeId: idOf(this.slt.placeId),
			sceneId: idOf(this.slt.sceneId),
			loginBtn: idOf(this.slt.loginBtn),
			registBtn: idOf(this.slt.registBtn),
			enterBtn: idOf(this.slt.enterBtn),
			editBtn: idOf(this.slt.editBtn),
			status: idOf(this.slt.status),
		};
	}

	/**
	 * 登录，成功后把身份写进 cookie
	 *
	 * @returns {Promise<void>}
	 */
	private async login(): Promise<void> {
		const user = this.getValue(this.slt.username);
		const pw = this.getValue(this.slt.password);
		if (!user || !pw) { this.setStatus('用户名和密码都要填'); return; }
		this.setStatus('登录中……');
		const r = await this.api.login(user, pw);
		if (!r.ok || !r.data) {
			// 后端对错密码和不存在的用户都回同一个 msg，不区分
			this.setStatus(`登录失败：${r.msg ?? '用户名或密码错误'}`);
			return;
		}
		// path 显式设 '/'：老代码的 cookieOperator 不传 path，cookie 的作用域
		// 就落在当前目录上。三个沙盘页同目录所以能用，但换个部署布局就坏。
		// token 有效期 100 天（后端签发时定的），这里跟着设 30 天 ——
		// 过期了重新登录即可，不必让 cookie 活得比必要的更久
		const opt = { expireDays: 30, path: '/', sameSite: 'Lax' };
		WebUtil.setCookieValue(COOKIE_USER, r.data.username, opt);
		WebUtil.setCookieValue(COOKIE_TOKEN, r.data.token, opt);
		this.setStatus(`已登录：${r.data.username}`);
	}

	/**
	 * 注册
	 *
	 * 注册**不自动登录** —— 老代码也是这样，注册完还要点一次登录。
	 * 保持原行为，少一条隐式跳转。
	 *
	 * @returns {Promise<void>}
	 */
	private async regist(): Promise<void> {
		const user = this.getValue(this.slt.username);
		const pw = this.getValue(this.slt.password);
		if (!user || !pw) { this.setStatus('用户名和密码都要填'); return; }
		this.setStatus('注册中……');
		const r = await this.api.regist(user, pw);
		this.setStatus(r.ok
			? `注册成功：${r.data} —— 现在可以登录了`
			: `注册失败：${r.msg === 'username exists' ? '用户名已被占用' : (r.msg ?? '未知错误')}`);
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
		if (!user || !token) { this.setStatus('请先登录'); return; }

		const campaignId = this.getValue(this.slt.campaignId);
		const placeId = this.getValue(this.slt.placeId);
		const sceneId = this.getValue(this.slt.sceneId);
		if (!campaignId || !placeId || !sceneId) {
			this.setStatus('战役、地点、场景三个都要填');
			return;
		}
		const qs = `campaignId=${encodeURIComponent(campaignId)}`
			+ `&placeId=${encodeURIComponent(placeId)}`
			+ `&sceneId=${encodeURIComponent(sceneId)}`;
		const go = this.cfg.navigate ?? ((url: string) => { window.location.href = url; });
		go(`${baseUrl}?${qs}`);
	}

	/**
	 * 读输入框的值（去掉首尾空白）
	 * @param slt - 选择器
	 * @returns {string} 元素不存在时返回空串
	 */
	private getValue(slt: string): string {
		const el = document.querySelector<HTMLInputElement>(slt);
		return el ? el.value.trim() : '';
	}

	/**
	 * 写输入框的值
	 * @param slt - 选择器
	 * @param v - 值
	 */
	private setValue(slt: string, v: string): void {
		const el = document.querySelector<HTMLInputElement>(slt);
		if (el) { el.value = v; }
	}

	/**
	 * 显示状态
	 * @param text - 提示文字
	 */
	private setStatus(text: string): void {
		const el = document.querySelector(this.slt.status);
		if (el) { el.textContent = text; }
	}

	/**
	 * 给按钮绑点击
	 * @param slt - 选择器
	 * @param fn - 回调
	 */
	private onClick(slt: string, fn: () => void): void {
		const el = document.querySelector(slt);
		if (el) { el.addEventListener('click', fn); }
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
