import arg from 'arg';
import { initGlobalCfg } from '@/config';
import { initSqlite, closeSqlite } from '@/db';
import { registUser } from '@/service/authService';

/**
 * 命令行注册用户的入口。
 *
 * 为什么需要它：`AUTH_DISABLE_REGIST=true` 时会关掉 HTTP 注册接口
 * （见 config.ts / auth.ts），防止对公网开放的站点被脚本批量刷注册。
 * 管理员仍需要建号，就通过本入口在服务器本地用 node 跑。
 *
 * 用法（先 `npm run build`）：
 *
 *   node dist/userRegCli.js -u <username> -p <password>
 *
 * 开发期不编译直接用 tsx：
 *
 *   npx tsx src/main/ts/userRegCli.ts -u <username> -p <password>
 *
 * 注意：
 * - 密码若含 shell 特殊字符（! $ ` 等）要用单引号包起来，如 `-p 'aB3#xyz!'`
 * - 与 HTTP 注册共用 `registUser()`，读同一个 SQLITE_PATH，注册出的用户完全等价
 * - 密码强度校验和 HTTP 注册一致：这里**不做**强度检查，只查非空
 */

async function main(): Promise<void> {
	const args = arg({
		'--username': String, '-u': '--username',
		'--password': String, '-p': '--password',
	});

	const username = args['--username'];
	const password = args['--password'];

	if (!username || !password || username.length === 0 || password.length === 0) {
		console.error('❌ 缺少用户名或密码。用法: node dist/userRegCli.js -u <username> -p <password>');
		process.exit(1);
	}

	// 复用 initGlobalCfg 读 config.properties，保证 SQLITE_PATH 与 HTTP 服务一致。
	// 本入口不关心 host / port / uploadPath，所以 CLI 参数传空对象、走 env + 默认值。
	const cfg = initGlobalCfg({});

	if (!cfg.sqlite) {
		console.error('❌ 缺少 SQLite 配置，无法注册用户');
		process.exit(1);
	}

	try {
		await initSqlite(cfg.sqlite.path, cfg.sqlite.readPoolSize);
	} catch (err) {
		console.error(`❌ SQLite 初始化失败: ${(err as Error).message}`);
		process.exit(1);
	}

	try {
		const result = await registUser(username, password);
		if (result.ok) {
			console.log(`✅ 用户 ${username} 注册成功`);
			await closeSqlite();
			process.exit(0);
		} else {
			console.error(`❌ 注册失败: ${result.msg}`);
			await closeSqlite();
			process.exit(1);
		}
	} catch (err) {
		console.error(`❌ 注册失败: ${(err as Error).message}`);
		await closeSqlite();
		process.exit(1);
	}
}

main();
