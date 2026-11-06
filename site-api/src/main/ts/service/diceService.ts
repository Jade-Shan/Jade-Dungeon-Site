import { getRedis } from '@/lib/redis';

/**
 * TRPG 骰子检定。数据存 Redis（与旧后端共享同一批 key）。
 *
 * 检定流程（三个接口配合）：
 * 1. GM 调 `set-roll-threshold` 为某玩家设阈值 → 存 `{threshold:N, sum:0, msg:""}`
 * 2. 玩家调 `roll-dice` 掷骰 → 仅当该玩家 `threshold > 0 且 sum == 0` 时允许，
 *    掷完写回 `sum`，于是不能重复掷，直到 GM 再次设阈值
 * 3. 任何人调 `get-roll-result` 查看全场结果
 */

const REDIS_KEY = 'trpg';

export const genRollResultKey = (campaignId: string, placeId: string, sceneId: string): string =>
	`jadedungeon::sandtable::rollDiceResult::${campaignId}::${placeId}::${sceneId}`;

/** 单个骰子项：`3d6` / `d20` / 常数 */
interface IDiceTerm {
	/** 正负号，`-1` 表示该项要减去 */
	sign: 1 | -1;
	/** 骰子个数；常数项为 0 */
	count: number;
	/** 骰子面数；常数项为 0 */
	faces: number;
	/** 常数项的值 */
	constant: number;
	/** 原始写法，用于回显 */
	raw: string;
}

export interface IRollResult {
	sum: number;
	msg: string;
	threshold?: number;
}

/**
 * 解析骰子表达式，如 `3d6+3+d4-2`。
 *
 * **与旧实现的两处行为差异**（都是修 bug，不是加功能）：
 *
 * 1. 旧实现对 `1d6` 返回 **NaN**。它在 `/^1?d\d+$/` 分支里做 `s.substring(1)`，
 *    对 `"1d6"` 得到的是 `"d6"` 而不是 `"6"`，`Math.random() * "d6"` 即 NaN。
 *    实测 `1d6` / `1d20` 稳定返回 NaN，而这是最常用的写法之一。
 *
 * 2. 旧实现**静默把减号当加号**。它用 `rollCmd.match(/(\d*d)?\d+/gi)` 扫描，
 *    运算符根本没进匹配结果，所以 `3d6-2` 实际算的是 `3d6+2`。
 *    这是算出错误结果，不是「不支持减法」。
 *
 * 不支持的运算符（`*`、`/` 等）现在会被明确拒绝，而不是像旧实现那样
 * 把 `2d6*2` 悄悄算成 `2d6+2`。
 *
 * @returns 解析失败返回 undefined，由调用方回报 'invalid rollCmd'
 */
export const parseRollCmd = (rollCmd: string): IDiceTerm[] | undefined => {
	const cmd = rollCmd.replace(/\s+/g, '');
	if (cmd.length === 0) { return undefined; }

	// 整体形状必须是：项(±项)*，项为 `NdM` / `dM` / 常数
	if (!/^[+-]?(\d*[dD]\d+|\d+)([+-](\d*[dD]\d+|\d+))*$/.test(cmd)) {
		return undefined;
	}

	const terms: IDiceTerm[] = [];
	// 按符号切分，首项允许没有符号
	const re = /([+-]?)(\d*[dD]\d+|\d+)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(cmd)) !== null) {
		const sign: 1 | -1 = m[1] === '-' ? -1 : 1;
		const body = m[2];

		if (/^\d+$/.test(body)) {
			terms.push({ sign, count: 0, faces: 0, constant: parseInt(body, 10), raw: body });
			continue;
		}

		const parts = body.split(/[dD]/);
		// 省略个数时默认 1 颗，这是 `d20` 这种写法的含义
		const count = parts[0].length === 0 ? 1 : parseInt(parts[0], 10);
		const faces = parseInt(parts[1], 10);
		// 0 颗或 0 面都没有意义。旧实现对 `d0` 会返回 1，属于未校验边界。
		if (count < 1 || faces < 1) { return undefined; }
		// 挡一下离谱的输入，避免循环太久
		if (count > 1000) { return undefined; }
		terms.push({ sign, count, faces, constant: 0, raw: body });
	}

	return terms.length > 0 ? terms : undefined;
};

/**
 * 执行掷骰。
 *
 * 输出的 `msg` 沿用旧实现的格式 `总和=项1+项2(写法)+...`，
 * 前端直接显示这个字符串，改格式会影响界面。
 */
export const rollDice = (rollCmd: string): IRollResult | undefined => {
	const terms = parseRollCmd(rollCmd);
	if (!terms) { return undefined; }

	let sum = 0;
	const pieces: string[] = [];
	for (const t of terms) {
		let value: number;
		if (t.count === 0) {
			value = t.constant;
			pieces.push(`${t.sign < 0 ? '-' : '+'}${t.constant}`);
		} else {
			let n = 0;
			for (let k = 0; k < t.count; k++) {
				n += Math.floor(Math.random() * t.faces) + 1;
			}
			value = n;
			pieces.push(`${t.sign < 0 ? '-' : '+'}${n}(${t.raw})`);
		}
		sum += t.sign * value;
	}

	// 首项去掉多余的前导 '+'，与旧实现的 substring(1) 效果一致
	let body = pieces.join('');
	if (body.startsWith('+')) { body = body.substring(1); }
	return { sum, msg: `${sum}=${body}` };
};

// ───────────────────────── Redis 读写 ─────────────────────────

/** Redis Hash 里每个玩家的检定状态 */
export interface IRollRecord {
	threshold: number;
	sum: number;
	msg: string;
}

export interface IRollResultRow extends IRollRecord {
	userId: string;
}

/** 设定某玩家的检定阈值，并把 sum 清零（表示「轮到他掷」） */
export const setRollThreshold = async (
	campaignId: string, placeId: string, sceneId: string, username: string, threshold: number,
): Promise<void> => {
	// 值的 JSON 形状不能随便改 —— 旧后端已停用，但 Redis 里的存量记录是这个形状，
	// 本服务自己的读取路径（getRollRecord / getAllRollResults）也按它解析
	await getRedis(REDIS_KEY).hset(
		genRollResultKey(campaignId, placeId, sceneId), username,
		JSON.stringify({ threshold, sum: 0, msg: '' }));
};

/** 读某玩家当前的检定状态 */
export const getRollRecord = async (
	campaignId: string, placeId: string, sceneId: string, username: string,
): Promise<IRollRecord | undefined> => {
	const raw = await getRedis(REDIS_KEY).hget(genRollResultKey(campaignId, placeId, sceneId), username);
	if (!raw) { return undefined; }
	try {
		return JSON.parse(raw) as IRollRecord;
	} catch {
		return undefined;
	}
};

export const saveRollResult = async (
	campaignId: string, placeId: string, sceneId: string, username: string, rec: IRollRecord,
): Promise<void> => {
	await getRedis(REDIS_KEY).hset(
		genRollResultKey(campaignId, placeId, sceneId), username, JSON.stringify(rec));
};

/** 读全场检定结果。单条坏数据跳过，不影响整体（沿用旧实现策略）。 */
export const loadRollResults = async (
	campaignId: string, placeId: string, sceneId: string,
): Promise<IRollResultRow[]> => {
	const raw = await getRedis(REDIS_KEY).hgetall(genRollResultKey(campaignId, placeId, sceneId));
	const list: IRollResultRow[] = [];
	for (const [userId, value] of Object.entries(raw)) {
		try {
			const rec = JSON.parse(value) as IRollRecord;
			list.push({ userId, threshold: rec.threshold, sum: rec.sum, msg: rec.msg });
		} catch {
			// 跳过坏数据
		}
	}
	return list;
};
