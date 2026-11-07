import Redis from 'ioredis';
import { initSqlite, closeSqlite, getSqlite } from '@/db';

/**
 * 把战役归属（campaignOwner）从 Redis 搬到 SQLite 的 sandtable_campaign 表。
 *
 * 用法（在项目根执行）：
 *
 * ```bash
 * # 演练：只统计不写入
 * npx tsx src/main/ts/scripts/migrateCampaignOwnerRedisToSqlite.ts
 * # 真正执行
 * npx tsx src/main/ts/scripts/migrateCampaignOwnerRedisToSqlite.ts --write
 * ```
 *
 * 特点：
 * - 默认演练，不加 `--write` 不会写任何数据
 * - 幂等：campaign_id 是主键，按它判重，重复执行不会产生副本
 * - 不删 Redis 原数据，便于回滚和比对
 *
 * Redis 里每个 key 只有 owner 一个字符串值，没有名字/描述/时间，
 * 所以 create_time / update_time 兜底为迁移时刻，detail_info 为空串。
 */

const WRITE = process.argv.includes('--write');

// 原 campaignOwner 的 key 前缀。campaignId（现在是 campaign_id）用前缀截断取出，
// 不能用 split('::').pop()——用户手填的文本可能含 '::'，split 会截断错误。
const OWNER_KEY_PREFIX = 'jadedungeon::sandtable::campaignOwner::';

interface IStat {
	scanned: number;
	inserted: number;
	skipped: number;
}

const migrate = async (redis: Redis): Promise<IStat> => {
	const st: IStat = { scanned: 0, inserted: 0, skipped: 0 };
	const db = getSqlite();
	const keys = (await redis.keys(`${OWNER_KEY_PREFIX}*`)).sort();

	for (const key of keys) {
		st.scanned++;
		const campaignId = key.slice(OWNER_KEY_PREFIX.length);
		const owner = await redis.get(key);
		if (!campaignId || !owner) {
			console.log(`  ⚠️ 跳过（campaign_id 或 owner 为空）: ${key}`);
			continue;
		}

		console.log(`  ${campaignId} -> ${owner}`);
		const exists = await db.queryOne<{ campaign_id: string }>(
			'SELECT campaign_id FROM sandtable_campaign WHERE campaign_id = ?', [campaignId]);
		if (exists) { st.skipped++; continue; }

		if (WRITE) {
			const now = Date.now();
			await db.run(
				`INSERT INTO sandtable_campaign (campaign_id, owner, detail_info, create_time, update_time)
				 VALUES (?, ?, '', ?, ?)`,
				[campaignId, owner, now, now]);
		}
		st.inserted++;
	}
	return st;
};

const report = (st: IStat) => {
	console.log(`\n── 战役归属 ──`);
	console.log(`  扫描 ${st.scanned} 个`);
	console.log(`  ${WRITE ? '已写入' : '将写入'} ${st.inserted} 个`);
	console.log(`  已存在跳过 ${st.skipped} 个`);
};

(async () => {
	console.log(WRITE
		? '=== 正式执行（会写入 SQLite）==='
		: '=== 演练模式（不写入任何数据，加 --write 才真正执行）===');

	const redisHost = process.env.REDIS_HOST || '127.0.0.1';
	const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
	const redis = new Redis({ host: redisHost, port: redisPort, lazyConnect: true });

	try {
		await redis.connect();
		console.log(`已连接 Redis ${redisHost}:${redisPort}`);
		await initSqlite(process.env.SQLITE_PATH || 'data/jade-dungeon.db',
			parseInt(process.env.SQLITE_READ_POOL_SIZE || '8', 10));

		const st = await migrate(redis);
		report(st);

		if (WRITE) {
			const db = getSqlite();
			const c = await db.queryOne<{ c: number }>('SELECT COUNT(*) c FROM sandtable_campaign');
			console.log(`\n=== SQLite 现状 ===`);
			console.log(`  sandtable_campaign ${c?.c} 行`);
		} else {
			console.log('\n  演练结束。确认无误后加 --write 正式执行。');
		}
		console.log('\n  Redis 原数据未改动。');
	} catch (err) {
		console.error(`\n❌ 失败: ${(err as Error).message}`);
		process.exitCode = 1;
	} finally {
		redis.disconnect();
		await closeSqlite();
	}
})();
