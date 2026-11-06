import { parentPort, workerData } from 'worker_threads';
import Database from 'better-sqlite3';
import type { WorkerRequest, WorkerInitData } from './types';

const { dbPath, readonly } = workerData as WorkerInitData;

const db = new Database(dbPath, { readonly });
const stmtCache = new Map<string, Database.Statement>();

db.pragma('busy_timeout = 5000');
if (!readonly) {
	db.pragma('journal_mode = WAL');
}

function getStmt(sql: string): Database.Statement {
	let stmt = stmtCache.get(sql);
	if (!stmt) {
		stmt = db.prepare(sql);
		stmtCache.set(sql, stmt);
	}
	return stmt;
}

parentPort!.on('message', ({ id, type, sql, params = [] }: WorkerRequest) => {
	try {
		let result: unknown;
		if (type === 'exec') {
			db.exec(sql);
			result = null;
		} else {
			const stmt = getStmt(sql);
			if (type === 'run') result = stmt.run(...params);
			else if (type === 'get') result = stmt.get(...params);
			else result = stmt.all(...params);
		}
		parentPort!.postMessage({ id, result });
	} catch (err) {
		parentPort!.postMessage({ id, error: (err as Error).message });
	}
});
