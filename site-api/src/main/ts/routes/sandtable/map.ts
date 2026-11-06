import { ICustomHandler, IRequestContext, IRequestData, HTTP_GET, HTTP_POST } from '@/types';
import { corsHeadersFor, sendOnce } from '@/middleware/simpleHTTPServer';
import { verifyToken } from '@/service/authService';
import {
	authorizeSceneWrite, delMoveRequest, getCampaignOwner,
	loadMoveRequests, loadScene, saveScene, setMoveRequest,
} from '@/service/sandtableService';

/**
 * TRPG 沙盘的地图接口。数据存 Redis（与旧后端共享），身份校验走 SQLite 里的 auth。
 *
 * 与旧后端的行为差异：
 * - `save-map` **强制校验 token**，身份从 token 取而非信客户端传的 `json.username`。
 *   前端 `sandtable-editor.js` 早已把 `loginToken` 塞进 `jsonStr`，只是旧后端从没读过，
 *   所以这个改动不需要动前端。
 * - `request-move` 的 token 校验是**可选**的：前端那边是 GET 且不带 token，
 *   强制校验会直接打断功能。所以带了就验、没带就退回旧行为并打告警。
 *   要完全锁死需要前端在调用时附上 token。
 *
 * 其余接口（load-map / map-owner / load-move-request）是读操作，与旧后端一样不校验。
 */

const sendJson = (context: IRequestContext, status: number, body: unknown) => {
	sendOnce(context.response, status, {
		'Content-Type': 'application/json;charset=utf-8',
		...corsHeadersFor(context.globalCfg, context.request),
	}, JSON.stringify(body));
};

/** 三级场景定位参数的校验，几个接口共用 */
const readSceneParams = (data: IRequestData) => {
	const campaignId = data.params.campaignId;
	const placeId = data.params.placeId;
	const sceneId = data.params.sceneId;
	const ok = Boolean(campaignId && placeId && sceneId
		&& campaignId.length > 0 && placeId.length > 0 && sceneId.length > 0);
	return { campaignId, placeId, sceneId, ok };
};

export const handler: ICustomHandler[] = [
	{
		urlPtn: '/api/sandtable/load-move-request',
		method: HTTP_GET | HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const { campaignId, placeId, sceneId, ok } = readSceneParams(data);
			if (!ok) {
				sendJson(context, 200, { status: 'error', msg: 'miss params' });
				return;
			}
			try {
				const list = await loadMoveRequests(campaignId!, placeId!, sceneId!);
				sendJson(context, 200, { status: 'success', msg: '', data: list });
			} catch (err) {
				console.error('❌ load-move-request 失败:', (err as Error).message);
				sendJson(context, 200, { status: 'error', msg: (err as Error).message });
			}
		}
	},
	{
		urlPtn: '/api/sandtable/request-move',
		method: HTTP_GET | HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const { campaignId, placeId, sceneId, ok } = readSceneParams(data);
			const claimed = data.params.username;
			if (!ok || !claimed || claimed.length === 0) {
				sendJson(context, 200, { status: 'err', msg: 'miss params' });
				return;
			}

			// token 可选：带了就以 token 的身份为准，避免冒充他人移动棋子
			let username = claimed;
			const token = data.params.token;
			if (token) {
				const verified = await verifyToken(token);
				if (!verified) {
					sendJson(context, 200, { status: 'err', msg: 'not login' });
					return;
				}
				username = verified;
			} else {
				console.warn(`⚠️  request-move 未带 token，暂信客户端声明的身份: ${claimed}`);
			}

			try {
				// x/y 来自 query，是字符串。旧实现用 `x > -1` 做字符串比较，
				// 这里显式转成数字再判断，语义更清楚。
				const x = Number(data.params.x);
				const y = Number(data.params.y);
				if (Number.isFinite(x) && Number.isFinite(y) && x > -1 && y > -1) {
					await setMoveRequest(campaignId!, placeId!, sceneId!, username, x, y);
				} else {
					// 坐标为负或缺失表示撤销移动请求
					await delMoveRequest(campaignId!, placeId!, sceneId!, username);
				}
				sendJson(context, 200, { status: 'success' });
			} catch (err) {
				console.error('❌ request-move 失败:', (err as Error).message);
				sendJson(context, 200, { status: 'err', msg: (err as Error).message });
			}
		}
	},
	{
		urlPtn: '/api/sandtable/map-owner',
		method: HTTP_GET | HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const campaignId = data.params.campaignId;
			if (!campaignId) {
				sendJson(context, 200, { status: 'error', msg: 'miss params' });
				return;
			}
			try {
				const owner = await getCampaignOwner(campaignId);
				sendJson(context, 200, { status: 'success', msg: 'query success', owner: owner });
			} catch (err) {
				console.error('❌ map-owner 失败:', (err as Error).message);
				sendJson(context, 200, { status: 'error', msg: (err as Error).message });
			}
		}
	},
	{
		urlPtn: '/api/sandtable/load-map',
		method: HTTP_GET | HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const { campaignId, placeId, sceneId, ok } = readSceneParams(data);
			if (!ok) {
				sendJson(context, 200, { status: 'error', msg: 'miss params' });
				return;
			}
			try {
				const raw = await loadScene(campaignId!, placeId!, sceneId!);
				if (!raw) {
					sendJson(context, 200, { status: 'error', msg: 'empty' });
					return;
				}
				// 存的是整个场景 JSON，原样解析后加上 status 字段返回（与旧后端一致）
				const scene = JSON.parse(raw);
				scene.status = 'success';
				sendJson(context, 200, scene);
			} catch {
				// JSON 解析失败等同于没有数据，沿用旧后端的 'empty'
				sendJson(context, 200, { status: 'error', msg: 'empty' });
			}
		}
	},
	{
		urlPtn: '/api/sandtable/save-map',
		method: HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const { campaignId, placeId, sceneId, ok } = readSceneParams(data);
			const jsonStr = data.params.jsonStr;
			if (!ok || !jsonStr) {
				sendJson(context, 200, { status: 'err', msg: 'miss params' });
				return;
			}

			let payload: { loginToken?: string; username?: string };
			try {
				payload = JSON.parse(jsonStr);
			} catch {
				sendJson(context, 200, { status: 'err', msg: 'invalid jsonStr' });
				return;
			}

			try {
				// 身份以 token 为准。旧实现信 payload.username，可被任意伪造。
				const authz = await authorizeSceneWrite(campaignId!, payload.loginToken);
				if (!authz.ok) {
					sendJson(context, 200, { status: 'err', msg: authz.msg });
					return;
				}
				await saveScene(campaignId!, placeId!, sceneId!, jsonStr);
				sendJson(context, 200, { status: 'success', msg: 'save success' });
			} catch (err) {
				console.error('❌ save-map 失败:', (err as Error).message);
				sendJson(context, 200, { status: 'err', msg: 'save failed' });
			}
		}
	},
];
