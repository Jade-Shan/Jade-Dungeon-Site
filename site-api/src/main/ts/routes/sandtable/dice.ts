import { ICustomHandler, IRequestContext, IRequestData, HTTP_GET, HTTP_POST } from '@/types';
import { corsHeadersFor, sendOnce } from '@/middleware/simpleHTTPServer';
import { verifyToken } from '@/service/authService';
import {
	getRollRecord, loadRollResults, rollDice, saveRollResult, setRollThreshold,
} from '@/service/diceService';

/**
 * TRPG 骰子检定接口。数据存 Redis（与旧后端共享），身份校验走 SQLite 里的 auth。
 *
 * token 校验策略与 `request-move` 一致——**可选**：前端
 * `sandtable-comm.js` 这三个调用都是 GET 且不带 token，强制校验会直接打断功能。
 * 带了就以 token 身份为准，没带则退回旧行为并打告警。
 * 要完全锁死（避免冒充他人掷骰、或非 GM 乱设阈值）需要先改前端。
 */

const sendJson = (context: IRequestContext, status: number, body: unknown) => {
	sendOnce(context.response, status, {
		'Content-Type': 'application/json;charset=utf-8',
		...corsHeadersFor(context.globalCfg, context.request),
	}, JSON.stringify(body));
};

const readSceneParams = (data: IRequestData) => {
	const campaignId = data.params.campaignId;
	const placeId = data.params.placeId;
	const sceneId = data.params.sceneId;
	const ok = Boolean(campaignId && placeId && sceneId
		&& campaignId.length > 0 && placeId.length > 0 && sceneId.length > 0);
	return { campaignId, placeId, sceneId, ok };
};

/**
 * 解析身份：带了 token 就以 token 为准，没带则沿用客户端声明的 username。
 * @returns 校验失败返回 undefined（调用方应回 'not login'）
 */
const resolveIdentity = async (claimed: string, token?: string): Promise<string | undefined> => {
	if (!token) {
		console.warn(`⚠️  dice 接口未带 token，暂信客户端声明的身份: ${claimed}`);
		return claimed;
	}
	const verified = await verifyToken(token);
	if (!verified) { return undefined; }
	return verified;
};

export const handler: ICustomHandler[] = [
	{
		urlPtn: '/api/sandtable/roll-dice',
		method: HTTP_GET | HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const { campaignId, placeId, sceneId, ok } = readSceneParams(data);
			const claimed = data.params.username;
			const rollCmd = data.params.rollCmd;
			if (!ok || !claimed || claimed.length === 0 || !rollCmd || rollCmd.length === 0) {
				sendJson(context, 200, { status: 'error', msg: 'miss params' });
				return;
			}

			const username = await resolveIdentity(claimed, data.params.token);
			if (!username) {
				sendJson(context, 200, { status: 'error', msg: 'not login' });
				return;
			}

			try {
				// 只有 GM 设过阈值、且本轮还没掷过（sum == 0）才允许掷
				const rec = await getRollRecord(campaignId!, placeId!, sceneId!, username);
				const threshold = (rec && rec.threshold > 0 && rec.sum === 0) ? rec.threshold : 0;
				if (threshold <= 0) {
					sendJson(context, 200, { status: 'error', msg: 'not your turn' });
					return;
				}

				const result = rollDice(rollCmd);
				if (!result) {
					// 旧实现对非法表达式会静默返回 status:error 且 msg 为空，
					// 这里给出明确原因，便于前端提示
					sendJson(context, 200, { status: 'error', msg: 'invalid rollCmd' });
					return;
				}

				await saveRollResult(campaignId!, placeId!, sceneId!, username,
					{ threshold, sum: result.sum, msg: result.msg });
				sendJson(context, 200, {
					status: 'success', threshold, msg: result.msg, sum: result.sum,
				});
			} catch (err) {
				console.error('❌ roll-dice 失败:', (err as Error).message);
				sendJson(context, 200, { status: 'error', msg: (err as Error).message });
			}
		}
	},
	{
		urlPtn: '/api/sandtable/set-roll-threshold',
		method: HTTP_GET | HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const { campaignId, placeId, sceneId, ok } = readSceneParams(data);
			const target = data.params.username;
			const thresholdRaw = data.params.threshold;
			// 阈值是给「哪个玩家」设的，所以这里的 username 是被设定的对象，
			// 不是调用者自己。旧实现同样如此，故不做身份替换。
			const threshold = Number(thresholdRaw);
			if (!ok || !target || target.length === 0
				|| !Number.isFinite(threshold) || threshold <= 0) {
				sendJson(context, 200, { status: 'error', msg: 'miss params' });
				return;
			}

			try {
				await setRollThreshold(campaignId!, placeId!, sceneId!, target, threshold);
				sendJson(context, 200, { status: 'success', data: threshold });
			} catch (err) {
				console.error('❌ set-roll-threshold 失败:', (err as Error).message);
				sendJson(context, 200, { status: 'error', msg: (err as Error).message });
			}
		}
	},
	{
		urlPtn: '/api/sandtable/get-roll-result',
		method: HTTP_GET | HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const { campaignId, placeId, sceneId, ok } = readSceneParams(data);
			if (!ok) {
				sendJson(context, 200, { status: 'error', msg: 'miss params' });
				return;
			}
			try {
				const list = await loadRollResults(campaignId!, placeId!, sceneId!);
				sendJson(context, 200, { status: 'success', msg: '', data: list });
			} catch (err) {
				console.error('❌ get-roll-result 失败:', (err as Error).message);
				sendJson(context, 200, { status: 'error', msg: (err as Error).message });
			}
		}
	},
];
