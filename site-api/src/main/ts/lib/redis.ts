import Redis from 'ioredis';

const redisMap: Map<string, Redis>= new Map();

/**
 * 建立一个命名连接。
 *
 * @param key  代码里取连接用的标识（trpg / blog / auth），也是 redisMap 的键
 * @param name ioredis 的 connectionName，来自 config.properties 的 REDIS_NAME，
 *             仅用于在 Redis `CLIENT LIST` 里识别来源。缺省时退回 key。
 */
export const connectRedis = (key: string, host: string, port: number, name?: string): Redis => {
	const redis = new Redis({
		host,
		port,
		connectionName: name || key,
		maxRetriesPerRequest: 3,
		retryStrategy(times) {
			if (times > 3) {
				console.warn('⚠️  Redis 重试次数已用完，放弃重连');
				return null;
			}
			return Math.min(times * 200, 2000);
		},
		lazyConnect: true,
	});
	redis.on('error', () => { });
	return redis;
}


/**
 * 按名取连接（trpg / blog / auth）。
 *
 * 未初始化时抛错而非返回 undefined，避免调用方静默拿到空值。
 * 注意连接可能处于断开状态（`initRedis` 允许连接失败不阻塞启动），
 * 此时命令会在 ioredis 的重试耗尽后抛错，由调用方捕获。
 */
export const getRedis = (key: string): Redis => {
	const conn = redisMap.get(key);
	if (!conn) {
		throw new Error(`Redis 连接 "${key}" 不存在，请检查 initRedis 的配置`);
	}
	return conn;
};

export const initRedis = async (cfgs: { key: string, host: string, port: number, name?: string }[]): Promise<void> => {
	for (const cfg of cfgs) {
		const client = connectRedis(cfg.key, cfg.host, cfg.port, cfg.name);
		try {
			await client.connect();
			console.log(`✅ Redis 已连接: ${cfg.host}:${cfg.port} (${cfg.key}${cfg.name ? ` as ${cfg.name}` : ''})`);
		} catch (err) {
			console.warn(`⚠️  Redis 连接失败（服务仍可运行）: ${cfg.host}:${cfg.port} — ${(err as Error).message}`);
		}
		redisMap.set(cfg.key, client);
	}
}

export const closeRedis = async (key: string): Promise<void> => {
	const redis = redisMap.get(key);
	if (!redis) {
		return; // 从未连接过，无需断开
	} else {
		try {
			await redis.quit();
			console.log(`👋 Redis 已断开: ${key}`);
			redisMap.delete(key);
		} catch {
			redis.disconnect();
		}
	}
}

export const closeAllRedis = async (): Promise<void> => {
	for (const key of redisMap.keys()) {
		await closeRedis(key);
	}
}