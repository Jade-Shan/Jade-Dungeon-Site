import { initSqlite, closeSqlite, getSqlite } from '@/db';
import { makeExcerpt } from '@/service/blogService';

/**
 * 回填 `blog_article.excerpt`。
 *
 * 用法（在项目根执行）：
 *
 * ```bash
 * # 演练：只统计不写入
 * npx tsx src/main/ts/scripts/backfillExcerpt.ts
 * # 真正执行
 * npx tsx src/main/ts/scripts/backfillExcerpt.ts --write
 * # 重算全部（含已有摘要的），改了 makeExcerpt 逻辑后用
 * npx tsx src/main/ts/scripts/backfillExcerpt.ts --write --all
 * ```
 *
 * 默认只处理 `excerpt` 为空的行，所以可重复执行。
 * 加 `--all` 会重算所有行——改了剥离逻辑后需要这样刷一遍。
 */

const WRITE = process.argv.includes('--write');
const ALL = process.argv.includes('--all');

interface IRow { id: number; title: string; text: string; excerpt: string }

(async () => {
	console.log(WRITE ? '=== 正式执行 ===' : '=== 演练模式（加 --write 才写入）===');
	console.log(ALL ? '范围：全部文章（重算）' : '范围：仅 excerpt 为空的文章');

	await initSqlite(process.env.SQLITE_PATH || 'data/jade-dungeon.db',
		parseInt(process.env.SQLITE_READ_POOL_SIZE || '8', 10));
	const db = getSqlite();

	try {
		const rows = await db.query<IRow>(ALL
			? 'SELECT id, title, text, excerpt FROM blog_article ORDER BY id'
			: `SELECT id, title, text, excerpt FROM blog_article WHERE excerpt = '' ORDER BY id`);

		console.log(`\n待处理 ${rows.length} 篇\n`);
		if (rows.length === 0) {
			console.log('  没有需要回填的记录。');
			return;
		}

		let updated = 0, unchanged = 0, empty = 0;
		const emptyIds: number[] = [];

		for (const r of rows) {
			const excerpt = makeExcerpt(r.text);
			if (excerpt === '') {
				// 全是图片的文章剥离后没有文字。不用标题兜底——
				// 标题在列表页本来就单独显示，填进摘要会重复。
				empty++;
				emptyIds.push(r.id);
			}
			if (excerpt === r.excerpt) { unchanged++; continue; }
			if (WRITE) {
				await db.run('UPDATE blog_article SET excerpt = ? WHERE id = ?', [excerpt, r.id]);
			}
			updated++;
		}

		console.log(`  ${WRITE ? '已更新' : '将更新'} ${updated} 篇`);
		console.log(`  内容未变 ${unchanged} 篇`);
		console.log(`  摘要为空 ${empty} 篇${empty ? `（id ${emptyIds.join(', ')}，正文只有图片）` : ''}`);

		if (WRITE) {
			const stat = await db.queryOne<{ total: number; filled: number; maxLen: number }>(
				`SELECT COUNT(*) AS total,
				        SUM(CASE WHEN excerpt <> '' THEN 1 ELSE 0 END) AS filled,
				        MAX(LENGTH(excerpt)) AS maxLen
				   FROM blog_article`);
			console.log(`\n=== 回填后状态 ===`);
			console.log(`  总计 ${stat?.total} 篇，有摘要 ${stat?.filled} 篇，最长摘要 ${stat?.maxLen} 字符`);

			const sample = await db.query<{ id: number; excerpt: string }>(
				`SELECT id, excerpt FROM blog_article WHERE excerpt <> '' ORDER BY id LIMIT 3`);
			console.log('\n  样本:');
			for (const s of sample) {
				console.log(`    [${s.id}] ${s.excerpt.slice(0, 70)}${s.excerpt.length > 70 ? '…' : ''}`);
			}
		} else {
			console.log('\n  演练结束。确认无误后加 --write 正式执行。');
		}
	} catch (err) {
		console.error(`\n❌ 失败: ${(err as Error).message}`);
		process.exitCode = 1;
	} finally {
		await closeSqlite();
	}
})();
