import { getRedis } from '@/lib/redis';
import { getSqlite } from '@/db';
import { verifyToken } from '@/service/authService';

/**
 * TRPG 沙盘的数据访问与权限校验。
 *
 * 场景数据 / 移动请求 / 骰子结果仍存 Redis；战役归属（owner）存 SQLite 的
 * `sandtable_campaign` 表。三级定位（campaign / place / scene）已从「用户手填
 * 的文本」改为「自增数字 id」，名字（*_name）降级为显示名 —— Redis key 的
 * 三段全是数字 id。
 *
 * key 前缀 `jadedungeon:sandtable:*`，层级之间用单冒号分隔。
 * 其中 `scence` 是 `scene` 的拼写错误，沿用旧实现保留原样。
 */

const REDIS_KEY = 'trpg';

// ───────────────────────── key 生成 ─────────────────────────

export const genSceneKey = (campaignId: number, placeId: number, sceneId: number): string =>
	`jadedungeon:sandtable:scence:${campaignId}:${placeId}:${sceneId}`;

export const genMoveReqKey = (campaignId: number, placeId: number, sceneId: number): string =>
	`jadedungeon:sandtable:moveReq:${campaignId}:${placeId}:${sceneId}`;

// ───────────────────────── 场景数据 ─────────────────────────

/** 读场景 JSON 字符串。不存在时返回 undefined。 */
export const loadScene = async (campaignId: number, placeId: number, sceneId: number): Promise<string | null> =>
	getRedis(REDIS_KEY).get(genSceneKey(campaignId, placeId, sceneId));

export const saveScene = async (campaignId: number, placeId: number, sceneId: number, jsonStr: string): Promise<void> => {
	await getRedis(REDIS_KEY).set(genSceneKey(campaignId, placeId, sceneId), jsonStr);
};

// ───────────────────────── 战役归属 ─────────────────────────

/**
 * 读战役归属。数据在 SQLite 的 `sandtable_campaign` 表，按自增数字 `id` 查。
 */
export const getCampaignOwner = async (campaignId: number): Promise<string | null> => {
	const row = await getSqlite().queryOne<{ owner: string }>(
		'SELECT owner FROM sandtable_campaign WHERE id = ?', [campaignId]);
	return row?.owner ?? null;
};

// ───────────────────────── 移动请求 ─────────────────────────

export interface IMoveRequest {
	userId: string;
	pos: { x: number; y: number };
}

/** 读某场景下所有棋子的移动请求。存的是 Redis Hash：username → `{"x":N,"y":N}` */
export const loadMoveRequests = async (campaignId: number, placeId: number, sceneId: number): Promise<IMoveRequest[]> => {
	const raw = await getRedis(REDIS_KEY).hgetall(genMoveReqKey(campaignId, placeId, sceneId));
	const list: IMoveRequest[] = [];
	for (const [userId, value] of Object.entries(raw)) {
		try {
			list.push({ userId, pos: JSON.parse(value) });
		} catch {
			// 单条坏数据不影响整体，跳过。旧实现也是这个策略。
		}
	}
	return list;
};

export const setMoveRequest = async (
	campaignId: number, placeId: number, sceneId: number, username: string, x: number, y: number,
): Promise<void> => {
	await getRedis(REDIS_KEY).hset(
		genMoveReqKey(campaignId, placeId, sceneId), username, `{"x":${x},"y":${y}}`);
};

export const delMoveRequest = async (
	campaignId: number, placeId: number, sceneId: number, username: string,
): Promise<void> => {
	await getRedis(REDIS_KEY).hdel(genMoveReqKey(campaignId, placeId, sceneId), username);
};

// ───────────────────────── 权限 ─────────────────────────

export interface IAuthzResult {
	ok: boolean;
	/** 校验通过时，从 token 解出的可信用户名 */
	username?: string;
	msg: string;
}

/**
 * 校验「能否写入该战役的场景」。
 *
 * 与旧后端的关键差异：**身份来自 token，不再信客户端传的 username**。
 * 旧实现 `if (owner == json.username)` 拿客户端自己声明的用户名去比，
 * 改个字段就能冒充他人覆盖地图。
 *
 * 战役主键改成自增 id 之后，这里**只做纯校验、不再建战役** ——
 * 「创建战役 / place / scene」是开发人员的线下动作（手动 INSERT 或临时脚本）。
 * 按 id 查不到战役时回 `not found`（过渡方案下数据必存在，正常不该发生）。
 */
export const authorizeSceneWrite = async (campaignId: number, token?: string): Promise<IAuthzResult> => {
	const username = await verifyToken(token);
	if (!username) {
		return { ok: false, msg: 'not login' };
	}

	const owner = await getCampaignOwner(campaignId);
	if (owner === null) {
		return { ok: false, msg: 'not found' };
	}
	if (owner !== username) {
		return { ok: false, msg: 'not owner' };
	}
	return { ok: true, username, msg: 'ok' };
};
