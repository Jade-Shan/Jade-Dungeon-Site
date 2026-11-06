import { SimpleMap } from '@jade-dungeon/jade-utils/data';
import { HttpResponse, WebUtil } from '@jade-dungeon/jade-utils/web';
import { SceneDataResp } from '../trpg/sandtable.js';

/**
 * 沙盘后端接口的封装
 *
 * 替代老应用 `sandtable-comm.js` 里那 10 个 jQuery `$.ajax` 封装
 * （外加 `sandtable-index.js` 的登录/注册两个），全部改走
 * `WebUtil.requestHttp`。迁移方案见 `docs/sandbox-refactor.md`。
 *
 * ## 三个共同约定
 *
 * - **URL 都带 `t=<时间戳>`**：沿用老代码的做法绕开浏览器缓存。
 *   沙盘数据会被 GM 随时改，读到缓存等于看到旧局面
 * - **后端一律回 HTTP 200**，成败看响应体的 `status` 字段
 *   （`'success'` / `'err'` / `'error'` —— 后端两种拼写都有，见下）
 * - **失败不抛异常**，返回 `{ok: false, msg}`。沙盘是长时间开着的页面，
 *   一次网络抖动不该让整个界面崩掉
 *
 * ## ⚠️ 后端的 `status` 有两种失败值
 *
 * 实测 `site-api` 的 `routes/sandtable/`：`map.ts` 的读接口回 `'error'`、
 * `save-map` 回 `'err'`，`dice.ts` 全回 `'error'`。
 * 所以**只能判断「是不是 success」**，不能判断「是不是等于某个失败值」。
 */

/** 沙盘接口的统一返回：成功带数据，失败带原因 */
export interface ApiResult<T> {
	/** 是否成功（即后端的 `status === 'success'`） */
	ok  : boolean;
	/** 成功时的数据 */
	data?: T;
	/** 失败原因 */
	msg ?: string;
}

/** 场景的三级定位 */
export interface SceneId {
	/** 战役 / 模组 ID */
	campaignId: string;
	/** 地点 ID */
	placeId   : string;
	/** 场景 ID */
	sceneId   : string;
}

/** 棋子的移动请求（后端 `IMoveRequest`） */
export interface MoveRequestRec {
	/** 提出请求的用户名 */
	userId: string;
	/** 想移动到的位置 */
	pos   : { x: number, y: number };
}

/** 检定结果的一行（后端 `IRollResultRow`） */
export interface RollResultRow {
	/** 玩家用户名 */
	userId   : string;
	/** 通过阈值 */
	threshold: number;
	/** 掷骰总和，0 表示还没掷 */
	sum      : number;
	/** 掷骰详情，前端直接显示 */
	msg      : string;
}

/** 登录成功后拿到的身份 */
export interface LoginRec {
	/** 用户名 */
	username: string;
	/** 登录 token */
	token   : string;
}

// ───────────────────────── 纯函数 ─────────────────────────

/** 存量数据里老相对路径的前缀，见 {@link normalizeImageUrl} */
const LEGACY_IMG_PREFIX = './images/sandtable/';

/**
 * 把场景数据里的图片 URL 归一化成当前页面能解析的形式
 *
 * **新数据一律是绝对 URL**，本函数对它们原样放过 —— 那是跨源图片，
 * 要走 `parseImage` 代理（跨源图会污染 canvas，`getImageData()` 会抛错）。
 *
 * 相对路径只出现在**老沙盘应用存下的数据**里：老页面在 `webroot/` 根上、
 * 图片在 `webroot/images/sandtable/`，所以存的是 `./images/sandtable/xxx.jpg`。
 * 新页面在 `webroot/html/sandbox/` 下，相对基准变了，原样用会 404 ——
 * 而且 `loadImageByProxy` 的失败分支是静默换占位图、不报错，
 * 表现是「地图变成一张 50×50 的灰色小图」。
 *
 * ⚠️ **接对了目录也多半还是 404** —— 老数据引用的 5 张 png
 *（`char.png` / `solider01.png` / `moster.01.png` / `door-wood.png` / `map.png`）
 * 在老项目里就不存在，另外 3 张 jpg 是 demo 资源、本模块不发。
 * 这个分支的作用是「让它落在可解释的位置」，不是「修好它」。
 * GM 需要在编辑器里重新指定图片。
 *
 * @param url - 场景数据里的 URL
 * @param assetRoot - 老相对路径的落点（不带尾斜杠），由页面从 `envs.js` 注入
 * @returns {string} 归一化后的 URL
 */
export function normalizeImageUrl(url: string, assetRoot: string): string {
	if (!url) { return url; }
	// 绝对地址与协议相对地址：新数据的正常形态，原样放过
	if (/^(https?:)?\/\//.test(url)) { return url; }
	// 内联数据不涉及路径
	if (url.startsWith('data:') || url.startsWith('blob:')) { return url; }
	// 剩下的是老数据的相对路径，按文件名接到 assetRoot 上。
	// 老前缀和其他相对写法走同一条分支 —— 都只取文件名
	const file = url.startsWith(LEGACY_IMG_PREFIX)
		? url.slice(LEGACY_IMG_PREFIX.length) : url.split('/').pop();
	return `${assetRoot}/${file}`;
}

/**
 * 把检定结果渲染成文本
 *
 * ⚠️ 老代码有**两份**实现，view 那份把 `length` 拼成了 `lenght`
 *（`sandtable-view.js:252`），于是 `for(i=0; i < undefined; i++)` 循环零次 ——
 * **玩家侧的检定结果永远是空的，而且不报错**。
 * 这里合成一份并修掉，`showThreshold` 区分两种用法：
 * GM 看得到阈值，玩家看不到。
 *
 * @param rows - 后端 `get-roll-result` 返回的结果列表
 * @param showThreshold - 是否显示阈值（GM 传 true，玩家传 false）
 * @returns {string} 多行文本，直接塞进 textarea
 */
export function renderRollResults(rows: Array<RollResultRow>,
	showThreshold: boolean): string //
{
	let text = '';
	// 用 for...of 而不是索引循环 —— 不会再有拼错属性名的机会
	for (const rec of rows) {
		text += `* ${rec.userId}    `;
		if (showThreshold) { text += `阈值：${rec.threshold}\n`; }
		text += rec.sum > 0
			? `  ${rec.sum < rec.threshold ? '失败' : '成功'}：${rec.msg}\n`
			: '  等待中……\n';
	}
	return text;
}

// ───────────────────────── 请求底座 ─────────────────────────

/** 后端响应的公共形状 */
interface RawResp {
	status: string;
	msg   ?: string;
	data  ?: unknown;
}

/**
 * 拼查询串，顺带带上防缓存的 `t`
 *
 * 老代码每个接口都手写一遍 `encodeURIComponent` 再手工拼 `&` ——
 * 10 个接口里拼错一处就是个只在特定参数下复现的 bug。这里统一掉。
 *
 * @param params - 参数表，`undefined` 的项跳过
 * @returns {string} 形如 `a=1&b=2&t=1699...`，不带前导 `?`
 */
function qs(params: Record<string, string | number | undefined>): string {
	const parts: Array<string> = [];
	for (const [k, v] of Object.entries(params)) {
		if (v === undefined || v === null) { continue; }
		parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
	}
	// 沿用老代码：带时间戳绕开浏览器缓存
	parts.push(`t=${Date.now()}`);
	return parts.join('&');
}

/**
 * 发一次请求并把后端的 `status` 翻译成 {@link ApiResult}
 *
 * @param url - 完整 URL
 * @param pick - 从原始响应里取出数据的函数，不传表示不需要数据
 * @param post - POST 的请求体（已编码好的 form 串）。不传则发 GET
 * @returns {Promise<ApiResult<T>>} 失败时 `ok: false`，**不抛异常**
 */
async function call<T>(url: string, pick?: (r: RawResp) => T,
	post?: string): Promise<ApiResult<T>> //
{
	const headers: SimpleMap<string, string> = new SimpleMap([
		['Accept', 'application/json, text/javascript, */*; q=0.01'],
	]);
	if (post !== undefined) {
		// ⚠️ 必须显式设这个头。WebUtil.requestHttp 不设任何 Content-Type，
		// 而后端靠 express.urlencoded() 解析 —— 不设头两个中间件都不解析，
		// data.params.jsonStr 会是 undefined，后端回 "miss params"
		headers.put('Content-Type', 'application/x-www-form-urlencoded');
	}
	try {
		const resp: HttpResponse<RawResp> = await WebUtil.requestHttp<string, RawResp>({
			method: post === undefined ? 'GET' : 'POST', url: url,
			opt: { headers: headers, timeout: 30_000 },
			body: post,
		}, {
			onLoad: (evt, xhr) => ({
				statusCode: xhr.status, statusMsg: xhr.statusText,
				body: xhr.responseText ? JSON.parse(xhr.responseText) : null,
			}),
		});
		const body = resp.body;
		if (!body) { return { ok: false, msg: 'empty response' }; }
		// 只判断「是不是 success」—— 后端的失败值有 'err' 和 'error' 两种拼写
		if (body.status !== 'success') {
			return { ok: false, msg: body.msg ?? body.status };
		}
		return pick ? { ok: true, data: pick(body) } : { ok: true };
	} catch (e) {
		// requestHttp 在 onerror / ontimeout / onabort 时是 reject
		console.error(`sandbox api failed: ${url}`, e);
		return { ok: false, msg: '网络异常' };
	}
}

/** 规整 API 根路径：保证不带尾斜杠，调用处统一用 `${root}/api/...` 拼 */
function apiBase(apiRoot: string): string {
	if (!apiRoot || apiRoot.length < 1) { return ''; }
	return apiRoot.endsWith('/') ? apiRoot.slice(0, -1) : apiRoot;
}

// ───────────────────────── 接口 ─────────────────────────

/**
 * 沙盘后端接口
 *
 * 一个实例对应一个后端地址。所有方法都返回 {@link ApiResult}，不抛异常。
 *
 * ```typescript
 * const api = new SandboxApi('//localhost:8089');
 * const r = await api.loadMap({campaignId: 'c1', placeId: 'p1', sceneId: 's1'});
 * if (r.ok) { console.log(r.data!.mapDatas); }
 * ```
 */
export class SandboxApi {

	/** 后端根路径，不带尾斜杠 */
	private readonly root: string;

	/**
	 * @param apiRoot - 后端根路径，由页面从 `envs.js` 的 `apiRoot` 传入
	 */
	constructor(apiRoot: string) {
		this.root = apiBase(apiRoot);
	}

	/** 图片代理的 URL 前缀，传给 `loadImageByProxy` 的 `proxyUrl` */
	get imageProxyUrl(): string {
		return `${this.root}/api/sandtable/parseImage?src=`;
	}

	// ── 地图 ──

	/**
	 * 读场景数据（图片资源 + 各组 Token）
	 *
	 * 后端把整块场景 JSON 原样存着、原样返回，所以这里拿到的就是当初
	 * GM 保存时那份 —— 包括可能的 `visiable` 老拼写（读取由
	 * `trpg/sandtable.ts` 的 `readVisible()` 兼容）。
	 *
	 * @param id - 场景三级定位
	 * @returns {Promise<ApiResult<SceneDataResp>>} 场景不存在时 `ok: false`、`msg: 'empty'`
	 */
	async loadMap(id: SceneId): Promise<ApiResult<SceneDataResp>> {
		const url = `${this.root}/api/sandtable/load-map?${qs({ ...id })}`;
		return call<SceneDataResp>(url, r => r as unknown as SceneDataResp);
	}

	/**
	 * 保存并发布场景
	 *
	 * **身份靠 `jsonStr` 里的 `loginToken`** —— 后端从请求体里解析它，
	 * 不信任何 query 参数（老实现信 `payload.username`，可被任意伪造）。
	 * 所以调用方必须把 `username` 与 `loginToken` 一起序列化进去。
	 *
	 * 非该战役的 owner 会得到 `ok: false` + `msg: 'not owner'`。
	 *
	 * @param id - 场景三级定位
	 * @param jsonStr - 整块场景 JSON（含 `username` / `loginToken`）
	 * @returns {Promise<ApiResult<void>>}
	 */
	async saveMap(id: SceneId, jsonStr: string): Promise<ApiResult<void>> {
		const url = `${this.root}/api/sandtable/save-map?${qs({ ...id })}`;
		return call<void>(url, undefined, `jsonStr=${encodeURIComponent(jsonStr)}`);
	}

	/**
	 * 查战役的 owner
	 *
	 * **老前端从没调过这个接口**（`sandtable-comm.js` 里定义了
	 * `queryCampaignOwner` 但无调用点）。保留封装是因为它能让编辑器在
	 * 进入时就提示「你不是 owner，改了也存不上」，而不是等到保存才报错。
	 *
	 * @param campaignId - 战役 ID
	 * @returns {Promise<ApiResult<string>>} owner 的用户名；无主战役返回空串
	 */
	async mapOwner(campaignId: string): Promise<ApiResult<string>> {
		const url = `${this.root}/api/sandtable/map-owner?${qs({ campaignId })}`;
		return call<string>(url, r => String((r as { owner?: string }).owner ?? ''));
	}

	// ── 移动请求 ──

	/**
	 * 读某场景下所有棋子的移动请求
	 *
	 * @param id - 场景三级定位
	 * @returns {Promise<ApiResult<Array<MoveRequestRec>>>}
	 */
	async loadMoveRequests(id: SceneId): Promise<ApiResult<Array<MoveRequestRec>>> {
		const url = `${this.root}/api/sandtable/load-move-request?${qs({ ...id })}`;
		return call<Array<MoveRequestRec>>(url,
			r => (r.data as Array<MoveRequestRec>) ?? []);
	}

	/**
	 * 提交移动请求
	 *
	 * **坐标传负数表示撤销**（后端判 `x > -1 && y > -1`，不满足就删请求）。
	 * 所以撤销走 {@link SandboxApi.cancelMove}，别自己传 -1。
	 *
	 * `token` 是**可选**的：带了后端就以 token 的身份为准，没带则信
	 * `username` 并在后端打告警。**新代码应该总是带上** ——
	 * 不带的话任何人都能以别人的名义移动棋子
	 * （`site-api/docs/todo-next.md` 的 1.1 正等着前端这一步）。
	 *
	 * @param id - 场景三级定位
	 * @param username - 申请人
	 * @param x - 目标 X
	 * @param y - 目标 Y
	 * @param token - 登录 token，强烈建议传
	 * @returns {Promise<ApiResult<void>>}
	 */
	async requestMove(id: SceneId, username: string, x: number, y: number,
		token?: string): Promise<ApiResult<void>> //
	{
		const url = `${this.root}/api/sandtable/request-move?${qs({ ...id, username, x, y, token })}`;
		return call<void>(url);
	}

	/**
	 * 撤销自己的移动请求
	 *
	 * 实现上是传 `(-1, -1)` —— 后端把负坐标当成「删掉这条请求」。
	 *
	 * @param id - 场景三级定位
	 * @param username - 申请人
	 * @param token - 登录 token
	 * @returns {Promise<ApiResult<void>>}
	 */
	async cancelMove(id: SceneId, username: string,
		token?: string): Promise<ApiResult<void>> //
	{
		return this.requestMove(id, username, -1, -1, token);
	}

	// ── 掷骰 ──

	/**
	 * 掷骰
	 *
	 * 两个前置条件由后端把关，不满足时 `ok: false`：
	 * GM 得先给这个玩家设过阈值（否则 `not your turn`）、且本轮没掷过。
	 *
	 * @param id - 场景三级定位
	 * @param username - 掷骰的玩家
	 * @param rollCmd - 骰子表达式，如 `2d6+1d4+3`
	 * @param token - 登录 token
	 * @returns {Promise<ApiResult<unknown>>} 后端回的 `data`（掷骰详情）
	 */
	async rollDice(id: SceneId, username: string, rollCmd: string,
		token?: string): Promise<ApiResult<unknown>> //
	{
		const url = `${this.root}/api/sandtable/roll-dice?${qs({ ...id, username, rollCmd, token })}`;
		return call<unknown>(url, r => r.data);
	}

	/**
	 * 设定某玩家的检定阈值（GM 用）
	 *
	 * ⚠️ **`username` 是「被设定的对象」，不是调用者** ——
	 * GM 给玩家设阈值，所以这里传的是那个玩家的名字。
	 *
	 * @param id - 场景三级定位
	 * @param username - **被要求检定的玩家**
	 * @param threshold - 通过阈值
	 * @param token - GM 的登录 token
	 * @returns {Promise<ApiResult<unknown>>}
	 */
	async setRollThreshold(id: SceneId, username: string, threshold: number,
		token?: string): Promise<ApiResult<unknown>> //
	{
		const url = `${this.root}/api/sandtable/set-roll-threshold?${qs({ ...id, username, threshold, token })}`;
		return call<unknown>(url, r => r.data);
	}

	/**
	 * 查全场的检定结果
	 *
	 * 查的是**整个场景**的结果，所以不收 username ——
	 * 老代码两处都传了 username，是多余的（editor 那处甚至传了个
	 * 未定义的变量，一点就抛 `ReferenceError`）。
	 *
	 * @param id - 场景三级定位
	 * @returns {Promise<ApiResult<Array<RollResultRow>>>}
	 */
	async getRollResults(id: SceneId): Promise<ApiResult<Array<RollResultRow>>> {
		const url = `${this.root}/api/sandtable/get-roll-result?${qs({ ...id })}`;
		return call<Array<RollResultRow>>(url,
			r => (r.data as Array<RollResultRow>) ?? []);
	}

	// ── 认证 ──

	/**
	 * 登录
	 *
	 * 只绑 POST（后端有意的：密码走 GET 会留在 URL、浏览器历史和访问日志里）。
	 * 支持两种方式：用户名+密码，或凭已有 token 续期（续期会签发新 token
	 * 并作废旧的）。
	 *
	 * @param username - 用户名
	 * @param password - 密码。凭 token 续期时传空串
	 * @param token - 已有的 token，用于续期
	 * @returns {Promise<ApiResult<LoginRec>>}
	 */
	async login(username: string, password: string,
		token?: string): Promise<ApiResult<LoginRec>> //
	{
		const url = `${this.root}/api/auth/login?${qs({})}`;
		const body = qs({ username, password, token });
		return call<LoginRec>(url, r => {
			const x = r as unknown as LoginRec;
			return { username: x.username, token: x.token };
		}, body);
	}

	/**
	 * 注册
	 *
	 * 用户名已存在时 `ok: false`、`msg: 'username exists'`。
	 *
	 * @param username - 用户名
	 * @param password - 密码
	 * @returns {Promise<ApiResult<string>>} 注册成功的用户名
	 */
	async regist(username: string, password: string): Promise<ApiResult<string>> {
		const url = `${this.root}/api/auth/regist?${qs({})}`;
		const body = qs({ username, password });
		return call<string>(url,
			r => String((r as { username?: string }).username ?? ''), body);
	}

}
