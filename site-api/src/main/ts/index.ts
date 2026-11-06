import { Express } from 'express';
import { initRedis, closeAllRedis } from '@/lib/redis';
import { initSqlite, closeSqlite } from '@/db';
import { initApp } from '@/middleware/simpleHTTPServer';
import express from 'express';
import { initGlobalCfg } from '@/config';
import arg from 'arg';

async function main() {

	// CLI 参数直接交给 initGlobalCfg，由它决定 CLI / 环境变量 / 默认值的优先级
	const args = arg({
		'--host': String, '-h': '--host',
		'--port': String, '-p': '--port',
		'--uploadPath': String, '-u': '--uploadPath',
	});

	const cfg = initGlobalCfg(args);

	await initRedis(cfg.redis ? Array.from(cfg.redis) : []);

	// SQLite 承载 auth 模块的数据。与 Redis 不同，这里连不上就直接退出——
	// auth 是其他模块的权限前提，没有它服务起来也没意义。
	if (cfg.sqlite) {
		try {
			await initSqlite(cfg.sqlite.path, cfg.sqlite.readPoolSize);
		} catch (err) {
			console.error(`❌ SQLite 初始化失败，服务无法启动: ${(err as Error).message}`);
			process.exit(1);
		}
	}

	const app: Express = express();

	initApp(app, cfg);

	app.listen(cfg.server.port, () => {
		console.log(`🚀 服务器已启动: http://localhost:${cfg.server.port}`);
	});
}

// 优雅退出
async function shutdown(signal: string) {
	console.log(`\n🛑 收到 ${signal} 信号，正在关闭...`);
	await closeAllRedis();
	// SQLite 要显式关闭，否则 9 个 worker 线程会让进程挂着不退
	await closeSqlite();
	process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main();
