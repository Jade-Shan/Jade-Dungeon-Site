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

/**
 * 校验「进入场景」的定位是否有效，供 load-map 在取场景前兜底。
 *
 * campaign 的 curr_place_* / curr_scene_* 必须齐全（非 NULL），且与请求里的
 * placeId / sceneId 一致。前端已经把 6 值不全的记录在进入按钮上禁用，
 * 这里拦住绕过前端、直接拼 URL 发请求的情况。
 *
 * @returns null 表示通过；否则是可直接返回给客户端的错误信息
 */
export const assertSceneReachable = async (
	campaignId: number, placeId: number, sceneId: number,
): Promise<string | null> => {
	const row = await getSqlite().queryOne<{
		currPlaceId: number | null;
		currPlaceName: string | null;
		currSceneId: number | null;
		currSceneName: string | null;
	}>(
		`SELECT curr_place_id AS currPlaceId, curr_place_name AS currPlaceName,
		        curr_scene_id AS currSceneId, curr_scene_name AS currSceneName
		   FROM sandtable_campaign WHERE id = ?`,
		[campaignId]);
	if (!row) {
		return 'not found';
	}
	if (!row.currPlaceId || !row.currPlaceName || !row.currSceneId || !row.currSceneName) {
		return 'scene incomplete';
	}
	if (row.currPlaceId !== placeId || row.currSceneId !== sceneId) {
		return 'scene mismatch';
	}
	return null;
};

/** 场景列表里的一行：一个战役 + 它当前的 place / scene（3 id + 3 名）+ owner */
export interface ISceneListItem {
	campaignId: number;
	campaignName: string;
	owner: string;
	currPlaceId: number;
	currPlaceName: string;
	currSceneId: number;
	currSceneName: string;
}

/**
 * 列出所有战役及其当前的 place / scene，供选场景页的表格展示。
 *
 * 直接查 `sandtable_campaign` —— 它冗余存了 curr_place_* / curr_scene_* 字段，
 * 记录该战役当前所在的地点与场景，不用再 JOIN place / scene 表。
 * 列表一行一个战役，展示「战役名 / 当前地点名 / 当前场景名 / owner」。
 *
 * 读操作，不校验身份 —— 和 `load-map` / `map-owner` 一致，选场景页需要它
 * 在登录前就把可进入的场景列出来。
 */
export const listScenes = async (): Promise<ISceneListItem[]> => {
	return getSqlite().query<ISceneListItem>(`
		SELECT
			c.id              AS campaignId,
			c.campaign_name   AS campaignName,
			c.owner           AS owner,
			c.curr_place_id   AS currPlaceId,
			c.curr_place_name AS currPlaceName,
			c.curr_scene_id   AS currSceneId,
			c.curr_scene_name AS currSceneName
		FROM sandtable_campaign c
		ORDER BY c.id
	`);
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

// ───────────────────────── 地点 / 场景 CRUD ─────────────────────────

/** 地点记录。响应字段用 camelCase（表字段 snake_case，映射集中在此） */
export interface IPlaceRecord {
	id: number;
	campaignId: number;
	placeName: string;
	detailInfo: string;
}

/** 场景记录 */
export interface ISceneRecord {
	id: number;
	campaignId: number;
	placeId: number;
	sceneName: string;
	detailInfo: string;
}

/** 列出某战役的地点。只读，不校验身份（与 list-scene 一致） */
export const listPlaces = async (campaignId: number): Promise<IPlaceRecord[]> => {
	const rows = await getSqlite().query<{
		id: number; campaign_id: number; place_name: string; detail_info: string;
	}>(`SELECT id, campaign_id, place_name, detail_info FROM sandtable_place
	    WHERE campaign_id = ? ORDER BY id`, [campaignId]);
	return rows.map(r => ({
		id: r.id, campaignId: r.campaign_id, placeName: r.place_name, detailInfo: r.detail_info,
	}));
};

/** 列出某战役的场景。只读 */
export const listCampaignScenes = async (campaignId: number): Promise<ISceneRecord[]> => {
	const rows = await getSqlite().query<{
		id: number; campaign_id: number; place_id: number; scene_name: string; detail_info: string;
	}>(`SELECT id, campaign_id, place_id, scene_name, detail_info FROM sandtable_scene
	    WHERE campaign_id = ? ORDER BY id`, [campaignId]);
	return rows.map(r => ({
		id: r.id, campaignId: r.campaign_id, placeId: r.place_id,
		sceneName: r.scene_name, detailInfo: r.detail_info,
	}));
};

/**
 * 创建或更新地点（upsert）。调用方已校验 owner。
 *
 * id 为正整数时 UPDATE（带 `AND campaign_id` 防止跨战役改别人的记录），
 * 否则 INSERT 并返回新 id。
 */
export const savePlace = async (
	campaignId: number, id: number | undefined, placeName: string, detailInfo: string,
): Promise<number> => {
	const now = Date.now();
	if (id !== undefined && id > 0) {
		await getSqlite().run(
			`UPDATE sandtable_place SET place_name = ?, detail_info = ?, update_time = ?
			  WHERE id = ? AND campaign_id = ?`,
			[placeName, detailInfo, now, id, campaignId]);
		return id;
	}
	const res = await getSqlite().run(
		`INSERT INTO sandtable_place (campaign_id, place_name, detail_info, create_time, update_time)
		 VALUES (?, ?, ?, ?, ?)`,
		[campaignId, placeName, detailInfo, now, now]);
	return Number(res.lastInsertRowid);
};

/**
 * 删除地点。前置检查有没有场景引用它 —— 外键（无 ON DELETE）会让直接删抛约束错误。
 */
export const deletePlace = async (id: number): Promise<{ ok: boolean; msg: string }> => {
	const ref = await getSqlite().queryOne<{ c: number }>(
		'SELECT COUNT(*) AS c FROM sandtable_scene WHERE place_id = ?', [id]);
	if (ref && ref.c > 0) {
		return { ok: false, msg: '该地点下还有场景，请先删除场景' };
	}
	await getSqlite().run('DELETE FROM sandtable_place WHERE id = ?', [id]);
	return { ok: true, msg: '' };
};

/** 创建或更新场景记录（upsert）。命名加 `Record` 是为了和上面的 Redis 场景 JSON `saveScene` 区分。 */
export const saveSceneRecord = async (
	campaignId: number, id: number | undefined, placeId: number, sceneName: string, detailInfo: string,
): Promise<number> => {
	const now = Date.now();
	if (id !== undefined && id > 0) {
		await getSqlite().run(
			`UPDATE sandtable_scene SET place_id = ?, scene_name = ?, detail_info = ?, update_time = ?
			  WHERE id = ? AND campaign_id = ?`,
			[placeId, sceneName, detailInfo, now, id, campaignId]);
		return id;
	}
	const res = await getSqlite().run(
		`INSERT INTO sandtable_scene (campaign_id, place_id, scene_name, detail_info, create_time, update_time)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		[campaignId, placeId, sceneName, detailInfo, now, now]);
	return Number(res.lastInsertRowid);
};

/** 删除场景 */
export const deleteScene = async (id: number): Promise<void> => {
	await getSqlite().run('DELETE FROM sandtable_scene WHERE id = ?', [id]);
};
