import { ICustomHandler, IRequestContext, IRequestData, HTTP_GET, HTTP_POST } from '@/types';
import { corsHeadersFor, sendOnce } from '@/middleware/simpleHTTPServer';
import {
	authorizeSceneWrite, deletePlace, deleteScene, listCampaignScenes, listPlaces,
	savePlace, saveSceneRecord,
} from '@/service/sandtableService';

/**
 * 战役的「地点 / 场景」增删改查接口。
 *
 * 数据在 SQLite 的 `sandtable_place` / `sandtable_scene` 表（建表见 db/index.ts）。
 * 与 `save-map` 一致：**写操作校验 owner** —— 身份从 token 取（`authorizeSceneWrite`），
 * 不信客户端传的用户名。列表是只读，不校验身份（和 `list-scene` 一致，选场景页
 * 登录前就要用它）。
 *
 * `save-*` 是 upsert：带 id 就更新、不带（或为 0）就新建，前端「提交」一个动作
 * 同时覆盖新建与编辑。`token` 走 POST body（express.urlencoded 会把 body 并入
 * data.params），不放进 URL。
 */

const sendJson = (context: IRequestContext, status: number, body: unknown) => {
	sendOnce(context.response, status, {
		'Content-Type': 'application/json;charset=utf-8',
		...corsHeadersFor(context.globalCfg, context.request),
	}, JSON.stringify(body));
};

/** 解析正整数参数。不是正整数时返回 null。 */
const positiveInt = (raw: string | undefined): number | null => {
	const n = Number(raw);
	return Number.isInteger(n) && n > 0 ? n : null;
};

/** id 允许缺省（新建）或 0（新建），解析成 undefined 表示「新建」 */
const optionalId = (raw: string | undefined): number | undefined => {
	if (raw === undefined || raw === '') { return undefined; }
	const n = Number(raw);
	return Number.isInteger(n) && n >= 0 ? n : undefined;
};

export const handler: ICustomHandler[] = [
	{
		urlPtn: '/api/sandtable/list-place',
		method: HTTP_GET | HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const campaignId = positiveInt(data.params.campaignId);
			if (!campaignId) {
				sendJson(context, 200, { status: 'error', msg: 'miss params' });
				return;
			}
			try {
				const list = await listPlaces(campaignId);
				sendJson(context, 200, { status: 'success', msg: '', data: list });
			} catch (err) {
				console.error('❌ list-place 失败:', (err as Error).message);
				sendJson(context, 200, { status: 'error', msg: (err as Error).message });
			}
		}
	},
	{
		urlPtn: '/api/sandtable/save-place',
		method: HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const campaignId = positiveInt(data.params.campaignId);
			const placeName = (data.params.placeName ?? '').trim();
			if (!campaignId || placeName.length === 0) {
				sendJson(context, 200, { status: 'err', msg: 'miss params' });
				return;
			}
			try {
				const authz = await authorizeSceneWrite(campaignId, data.params.token);
				if (!authz.ok) {
					sendJson(context, 200, { status: 'err', msg: authz.msg });
					return;
				}
				const id = await savePlace(
					campaignId, optionalId(data.params.id), placeName, data.params.detailInfo ?? '');
				sendJson(context, 200, { status: 'success', msg: 'save success', id });
			} catch (err) {
				console.error('❌ save-place 失败:', (err as Error).message);
				sendJson(context, 200, { status: 'err', msg: 'save failed' });
			}
		}
	},
	{
		urlPtn: '/api/sandtable/delete-place',
		method: HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const campaignId = positiveInt(data.params.campaignId);
			const id = positiveInt(data.params.id);
			if (!campaignId || !id) {
				sendJson(context, 200, { status: 'err', msg: 'miss params' });
				return;
			}
			try {
				const authz = await authorizeSceneWrite(campaignId, data.params.token);
				if (!authz.ok) {
					sendJson(context, 200, { status: 'err', msg: authz.msg });
					return;
				}
				const r = await deletePlace(id);
				if (!r.ok) {
					sendJson(context, 200, { status: 'err', msg: r.msg });
					return;
				}
				sendJson(context, 200, { status: 'success', msg: 'delete success' });
			} catch (err) {
				console.error('❌ delete-place 失败:', (err as Error).message);
				sendJson(context, 200, { status: 'err', msg: 'delete failed' });
			}
		}
	},
	{
		urlPtn: '/api/sandtable/list-campaign-scene',
		method: HTTP_GET | HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const campaignId = positiveInt(data.params.campaignId);
			if (!campaignId) {
				sendJson(context, 200, { status: 'error', msg: 'miss params' });
				return;
			}
			try {
				const list = await listCampaignScenes(campaignId);
				sendJson(context, 200, { status: 'success', msg: '', data: list });
			} catch (err) {
				console.error('❌ list-campaign-scene 失败:', (err as Error).message);
				sendJson(context, 200, { status: 'error', msg: (err as Error).message });
			}
		}
	},
	{
		urlPtn: '/api/sandtable/save-scene',
		method: HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const campaignId = positiveInt(data.params.campaignId);
			const placeId = positiveInt(data.params.placeId);
			const sceneName = (data.params.sceneName ?? '').trim();
			if (!campaignId || !placeId || sceneName.length === 0) {
				sendJson(context, 200, { status: 'err', msg: 'miss params' });
				return;
			}
			try {
				const authz = await authorizeSceneWrite(campaignId, data.params.token);
				if (!authz.ok) {
					sendJson(context, 200, { status: 'err', msg: authz.msg });
					return;
				}
				const id = await saveSceneRecord(
					campaignId, optionalId(data.params.id), placeId, sceneName, data.params.detailInfo ?? '');
				sendJson(context, 200, { status: 'success', msg: 'save success', id });
			} catch (err) {
				console.error('❌ save-scene 失败:', (err as Error).message);
				sendJson(context, 200, { status: 'err', msg: 'save failed' });
			}
		}
	},
	{
		urlPtn: '/api/sandtable/delete-scene',
		method: HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const campaignId = positiveInt(data.params.campaignId);
			const id = positiveInt(data.params.id);
			if (!campaignId || !id) {
				sendJson(context, 200, { status: 'err', msg: 'miss params' });
				return;
			}
			try {
				const authz = await authorizeSceneWrite(campaignId, data.params.token);
				if (!authz.ok) {
					sendJson(context, 200, { status: 'err', msg: authz.msg });
					return;
				}
				await deleteScene(id);
				sendJson(context, 200, { status: 'success', msg: 'delete success' });
			} catch (err) {
				console.error('❌ delete-scene 失败:', (err as Error).message);
				sendJson(context, 200, { status: 'err', msg: 'delete failed' });
			}
		}
	},
];
