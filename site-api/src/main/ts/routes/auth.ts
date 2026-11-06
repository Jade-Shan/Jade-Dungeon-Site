import { ICustomHandler, IRequestContext, IRequestData, HTTP_POST } from '@/types';
import { loginBypass, loginByPassword, loginByToken, registUser } from '@/service/authService';
import { corsHeadersFor, sendOnce } from '@/middleware/simpleHTTPServer';

/**
 * 认证接口。数据存 SQLite（不再是 Redis），详见 docs/plan-auth-sqlite.md。
 *
 * **只绑 POST**：旧后端是 GET+POST 双绑，但密码走 GET 会留在 URL、
 * 浏览器历史和服务器访问日志里。迁移时收紧为仅 POST。
 * 前端 sandtable-index.js 用的是 jQuery `$.ajax({data: {...}})`，
 * 需确认其 `type` 为 POST，否则会变成 404。
 */

/**
 * 统一写出 JSON 响应。响应字段名与旧后端保持一致，否则前端取不到值。
 *
 * CORS 头按 `CROS_SITE` 白名单动态生成，不能硬编码 `'*'`——
 * `writeHead` 传入的同名头会覆盖 cors 中间件设好的值，那样白名单就被绕过了。
 */
const sendJson = (context: IRequestContext, status: number, body: unknown) => {
	sendOnce(context.response, status, {
		'Content-Type': 'application/json;charset=utf-8',
		...corsHeadersFor(context.globalCfg, context.request),
	}, JSON.stringify(body));
};

export const handler: ICustomHandler[] = [
	{
		urlPtn: '/api/auth/regist',
		method: HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const username = data.params.username;
			const password = data.params.password;

			if (!username || !password || username.length === 0 || password.length === 0) {
				sendJson(context, 200, { status: 'err', msg: 'miss username or password' });
				return;
			}

			try {
				const result = await registUser(username, password);
				sendJson(context, 200, result.ok
					? { status: 'success', msg: result.msg, username }
					: { status: 'err', msg: result.msg });
			} catch (err) {
				console.error('❌ 注册失败:', (err as Error).message);
				sendJson(context, 500, { status: 'err', msg: 'internal error' });
			}
		}
	},
	{
		urlPtn: '/api/auth/login',
		method: HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const username = data.params.username;
			const password = data.params.password;
			const token = data.params.token;

			try {
				// 与旧后端一致的优先级：先试密码登录，没有密码再试 token 续期
				let result;
				// ⚠️ 免验证分支（临时，见 config.ts 的 AUTH_BYPASS）。
				// 只要给了用户名就直接签发 token，密码为空也算通过。
				// 用户名仍然必填 —— token 格式是 `username|uuid|expire`，
				// 空用户名签出来的 token 过不了 parseLoginToken 的校验，
				// 等于「登录成功但立刻又是未登录」，比直接报错更难查。
				if (context.globalCfg.auth?.bypass && username && username.length > 0) {
					result = await loginBypass(username);
				} else if (username && password && username.length > 0 && password.length > 0) {
					result = await loginByPassword(username, password);
				} else if (token) {
					result = await loginByToken(token);
				} else {
					sendJson(context, 200, { status: 'err', msg: 'miss username or password' });
					return;
				}

				sendJson(context, 200, result.ok
					? { status: 'success', msg: result.msg, username: result.username, token: result.token }
					: { status: 'err', msg: result.msg });
			} catch (err) {
				console.error('❌ 登录失败:', (err as Error).message);
				sendJson(context, 500, { status: 'err', msg: 'internal error' });
			}
		}
	},
];
