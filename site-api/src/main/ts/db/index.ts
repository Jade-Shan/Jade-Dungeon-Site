import fs from 'fs';
import path from 'path';
import { SqlitePool } from './SqlitePool';

/**
 * SQLite 连接池单例与建表。
 *
 * 为什么用单例：`SqlitePool` 会启动 8 读 + 1 写共 9 个 worker 线程，
 * 每次 new 一个池都会再开 9 个线程，所以全进程只允许一个实例。
 */
let pool: SqlitePool | undefined = undefined;

/** 建表语句。幂等，每次启动都执行一遍。 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS auth_user (
	username      TEXT    PRIMARY KEY,
	password_hash TEXT    NOT NULL,
	salt          TEXT    NOT NULL,
	hash_algo     TEXT    NOT NULL DEFAULT 'scrypt',
	created_at    INTEGER NOT NULL,
	updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_token (
	token      TEXT    PRIMARY KEY,
	username   TEXT    NOT NULL,
	expire_at  INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	FOREIGN KEY (username) REFERENCES auth_user(username) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_token_username ON auth_token(username);
CREATE INDEX IF NOT EXISTS idx_auth_token_expire   ON auth_token(expire_at);

-- ── 博客 ──
-- 表用规范命名（author / created_at），响应 JSON 保持旧字段名（auth / time），
-- 映射集中在 service/blogService.ts。
CREATE TABLE IF NOT EXISTS blog_article (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	author     TEXT    NOT NULL,
	title      TEXT    NOT NULL,
	text       TEXT    NOT NULL,
	-- 列表页用的纯文本摘要（已剥离 Markdown 标记）。
	-- 列表查询不读 text 字段（平均 34.7 KB、最长 1.3 MB），只读这一列。
	excerpt    TEXT    NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

-- 列表页按作者 + 时间倒序分页，复合索引直接支撑该查询
CREATE INDEX IF NOT EXISTS idx_blog_author_time ON blog_article(author, created_at DESC);
-- 跨用户的「最新文章」查询（推荐位若将来改成真查询会用到）
CREATE INDEX IF NOT EXISTS idx_blog_time ON blog_article(created_at DESC);

-- ── 相册 ──
CREATE TABLE IF NOT EXISTS gallery_album (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	author     TEXT    NOT NULL,
	title      TEXT    NOT NULL,
	text       TEXT    NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

-- 图片独立成表（方案 A）。旧数据里的 id 是组内序号而非全局唯一，
-- 存为 seq 以保持顺序；响应时要还原成旧结构的 id 字段。
CREATE TABLE IF NOT EXISTS gallery_photo (
	id       INTEGER PRIMARY KEY AUTOINCREMENT,
	album_id INTEGER NOT NULL,
	seq      INTEGER NOT NULL,
	title    TEXT    NOT NULL DEFAULT '',
	descr    TEXT    NOT NULL DEFAULT '',
	url      TEXT    NOT NULL,
	FOREIGN KEY (album_id) REFERENCES gallery_album(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_album_author_time ON gallery_album(author, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photo_album ON gallery_photo(album_id, seq);
`;

/**
 * 给已存在的表补列。
 *
 * 为什么需要这个：`CREATE TABLE IF NOT EXISTS` 对**已经存在**的表完全不生效，
 * 所以往 SCHEMA 里加一个字段，对已有数据的库是没用的。
 * 以后每次改表结构都要在这里加一条对应的迁移。
 *
 * SQLite 的 `ALTER TABLE ADD COLUMN` 不支持 `IF NOT EXISTS`，
 * 所以先查 `PRAGMA table_info` 确认列是否存在。
 */
const COLUMN_MIGRATIONS: { table: string; column: string; ddl: string }[] = [
	{
		table: 'blog_article', column: 'excerpt',
		ddl: `ALTER TABLE blog_article ADD COLUMN excerpt TEXT NOT NULL DEFAULT ''`,
	},
];

const applyColumnMigrations = async (p: SqlitePool): Promise<void> => {
	for (const m of COLUMN_MIGRATIONS) {
		const cols = await p.query<{ name: string }>(`PRAGMA table_info(${m.table})`);
		if (cols.some((c) => c.name === m.column)) { continue; }
		await p.exec(m.ddl);
		console.log(`🔧 已为 ${m.table} 补列 ${m.column}`);
	}
};

/**
 * 初始化连接池并建表。幂等，重复调用直接返回已有实例。
 *
 * @param dbPath       数据库文件路径，相对进程工作目录解析
 * @param readPoolSize 读取 worker 数量
 */
export const initSqlite = async (dbPath: string, readPoolSize = 8): Promise<SqlitePool> => {
	if (pool) { return pool; }

	// better-sqlite3 不会自动建目录，路径不存在时会直接抛错
	const dir = path.dirname(path.resolve(dbPath));
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
		console.log(`📁 已创建数据库目录: ${dir}`);
	}

	pool = new SqlitePool(dbPath, { readPoolSize });
	await pool.exec(SCHEMA);
	await applyColumnMigrations(pool);
	console.log(`✅ SQLite 已就绪: ${dbPath} (${readPoolSize} 读 + 1 写)`);

	// 清理过期 token。只在启动时做一次，日常靠查询条件过滤即可。
	const cleaned = await pool.run('DELETE FROM auth_token WHERE expire_at < ?', [Date.now()]);
	if (cleaned.changes > 0) {
		console.log(`🧹 已清理 ${cleaned.changes} 个过期 token`);
	}

	return pool;
};

/** 取连接池。未初始化时抛错，避免静默返回 undefined 导致难查的问题。 */
export const getSqlite = (): SqlitePool => {
	if (!pool) {
		throw new Error('SQLite 连接池未初始化，请先调用 initSqlite()');
	}
	return pool;
};

export const closeSqlite = async (): Promise<void> => {
	if (!pool) { return; }
	await pool.close();
	pool = undefined;
	console.log('👋 SQLite 连接池已关闭');
};
