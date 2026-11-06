import Redis from 'ioredis';
import { initSqlite, closeSqlite, getSqlite } from '@/db';

/**
 * 把 blog / gallery 数据从 Redis List 搬到 SQLite。
 *
 * 用法（在项目根执行）：
 *
 * ```bash
 * # 演练：只统计不写入
 * npx tsx src/main/ts/scripts/migrateBlogRedisToSqlite.ts
 * # 真正执行
 * npx tsx src/main/ts/scripts/migrateBlogRedisToSqlite.ts --write
 * ```
 *
 * 特点：
 * - **默认演练**，不加 `--write` 不会写任何数据
 * - **幂等**：按 `(author, created_at, title)` 判重，重复执行不会产生副本
 * - **不删 Redis 原数据**，便于回滚和比对
 * - 单条解析失败不中断，最后汇总报告
 */

const WRITE = process.argv.includes('--write');

// time 的类型在两个模块里不一致：
//   blog.js    对 data.params.time 做了 parseInt → 存为 number
//   gallery.js 直接用 data.params.time       → 存为 string（query 参数的原样）
// 所以这里声明成联合类型，并用 toEpoch() 统一归一化。
interface IBlogRec { time?: number | string; auth?: string; title?: string; text?: string }
// `ablum` 是 **Redis 里存量数据的字段名**（旧后端的拼写错误，`album` 之误）。
// 响应字段那边 2026-11-05 已经改正成 `album`，但这里**不能跟着改** ——
// 读的是旧数据本身，改了就一张图都读不到。
interface IGalleryRec extends IBlogRec {
	ablum?: { id?: number; title?: string; desc?: string; url?: string }[];
}

/**
 * 把记录里的 time 归一化成 epoch ms。
 *
 * 不能用 `Number.isFinite(rec.time)` 判断——它**不做类型转换**，
 * 对字符串 `"1770588479999"` 返回 false。gallery 的 time 恰好是字符串，
 * 于是会被误判成无效值、落到 `Date.now()`，整批相册的时间戳都会变成迁移时刻。
 */
const toEpoch = (v: unknown, fallback: number): number => {
	if (typeof v === 'number' && Number.isFinite(v)) { return v; }
	if (typeof v === 'string' && v.length > 0) {
		const n = Number(v);
		if (Number.isFinite(n)) { return n; }
	}
	return fallback;
};

interface IStat {
	scanned: number;
	inserted: number;
	skipped: number;   // 已存在
	failed: number;    // 解析失败
	failures: string[];
}

const newStat = (): IStat => ({ scanned: 0, inserted: 0, skipped: 0, failed: 0, failures: [] });

/** 从 key 里取出 userId：jadedungeon::blog::u001 → u001 */
const userIdOf = (key: string): string => key.split('::').pop() ?? '';

const migrateBlog = async (redis: Redis): Promise<IStat> => {
	const st = newStat();
	const db = getSqlite();
	const keys = (await redis.keys('jadedungeon::blog::*')).sort();

	for (const key of keys) {
		if (await redis.type(key) !== 'list') {
			console.log(`  跳过 ${key}（类型不是 list）`);
			continue;
		}
		const author = userIdOf(key);
		const list = await redis.lrange(key, 0, -1);
		console.log(`\n  ${key}  ${list.length} 条`);

		for (let i = 0; i < list.length; i++) {
			st.scanned++;
			let rec: IBlogRec;
			try {
				rec = JSON.parse(list[i]) as IBlogRec;
			} catch (e) {
				st.failed++;
				st.failures.push(`${key} 下标 ${i}: ${(e as Error).message}`);
				continue;
			}
			const title = rec.title ?? '';
			const text = rec.text ?? '';
			const createdAt = toEpoch(rec.time, Date.now());
			// 作者取 key 里的 userId，而非记录里的 auth——
			// 两者理论上一致，但 key 是数据的真实归属
			const exists = await db.queryOne<{ id: number }>(
				'SELECT id FROM blog_article WHERE author = ? AND created_at = ? AND title = ?',
				[author, createdAt, title]);
			if (exists) { st.skipped++; continue; }

			if (WRITE) {
				const now = Date.now();
				await db.run(
					`INSERT INTO blog_article (author, title, text, created_at, updated_at)
					 VALUES (?, ?, ?, ?, ?)`,
					[author, title, text, createdAt, now]);
			}
			st.inserted++;
		}
	}
	return st;
};

const migrateGallery = async (redis: Redis): Promise<IStat> => {
	const st = newStat();
	const db = getSqlite();
	const keys = (await redis.keys('jadedungeon::gallery::*')).sort();

	for (const key of keys) {
		if (await redis.type(key) !== 'list') {
			console.log(`  跳过 ${key}（类型不是 list）`);
			continue;
		}
		const author = userIdOf(key);
		const list = await redis.lrange(key, 0, -1);
		console.log(`\n  ${key}  ${list.length} 条`);

		for (let i = 0; i < list.length; i++) {
			st.scanned++;
			let rec: IGalleryRec;
			try {
				rec = JSON.parse(list[i]) as IGalleryRec;
			} catch (e) {
				st.failed++;
				st.failures.push(`${key} 下标 ${i}: ${(e as Error).message}`);
				continue;
			}
			const title = rec.title ?? '';
			const createdAt = toEpoch(rec.time, Date.now());
			const exists = await db.queryOne<{ id: number }>(
				'SELECT id FROM gallery_album WHERE author = ? AND created_at = ? AND title = ?',
				[author, createdAt, title]);
			if (exists) { st.skipped++; continue; }

			const photos = Array.isArray(rec.ablum) ? rec.ablum : [];
			if (WRITE) {
				const now = Date.now();
				// 相册与图片必须一起成功
				await db.exec('BEGIN');
				try {
					const res = await db.run(
						`INSERT INTO gallery_album (author, title, text, created_at, updated_at)
						 VALUES (?, ?, ?, ?, ?)`,
						[author, title, rec.text ?? '', createdAt, now]);
					const albumId = Number(res.lastInsertRowid);
					for (let j = 0; j < photos.length; j++) {
						const p = photos[j];
						if (!p || !p.url) { continue; }
						// seq 用数组下标而非记录里的 id——旧数据的 id 只是组内序号，
						// 有些组可能不连续，用下标更可靠
						await db.run(
							`INSERT INTO gallery_photo (album_id, seq, title, descr, url)
							 VALUES (?, ?, ?, ?, ?)`,
							[albumId, j, p.title ?? '', p.desc ?? '', p.url]);
					}
					await db.exec('COMMIT');
				} catch (err) {
					await db.exec('ROLLBACK');
					throw err;
				}
			}
			st.inserted++;
		}
	}
	return st;
};

const report = (label: string, st: IStat) => {
	console.log(`\n── ${label} ──`);
	console.log(`  扫描 ${st.scanned} 条`);
	console.log(`  ${WRITE ? '已写入' : '将写入'} ${st.inserted} 条`);
	console.log(`  已存在跳过 ${st.skipped} 条`);
	console.log(`  解析失败 ${st.failed} 条`);
	for (const f of st.failures) { console.log(`     ❌ ${f}`); }
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

		console.log('\n=== 博客 ===');
		const blogStat = await migrateBlog(redis);
		console.log('\n=== 相册 ===');
		const galStat = await migrateGallery(redis);

		report('博客', blogStat);
		report('相册', galStat);

		if (WRITE) {
			const db = getSqlite();
			const a = await db.queryOne<{ c: number }>('SELECT COUNT(*) c FROM blog_article');
			const g = await db.queryOne<{ c: number }>('SELECT COUNT(*) c FROM gallery_album');
			const p = await db.queryOne<{ c: number }>('SELECT COUNT(*) c FROM gallery_photo');
			console.log(`\n=== SQLite 现状 ===`);
			console.log(`  blog_article  ${a?.c} 行`);
			console.log(`  gallery_album ${g?.c} 行`);
			console.log(`  gallery_photo ${p?.c} 行`);
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
