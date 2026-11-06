import { getRedis } from '@/lib/redis';
import { verifyToken } from '@/service/authService';

/**
 * TRPG 沙盘的数据访问与权限校验。
 *
 * 数据仍存 Redis，只有 auth 迁到了 SQLite。
 *
 * key 前缀 `jadedungeon::sandtable::*` **格式不能动** —— 旧后端已停用，
 * 所以理由不再是「两代互通」，而是 **Redis 里已经存着用这些 key 的数据**。
 * 其中 `scence` 是 `scene` 的拼写错误，同样因为存量数据而保留：
 * 改名要连带写迁移脚本遍历改 key。
 */

const REDIS_KEY = 'trpg';

// ───────────────────────── key 生成 ─────────────────────────

export const genSceneKey = (campaignId: string, placeId: string, sceneId: string): string =>
	`jadedungeon::sandtable::scence::${campaignId}::${placeId}::${sceneId}`;

export const genOwnerKey = (campaignId: string): string =>
	`jadedungeon::sandtable::campaignOwner::${campaignId}`;

export const genMoveReqKey = (campaignId: string, placeId: string, sceneId: string): string =>
	`jadedungeon::sandtable::moveReq::${campaignId}::${placeId}::${sceneId}`;

// ───────────────────────── 场景数据 ─────────────────────────

/** 读场景 JSON 字符串。不存在时返回 undefined。 */
export const loadScene = async (campaignId: string, placeId: string, sceneId: string): Promise<string | null> =>
	getRedis(REDIS_KEY).get(genSceneKey(campaignId, placeId, sceneId));

export const saveScene = async (campaignId: string, placeId: string, sceneId: string, jsonStr: string): Promise<void> => {
	await getRedis(REDIS_KEY).set(genSceneKey(campaignId, placeId, sceneId), jsonStr);
};

// ───────────────────────── 战役归属 ─────────────────────────

export const getCampaignOwner = async (campaignId: string): Promise<string | null> =>
	getRedis(REDIS_KEY).get(genOwnerKey(campaignId));

export const setCampaignOwner = async (campaignId: string, owner: string): Promise<void> => {
	await getRedis(REDIS_KEY).set(genOwnerKey(campaignId), owner);
};

// ───────────────────────── 移动请求 ─────────────────────────

export interface IMoveRequest {
	userId: string;
	pos: { x: number; y: number };
}

/** 读某场景下所有棋子的移动请求。存的是 Redis Hash：username → `{"x":N,"y":N}` */
export const loadMoveRequests = async (campaignId: string, placeId: string, sceneId: string): Promise<IMoveRequest[]> => {
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
	campaignId: string, placeId: string, sceneId: string, username: string, x: number, y: number,
): Promise<void> => {
	await getRedis(REDIS_KEY).hset(
		genMoveReqKey(campaignId, placeId, sceneId), username, `{"x":${x},"y":${y}}`);
};

export const delMoveRequest = async (
	campaignId: string, placeId: string, sceneId: string, username: string,
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
 * 战役无主时，首个成功写入者成为 owner（沿用旧行为）。
 */
export const authorizeSceneWrite = async (campaignId: string, token?: string): Promise<IAuthzResult> => {
	const username = await verifyToken(token);
	if (!username) {
		return { ok: false, msg: 'not login' };
	}

	const owner = await getCampaignOwner(campaignId);
	if (!owner || owner.length < 1) {
		// 战役尚无归属，首个写入者占有它
		await setCampaignOwner(campaignId, username);
		console.log(`🎲 ${username} 创建了战役 ${campaignId}`);
		return { ok: true, username, msg: 'campaign created' };
	}

	if (owner !== username) {
		return { ok: false, msg: 'not owner' };
	}
	return { ok: true, username, msg: 'ok' };
};
