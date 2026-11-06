import { getSqlite } from '@/db';

/**
 * 博客与相册。数据存 SQLite（2026-11-04 从 Redis List 迁入）。
 *
 * ## 字段命名的两套体系
 *
 * 表用规范命名，响应 JSON 沿用旧字段名，映射集中在本文件：
 *
 * | 表字段 | 响应字段 | 说明 |
 * |--------|---------|------|
 * | `author` | `auth` | 作者 userId |
 * | `created_at` | `time` | epoch ms |
 * | `gallery_photo.descr` | `desc` | `desc` 在 SQLite 里是保留字，表里改名 |
 * | （photo 列表） | `album` | 2026-11-05 前是 `ablum`（拼写错误），见下 |
 *
 * ## `ablum` → `album`（2026-11-05）
 *
 * 这个字段名原来是旧后端的拼写错误，迁移时按「前端依赖它」照搬了。
 * **旧后端已停用**，前端只剩本仓库的 `site-page`，所以两边一起改正了。
 *
 * 唯一还留着旧拼写的地方是 `scripts/migrateBlogRedisToSqlite.ts` ——
 * 它读的是 **Redis 里的存量旧数据**，那边的 key 本来就叫 `ablum`，
 * 跟后端版本无关，不能动。
 *
 * ## 为什么列表不返回正文
 *
 * 实测 blog 的 `text` 平均 34.7 KB、最长 1.3 MB。列表页带上正文会让翻页很慢，
 * 所以 `listArticles()` 只查摘要字段，完整正文走 `getArticle(id)`。
 */

// ───────────────────────── 类型 ─────────────────────────

/** 列表项：不含正文 */
export interface IArticleSummary {
	id: number;
	auth: string;
	title: string;
	/** 纯文本摘要，已剥离 Markdown 标记。全是图片的文章可能为空串。 */
	excerpt: string;
	time: number;
}

/** 单篇：含正文 */
export interface IArticleDetail extends IArticleSummary {
	text: string;
}

export interface IPhoto {
	id: number;      // 组内序号，对应表里的 seq
	title: string;
	desc: string;
	url: string;
}

export interface IAlbumSummary {
	id: number;
	auth: string;
	title: string;
	text: string;
	time: number;
}

/** 相册含图片列表 */
export interface IAlbumDetail extends IAlbumSummary {
	album: IPhoto[];
}

export interface IPagedResult<T> {
	page: number;
	pageCount: number;
	items: T[];
}

// ───────────────────────── 摘要生成 ─────────────────────────

/** 摘要的最大字符数。超出会截断并加省略号。 */
export const EXCERPT_MAX_LEN = 200;

/**
 * 从 Markdown 正文生成纯文本摘要。
 *
 * 为什么不引 Markdown 解析库：实测 215 篇存量文章里，用到的语法只有
 * 链接(35%)、裸 URL(36%)、引用(13%)、图片(8%)、列表(6%)、标题与粗体(各 4%)、
 * 分隔线与有序列表(各 2%)。斜体、代码块、HTML 标签、表格**完全没出现**。
 * 简单正则足够，省掉一个依赖。
 *
 * 几个处理决策：
 * - **图片整条删掉**：alt 文字多是 `![alt 青铜虎尊](url)` 这种标注，不是正文
 * - **链接只留显示文字**：`[链接](http://...)` → `链接`
 * - **裸 URL 保留**：它本身是正文内容
 * - 所有空白（含 CRLF，82% 的文章用 CRLF）折叠成单个空格
 *
 * @returns 纯文本摘要。剥离后无文字但原文有图片时返回 `IMAGE_ONLY_EXCERPT` 占位；
 *          原文本身为空才返回空串。
 */
/** 正文只有图片、没有文字时的摘要占位 */
export const IMAGE_ONLY_EXCERPT = '（图片）';

export const makeExcerpt = (text: string, maxLen = EXCERPT_MAX_LEN): string => {
	if (!text) { return ''; }
	let s = text;

	// 图片整条删掉（必须在链接之前处理，否则 ![a](b) 会先被链接规则吃掉前缀）。
	// 先记下有没有图片——剥离后若一个字都不剩，要靠它判断是「纯图片文章」
	// 还是「原文本来就空」。
	const hadImage = /!\[[^\]]*\]\([^)]*\)/.test(s);
	s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
	// 链接保留显示文字
	s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
	// 代码块与行内代码
	s = s.replace(/```[\s\S]*?```/g, '');
	s = s.replace(/`([^`\n]*)`/g, '$1');
	// 行首标记：标题、引用、无序列表、有序列表、分隔线
	s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');
	s = s.replace(/^\s{0,3}>\s?/gm, '');
	s = s.replace(/^\s{0,3}[-*+]\s+/gm, '');
	s = s.replace(/^\s{0,3}\d+\.\s+/gm, '');
	s = s.replace(/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/gm, '');
	// 强调标记
	s = s.replace(/\*\*([^*]*)\*\*/g, '$1');
	s = s.replace(/~~([^~]*)~~/g, '$1');
	// 空白折叠
	s = s.replace(/\s+/g, ' ').trim();

	// 一个字都不剩：有图片就给占位，否则是原文真的为空
	if (s.length === 0) { return hadImage ? IMAGE_ONLY_EXCERPT : ''; }

	if (s.length <= maxLen) { return s; }
	// 中文没有词边界，直接截断
	return s.slice(0, maxLen).trimEnd() + '…';
};

// ───────────────────────── 分页 ─────────────────────────

/**
 * 归一化分页参数，并计算总页数。
 *
 * 旧实现的页数公式是 `parseInt((recCount + 1) / pageSize)`，**算错了**：
 * 36 条 / 每页 10 条会算出 3 页（应为 4），导致最后一页打不开。
 * 实测 `teo` 的 36 篇文章就撞上了这个 bug。这里改用 `Math.ceil`。
 *
 * **`pageSize` 的下限是 1，不是 10**（2026-11-05 改）。旧实现抬到 10，
 * 结果前端相册页请求的 `pageSize=5` 被静默换成 10 —— 每页条数和页数都不是
 * 前端要的那个（`u001` 的 32 组相册：要 7 页，实际给 4 页）。
 * 分页本身自洽（`pageCount` 按真实 `pageSize` 算），所以不报错、只是不听话。
 * 上限留着 65535，备份脚本靠它一次拿完。
 */
export const normalizePaging = (pageRaw?: string, pageSizeRaw?: string) => {
	let page = parseInt(pageRaw ?? '1', 10);
	if (!Number.isFinite(page) || page < 1) { page = 1; }
	let pageSize = parseInt(pageSizeRaw ?? '10', 10);
	if (!Number.isFinite(pageSize) || pageSize < 1) { pageSize = 10; }
	if (pageSize > 65535) { pageSize = 65535; }
	return { page, pageSize, offset: (page - 1) * pageSize };
};

export const calcPageCount = (total: number, pageSize: number): number =>
	Math.max(1, Math.ceil(total / pageSize));

// ───────────────────────── 博客 ─────────────────────────

interface IArticleRow {
	id: number;
	author: string;
	title: string;
	text?: string;
	excerpt?: string;
	created_at: number;
}

const toSummary = (r: IArticleRow): IArticleSummary =>
	({ id: r.id, auth: r.author, title: r.title, excerpt: r.excerpt ?? '', time: r.created_at });

/** 分页列出某作者的文章，**不含正文** */
export const listArticles = async (
	author: string, pageRaw?: string, pageSizeRaw?: string,
): Promise<IPagedResult<IArticleSummary>> => {
	const { page, pageSize, offset } = normalizePaging(pageRaw, pageSizeRaw);
	const db = getSqlite();

	const cnt = await db.queryOne<{ c: number }>(
		'SELECT COUNT(*) AS c FROM blog_article WHERE author = ?', [author]);
	const total = cnt ? cnt.c : 0;

	const rows = await db.query<IArticleRow>(
		`SELECT id, author, title, excerpt, created_at FROM blog_article
		 WHERE author = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
		[author, pageSize, offset]);

	return { page, pageCount: calcPageCount(total, pageSize), items: rows.map(toSummary) };
};

/** 取单篇文章，含完整正文 */
export const getArticle = async (id: number): Promise<IArticleDetail | undefined> => {
	const r = await getSqlite().queryOne<IArticleRow>(
		'SELECT id, author, title, text, excerpt, created_at FROM blog_article WHERE id = ?', [id]);
	return r ? { ...toSummary(r), text: r.text ?? '' } : undefined;
};

export const saveArticle = async (
	author: string, title: string, text: string, time?: number,
): Promise<number> => {
	const now = Date.now();
	const createdAt = (time !== undefined && Number.isFinite(time)) ? time : now;
	// 摘要在写入时算好，列表查询就不用读大字段了
	const excerpt = makeExcerpt(text);
	const res = await getSqlite().run(
		`INSERT INTO blog_article (author, title, text, excerpt, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		[author, title, text, excerpt, createdAt, now]);
	return Number(res.lastInsertRowid);
};

// ───────────────────────── 相册 ─────────────────────────

interface IAlbumRow {
	id: number;
	author: string;
	title: string;
	text: string;
	created_at: number;
}

interface IPhotoRow {
	album_id: number;
	seq: number;
	title: string;
	descr: string;
	url: string;
}

const toAlbumSummary = (r: IAlbumRow): IAlbumSummary =>
	({ id: r.id, auth: r.author, title: r.title, text: r.text, time: r.created_at });

/**
 * 分页列出某作者的相册，**含图片列表**。
 *
 * 相册的 text 很短（不像博客正文），图片也只是 URL 字符串，
 * 单组最多 19 张，所以列表页带上图片是划算的——前端要显示缩略图。
 * 用一次 IN 查询取回所有图片，避免 N+1。
 */
export const listAlbums = async (
	author: string, pageRaw?: string, pageSizeRaw?: string,
): Promise<IPagedResult<IAlbumDetail>> => {
	const { page, pageSize, offset } = normalizePaging(pageRaw, pageSizeRaw);
	const db = getSqlite();

	const cnt = await db.queryOne<{ c: number }>(
		'SELECT COUNT(*) AS c FROM gallery_album WHERE author = ?', [author]);
	const total = cnt ? cnt.c : 0;

	const albums = await db.query<IAlbumRow>(
		`SELECT id, author, title, text, created_at FROM gallery_album
		 WHERE author = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
		[author, pageSize, offset]);

	const items: IAlbumDetail[] = albums.map((a) => ({ ...toAlbumSummary(a), album: [] }));
	if (items.length > 0) {
		const ids = items.map((a) => a.id);
		const placeholders = ids.map(() => '?').join(',');
		const photos = await db.query<IPhotoRow>(
			`SELECT album_id, seq, title, descr, url FROM gallery_photo
			 WHERE album_id IN (${placeholders}) ORDER BY album_id, seq`, ids);
		const byAlbum: Map<number, IPhoto[]> = new Map();
		for (const p of photos) {
			const list = byAlbum.get(p.album_id) ?? [];
			list.push({ id: p.seq, title: p.title, desc: p.descr, url: p.url });
			byAlbum.set(p.album_id, list);
		}
		for (const a of items) { a.album = byAlbum.get(a.id) ?? []; }
	}

	return { page, pageCount: calcPageCount(total, pageSize), items };
};

export const getAlbum = async (id: number): Promise<IAlbumDetail | undefined> => {
	const db = getSqlite();
	const a = await db.queryOne<IAlbumRow>(
		'SELECT id, author, title, text, created_at FROM gallery_album WHERE id = ?', [id]);
	if (!a) { return undefined; }
	const photos = await db.query<IPhotoRow>(
		'SELECT album_id, seq, title, descr, url FROM gallery_photo WHERE album_id = ? ORDER BY seq', [id]);
	return {
		...toAlbumSummary(a),
		album: photos.map((p) => ({ id: p.seq, title: p.title, desc: p.descr, url: p.url })),
	};
};

/**
 * 事务串行锁。
 *
 * 为什么需要：写池只有 1 个 worker，所有写操作共用同一个 SQLite 连接。
 * 如果两个 `saveAlbum` 并发，各自的 `BEGIN` 会落到同一连接上，
 * 后者会撞 "cannot start a transaction within a transaction"。
 * 写操作本来就是串行的，这个锁不带来额外的吞吐损失。
 */
let txChain: Promise<unknown> = Promise.resolve();

const withTransaction = async <T>(fn: () => Promise<T>): Promise<T> => {
	const run = txChain.then(fn, fn);
	// 无论成败都让链继续，否则一次失败会卡死后续所有事务
	txChain = run.catch(() => undefined);
	return run;
};

/**
 * 保存相册。相册与图片必须一起成功，所以走事务。
 *
 * `exec()` 能跑多语句事务，但参数化查询得逐条 `run`，两者不能混在一条语句里。
 * 所以这里手工 BEGIN / COMMIT，并用 `withTransaction` 保证不会并发嵌套。
 */
export const saveAlbum = async (
	author: string, title: string, text: string,
	photos: { title: string; desc: string; url: string }[], time?: number,
): Promise<number> => withTransaction(async () => {
	const db = getSqlite();
	const now = Date.now();
	const createdAt = (time !== undefined && Number.isFinite(time)) ? time : now;

	await db.exec('BEGIN');
	try {
		const res = await db.run(
			`INSERT INTO gallery_album (author, title, text, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?)`,
			[author, title, text, createdAt, now]);
		const albumId = Number(res.lastInsertRowid);

		for (let i = 0; i < photos.length; i++) {
			const p = photos[i];
			await db.run(
				`INSERT INTO gallery_photo (album_id, seq, title, descr, url)
				 VALUES (?, ?, ?, ?, ?)`,
				[albumId, i, p.title ?? '', p.desc ?? '', p.url]);
		}

		await db.exec('COMMIT');
		return albumId;
	} catch (err) {
		await db.exec('ROLLBACK');
		throw err;
	}
});
