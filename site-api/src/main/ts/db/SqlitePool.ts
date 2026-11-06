import { Worker } from 'worker_threads';
import path from 'path';
import Database from 'better-sqlite3';
import type { QueryType, WorkerInitData, WorkerRequest, WorkerResponse } from './types';

export interface RunResult {
	changes: number;
	lastInsertRowid: number | bigint;
}

// Resolve worker file path: .ts in dev (tsx), .js in prod (compiled)
const workerExt = path.extname(__filename);
const workerPath = path.join(__dirname, `worker${workerExt}`);
const workerExecArgv = workerExt === '.ts' ? ['-r', 'tsx/cjs'] : [];

/** 单个请求的默认超时。超时只是让 promise 以失败收场，worker 内的 SQL 无法中断。 */
const DEFAULT_QUERY_TIMEOUT_MS = 10_000;

interface PendingEntry {
	resolve: (v: unknown) => void;
	reject: (e: Error) => void;
	timer: NodeJS.Timeout;
}

class WorkerWrapper {
	private worker: Worker;
	private pending = new Map<number, PendingEntry>();
	private counter = 0;
	busy = false;
	/** worker 已退出或崩溃，不可再派活。由连接池负责重建。 */
	dead = false;

	constructor(
		private initData: WorkerInitData,
		private queryTimeoutMs: number,
		/** worker 异常死亡时回调连接池，便于重建 */
		private onDeath?: (w: WorkerWrapper) => void,
	) {
		this.worker = this.spawn();
	}

	private spawn(): Worker {
		const worker = new Worker(workerPath, { workerData: this.initData, execArgv: workerExecArgv });

		worker.on('message', (res: WorkerResponse) => {
			const p = this.pending.get(res.id);
			if (!p) return;
			clearTimeout(p.timer);
			this.pending.delete(res.id);
			this.busy = this.pending.size > 0;
			if (res.error) {
				p.reject(new Error(res.error));
			} else {
				p.resolve(res.result);
			}
		});

		// 'error' 表示 worker 抛出了未捕获异常；'exit' 覆盖所有退出路径（含崩溃与 terminate）。
		// 两者都要把在飞的请求 reject 掉，否则调用方的 promise 会永久悬挂。
		worker.on('error', (err) => this.die(err));
		worker.on('exit', (code) => {
			if (this.dead) return;   // 正常 close() 已先标记，无需再处理
			this.die(new Error(`SQLite worker 意外退出，code=${code}`));
		});

		return worker;
	}

	/** 标记死亡、清空在飞请求、通知连接池 */
	private die(err: Error) {
		if (this.dead) return;
		this.dead = true;
		this.busy = false;
		this.rejectAll(err);
		this.onDeath?.(this);
	}

	private rejectAll(err: Error) {
		for (const p of this.pending.values()) {
			clearTimeout(p.timer);
			p.reject(err);
		}
		this.pending.clear();
	}

	execute(type: QueryType, sql: string, params?: unknown[]): Promise<unknown> {
		if (this.dead) {
			return Promise.reject(new Error('SQLite worker 不可用（已死亡，等待重建）'));
		}
		const id = ++this.counter;
		this.busy = true;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				if (!this.pending.delete(id)) return;
				this.busy = this.pending.size > 0;
				// 超时多半意味着 worker 卡住或已失联：标记死亡让连接池换一个，
				// 否则后续请求会继续派给这个有问题的 worker。
				this.die(new Error(`SQLite 查询超时（${this.queryTimeoutMs}ms）: ${sql.slice(0, 120)}`));
				reject(new Error(`SQLite 查询超时（${this.queryTimeoutMs}ms）: ${sql.slice(0, 120)}`));
			}, this.queryTimeoutMs);

			this.pending.set(id, { resolve, reject, timer });
			this.worker.postMessage({ id, type, sql, params } satisfies WorkerRequest);
		});
	}

	/** 主动关闭：先标记死亡，避免 'exit' 回调把它当成崩溃 */
	terminate(): Promise<number> {
		this.dead = true;
		this.rejectAll(new Error('SQLite 连接池已关闭'));
		return this.worker.terminate();
	}
}

/** 排队中的任务：dispatch 闭包 + reject 句柄（关闭时需要主动拒绝） */
interface QueuedTask {
	run: (w: WorkerWrapper) => void;
	reject: (e: Error) => void;
}

class WorkerPool {
	private workers: WorkerWrapper[] = [];
	private queue: QueuedTask[] = [];
	private closed = false;

	constructor(
		private dbPath: string,
		size: number,
		private readonlyConn: boolean,
		private queryTimeoutMs: number,
	) {
		for (let i = 0; i < size; i++) { this.workers.push(this.createWorker()); }
	}

	private createWorker(): WorkerWrapper {
		return new WorkerWrapper(
			{ dbPath: this.dbPath, readonly: this.readonlyConn },
			this.queryTimeoutMs,
			(dead) => this.replaceWorker(dead),
		);
	}

	/**
	 * 用新 worker 顶替死掉的那个，保持池容量不变。
	 * 不这样做的话，池会随崩溃次数逐渐缩小，最终所有请求无限排队。
	 */
	private replaceWorker(dead: WorkerWrapper) {
		if (this.closed) return;
		const idx = this.workers.indexOf(dead);
		if (idx < 0) return;
		console.warn(`⚠️  SQLite ${this.readonlyConn ? '读取' : '写入'} worker 异常退出，正在重建`);
		try {
			this.workers[idx] = this.createWorker();
		} catch (err) {
			// 重建失败（如数据库文件已不可访问），移除该槽位，避免派活给坏 worker
			this.workers.splice(idx, 1);
			console.error(`❌ SQLite worker 重建失败，池容量降至 ${this.workers.length}: ${(err as Error).message}`);
			return;
		}
		// 重建出的 worker 是空闲的，立刻消化一个排队任务
		this.drainQueue(this.workers[idx]);
	}

	/** 把一个排队任务派给指定的空闲 worker */
	private drainQueue(worker: WorkerWrapper) {
		if (worker.busy || worker.dead) return;
		const next = this.queue.shift();
		if (next) next.run(worker);
	}

	execute(type: QueryType, sql: string, params?: unknown[]): Promise<unknown> {
		if (this.closed) return Promise.reject(new Error('SQLite 连接池已关闭'));
		if (this.workers.length === 0) {
			return Promise.reject(new Error('SQLite 连接池无可用 worker'));
		}
		const free = this.workers.find(w => !w.busy && !w.dead);
		if (free) return this.dispatch(free, type, sql, params);
		return new Promise((resolve, reject) => {
			this.queue.push({
				run: (w) => this.dispatch(w, type, sql, params).then(resolve, reject),
				reject,
			});
		});
	}

	private dispatch(worker: WorkerWrapper, type: QueryType, sql: string, params?: unknown[]): Promise<unknown> {
		return worker.execute(type, sql, params).finally(() => {
			// 该 worker 若已死亡，排队任务要交给其他空闲 worker，别再派给它。
			// （死亡时 replaceWorker 已经重建并消化过一个任务，这里兜住剩余的。）
			const target = worker.dead ? this.workers.find(w => !w.busy && !w.dead) : worker;
			if (target) this.drainQueue(target);
		});
	}

	close(): Promise<void> {
		this.closed = true;
		// 主动拒绝尚未派发的排队任务，避免调用方 promise 悬挂
		for (const task of this.queue.splice(0)) {
			task.reject(new Error('SQLite 连接池已关闭'));
		}
		return Promise.all(this.workers.map(w => w.terminate())).then(() => {});
	}
}

export interface SqlitePoolOptions {
	/** 读取 worker 数量，默认 8 */
	readPoolSize?: number;
	/** 单个请求超时（毫秒），默认 10000。超时会判定 worker 失联并重建。 */
	queryTimeoutMs?: number;
}

export class SqlitePool {
	private readPool: WorkerPool;
	private writePool: WorkerPool;

	constructor(dbPath: string, options: number | SqlitePoolOptions = {}) {
		// 兼容旧签名 new SqlitePool(path, 8)
		const opts: SqlitePoolOptions = typeof options === 'number' ? { readPoolSize: options } : options;
		const readPoolSize = opts.readPoolSize ?? 8;
		const queryTimeoutMs = opts.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;

		// 构造时同步设 WAL：readonly 连接无法创建 -wal/-shm，
		// 而干净关闭后这两个文件会被删除，必须先用读写连接重建，再启动 worker。
		const db = new Database(dbPath);
		db.pragma('journal_mode = WAL');
		db.close();

		this.readPool = new WorkerPool(dbPath, readPoolSize, true, queryTimeoutMs);
		this.writePool = new WorkerPool(dbPath, 1, false, queryTimeoutMs);
	}

	/** 只读查询，返回多行，使用读取连接池（最多 8 个并发） */
	query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
		return this.readPool.execute('all', sql, params) as Promise<T[]>;
	}

	/** 只读查询，返回单行，使用读取连接池 */
	queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> {
		return this.readPool.execute('get', sql, params) as Promise<T | undefined>;
	}

	/** 写入操作，使用串行写入连接（同一时间只有 1 个） */
	run(sql: string, params?: unknown[]): Promise<RunResult> {
		return this.writePool.execute('run', sql, params) as Promise<RunResult>;
	}

	/** 执行 DDL 或批量 SQL，使用写入连接 */
	exec(sql: string): Promise<void> {
		return this.writePool.execute('exec', sql).then(() => {});
	}

	close(): Promise<void> {
		return Promise.all([this.readPool.close(), this.writePool.close()]).then(() => {});
	}
}
