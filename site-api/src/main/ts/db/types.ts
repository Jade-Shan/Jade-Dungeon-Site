export type QueryType = 'run' | 'get' | 'all' | 'exec';

export interface WorkerRequest {
	id: number;
	type: QueryType;
	sql: string;
	params?: unknown[];
}

export interface WorkerResponse {
	id: number;
	result?: unknown;
	error?: string;
}

export interface WorkerInitData {
	dbPath: string;
	readonly: boolean;
}
