import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';

/**
 * 备份博客与相册数据（含图片文件）。
 *
 * 用法（在项目根执行）：
 *
 * ```bash
 * npx tsx src/main/ts/scripts/backupBlogData.ts http://localhost:8089 ./backup u001
 * ```
 *
 * 取代旧后端的 `backup.js` / `backup-blog-data.js`。两处差异：
 *
 * 1. 旧脚本靠 `loadByUser?pageSize=65535` 一次性拿到带正文的全部文章。
 *    新实现的列表接口**不再返回正文**（正文平均 34.7 KB、最长 1.3 MB，
 *    列表页带着它翻页太慢），所以这里改成：先列摘要，再逐篇调 `getArticle`。
 *    代价是 N+1 次请求，但备份不频繁，可以接受。
 * 2. 图片下载之间原本固定 sleep 1500ms，这里保留该节流以免压垮图源。
 */

const [, , baseUrl, backupPath, userId = 'u001'] = process.argv;

if (!baseUrl || !backupPath) {
	console.error('用法: npx tsx src/main/ts/scripts/backupBlogData.ts <baseUrl> <备份目录> [userId]');
	process.exit(1);
}

const dirname = path.resolve(process.cwd(), backupPath);
const IMG_THROTTLE_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fetchJson = <T>(url: string): Promise<T> =>
	new Promise((resolve, reject) => {
		const client = url.startsWith('https:') ? https : http;
		client.get(url, (res) => {
			let text = '';
			res.on('data', (d) => { text += d; });
			res.on('end', () => {
				try { resolve(JSON.parse(text) as T); }
				catch (e) { reject(new Error(`解析失败 ${url}: ${(e as Error).message}`)); }
			});
		}).on('error', reject);
	});

interface ISummary { id: number; auth: string; title: string; time: number }
interface IArticleResp { status: string; article?: { id: number; auth: string; title: string; text: string; time: number } }
interface IPhoto { id: number; title: string; desc: string; url: string }
interface IAlbum { id: number; auth: string; title: string; text: string; time: number; album: IPhoto[] }
interface IAlbumListResp { status: string; page: number; pageCount: number; articles: IAlbum[] }

/** 翻页取回某用户的全部列表项 */
const fetchAllPages = async <T>(
	urlOf: (page: number) => string,
	pick: (resp: { pageCount: number; articles: T[] }) => T[],
): Promise<T[]> => {
	const out: T[] = [];
	let page = 1;
	for (;;) {
		const resp = await fetchJson<{ pageCount: number; articles: T[] }>(urlOf(page));
		out.push(...pick(resp));
		if (page >= (resp.pageCount ?? 1)) { break; }
		page++;
	}
	return out;
};

const downloadImage = (url: string, dest: string): Promise<void> =>
	new Promise((resolve) => {
		const client = url.startsWith('https:') ? https : http;
		client.get(url, (res) => {
			if (res.statusCode !== 200) {
				console.warn(`  ⚠️  图片 ${res.statusCode}: ${url}`);
				res.resume();
				resolve();
				return;
			}
			fs.mkdirSync(path.dirname(dest), { recursive: true });
			const file = fs.createWriteStream(dest);
			res.pipe(file);
			file.on('finish', () => { file.close(); resolve(); });
			file.on('error', (e) => { console.warn(`  ⚠️  写入失败 ${dest}: ${e.message}`); resolve(); });
		}).on('error', (e) => { console.warn(`  ⚠️  下载失败 ${url}: ${e.message}`); resolve(); });
	});

(async () => {
	fs.mkdirSync(dirname, { recursive: true });
	console.log(`备份目标: ${dirname}`);
	console.log(`接口地址: ${baseUrl}`);
	console.log(`用户: ${userId}\n`);

	// ── 博客 ──
	console.log('=== 博客 ===');
	const summaries = await fetchAllPages<ISummary>(
		(p) => `${baseUrl}/api/blog/loadByUser?userId=${encodeURIComponent(userId)}&page=${p}&pageSize=100`,
		(r) => r.articles);
	console.log(`  列出 ${summaries.length} 篇，开始逐篇取正文…`);

	const articles = [];
	let failed = 0;
	for (let i = 0; i < summaries.length; i++) {
		const s = summaries[i];
		try {
			const resp = await fetchJson<IArticleResp>(`${baseUrl}/api/blog/getArticle?id=${s.id}`);
			if (resp.status === 'success' && resp.article) { articles.push(resp.article); }
			else { failed++; console.warn(`  ⚠️  id=${s.id} 取正文失败: ${resp.status}`); }
		} catch (e) {
			failed++;
			console.warn(`  ⚠️  id=${s.id} 请求异常: ${(e as Error).message}`);
		}
		if ((i + 1) % 25 === 0) { console.log(`  已取 ${i + 1}/${summaries.length}`); }
	}
	// 输出结构与旧脚本保持一致，便于沿用既有的离线分析工具
	fs.writeFileSync(`${dirname}/blog.json`,
		JSON.stringify({ status: 'success', articles }, null, '\t'), 'utf8');
	console.log(`  ✅ 已写 blog.json（${articles.length} 篇，失败 ${failed} 篇）`);

	// ── 相册 ──
	console.log('\n=== 相册 ===');
	const albums = await fetchAllPages<IAlbum>(
		(p) => `${baseUrl}/api/gallery/loadByUser?userId=${encodeURIComponent(userId)}&page=${p}&pageSize=100`,
		(r) => (r as IAlbumListResp).articles);
	fs.writeFileSync(`${dirname}/gallery.json`,
		JSON.stringify({ status: 'success', articles: albums }, null, '\t'), 'utf8');
	console.log(`  ✅ 已写 gallery.json（${albums.length} 组）`);

	// ── 图片文件 ──
	const allPhotos = albums.flatMap((a) => a.album ?? []);
	console.log(`\n=== 图片（${allPhotos.length} 张，每张间隔 ${IMG_THROTTLE_MS}ms）===`);
	let done = 0;
	for (const p of allPhotos) {
		if (!p.url) { continue; }
		// 按 URL 的路径结构落盘，与旧脚本一致
		const rel = p.url.replace(/^https?:\/\//, '');
		await downloadImage(p.url, path.join(dirname, rel));
		done++;
		if (done % 10 === 0) { console.log(`  已下载 ${done}/${allPhotos.length}`); }
		await sleep(IMG_THROTTLE_MS);
	}
	console.log(`  ✅ 图片下载完成 ${done} 张`);
	console.log('\n备份结束。');
})().catch((e) => {
	console.error(`\n❌ 备份失败: ${e.message}`);
	process.exitCode = 1;
});
