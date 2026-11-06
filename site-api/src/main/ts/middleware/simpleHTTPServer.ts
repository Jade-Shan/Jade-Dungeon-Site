import fs from 'fs';
import path from 'path';
import express from 'express';
import { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { IGlobalCfg, IRequestContext, IRequestData, IUploadedFile, HTTP_GET, HTTP_POST, ICustomHandler } from '@/types';


/**
 * 按 `CROS_SITE` 白名单构建 cors 中间件。
 *
 * - 白名单为空 → 放开所有来源（`*`），保持配置前的行为，方便本地开发
 * - 白名单非空 → 只回显名单内的 origin；不在名单内则不下发 CORS 头，由浏览器拦截
 * - **无 Origin 头的请求一律放行**：CORS 是浏览器机制，curl、conky 这类客户端
 *   不发 Origin，拦它们没有意义反而会误伤（天气接口就是给 conky 用的）
 */
const buildCors = (globalCfg: IGlobalCfg) => {
	const allowList = globalCfg.crosSite ?? [];
	if (allowList.length === 0) {
		console.log('🌐 CORS: 未配置 CROS_SITE，放开所有来源');
		return cors();
	}

	console.log(`🌐 CORS: 白名单 ${allowList.length} 项 — ${allowList.join(', ')}`);
	return cors({
		origin: (origin, callback) => {
			// origin 为 undefined 表示同源请求或非浏览器客户端
			if (!origin || allowList.includes(origin)) {
				callback(null, true);
			} else {
				// 传 false 而非 Error：不下发 CORS 头即可，不必让请求以 500 失败
				console.warn(`⚠️  CORS 拒绝来源: ${origin}`);
				callback(null, false);
			}
		},
		methods: ['GET', 'POST'],
		allowedHeaders: ['x-requested-with', 'content-type'],
	});
};

/**
 * 安全地写出一次响应：已经写过的就跳过，不会重复 writeHead / end。
 *
 * 为什么必须有这个守卫（Node v22 实测）：
 * - 重复 `writeHead` → **同步抛 `ERR_HTTP_HEADERS_SENT`**
 * - 重复 `end(data)` → 在 response 的 `'error'` 事件上发出 `ERR_STREAM_WRITE_AFTER_END`，
 *   而本应用既没监听 response 的 `'error'`、也没有 `uncaughtException` 兜底，
 *   所以它会升级成未捕获异常，**直接搞挂进程**
 *
 * 典型触发场景是「超时分支已经响应了，慢回来的正常分支又响应一次」——
 * 旧后端 `map.js` 的 parseImage 就是这样崩的（栈顶 `writeHead`，无守卫的成功分支）。
 *
 * @returns 真正写出了响应返回 true；因已响应过而跳过则返回 false
 */
export const sendOnce = (
	response: Response, status: number, headers: Record<string, string>, body?: string | Buffer,
): boolean => {
	// writableEnded 表示 end() 已被调用；headersSent 表示头已发出。
	// 两者都要查：头发出但未 end 的情况下仍可继续写 body。
	if (response.writableEnded) { return false; }
	if (!response.headersSent) {
		response.writeHead(status, headers);
	}
	if (body === undefined) {
		response.end();
	} else {
		response.end(body);
	}
	return true;
};

/**
 * 供 handler 手工写响应头时取用的 CORS 头。
 *
 * handler 里 `writeHead(status, headers)` 传入的同名头会**覆盖** cors 中间件
 * 用 `setHeader` 设好的值，所以这些地方不能再硬编码 `'*'`——
 * 那样白名单就被绕过了。这里按白名单回显请求的 origin。
 */
export const corsHeadersFor = (globalCfg: IGlobalCfg, request: Request): Record<string, string> => {
	const allowList = globalCfg.crosSite ?? [];
	const origin = request.headers.origin;
	const headers: Record<string, string> = {
		'Access-Control-Allow-Methods': 'GET,POST',
		'Access-Control-Allow-Headers': 'x-requested-with,content-type',
	};
	if (allowList.length === 0) {
		headers['Access-Control-Allow-Origin'] = '*';
	} else if (origin && allowList.includes(origin)) {
		headers['Access-Control-Allow-Origin'] = origin;
	}
	// 不在白名单内时不设该头，浏览器会拦下响应
	return headers;
};

export const initApp = (app: Express, globalCfg: IGlobalCfg) => {

	// 基础中间件
	app.use(helmet());
	app.use(buildCors(globalCfg));
	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));
	app.use(cookieParser());

	/* 配置上传文件 */
	if (globalCfg.upload && globalCfg.upload.tmpPath.length > 0) {
		const path = globalCfg.upload.tmpPath;
		const maxSize = globalCfg.upload.maxSize && globalCfg.upload.maxSize > 0 ? globalCfg.upload.maxSize : 1 * 1024 * 1024;
		app.use(multer({dest: path, limits:{fieldSize: maxSize}}).array('uploadFiles'));
	}
	/* 绑定静态文件目录位置 */
	if (globalCfg.path && globalCfg.path.staticFile && 
		globalCfg.path.staticFile.length > 0) //
	{
		globalCfg.path.staticFile.forEach((p) => {
			app.use(p.path, express.static(p.folder));
		});
	}

	// 路由

	// 全局错误处理
	const errorHandler = ( err: Error, _req: Request, res: Response, _next: NextFunction) => {
		console.error('❌ 未捕获的错误:', err.message);
		console.error(err.stack);

		res.status(500).json({
			error: '服务器内部错误',
			message: process.env.NODE_ENV === 'development'
					? err.message : '请稍后重试',
		});
	}
	app.use(errorHandler);

	// 自动发现并绑定 @/routes/ 下的所有 handler
	const routesDir = path.resolve(__dirname, '../routes');
	const routeHandlers = discoverHandlers(routesDir);
	bindHandler(app, globalCfg, routeHandlers);
}

/** 可用于 `export const handler` 的形态：单个 handler 或一组 handler */
type HandlerExport = ICustomHandler | ICustomHandler[];

const methodLabel = (method: number): string => {
	const methods: string[] = [];
	if (method & HTTP_GET) { methods.push('GET'); }
	if (method & HTTP_POST) { methods.push('POST'); }
	return methods.length > 0 ? methods.join(',') : '(未声明方法)';
};

const isValidHandler = (h: unknown): h is ICustomHandler => {
	if (!h || typeof h !== 'object') { return false; }
	const c = h as Partial<ICustomHandler>;
	return typeof c.urlPtn === 'string' && typeof c.method === 'number' && typeof c.bindFunc === 'function';
};

/**
 * 递归扫描路由目录，收集各文件导出的 handler。
 *
 * 每个路由文件 `export const handler`，可以是单个 `ICustomHandler`，
 * 也可以是 `ICustomHandler[]`——后者让一个文件承载同一业务的多个端点
 * （如 sandtable 的地图相关接口），与旧后端的模块划分保持对应。
 *
 * 支持子目录分组（如 `routes/sandtable/map.ts`），URL 仍由 handler 的
 * `urlPtn` 决定，与文件路径无关。
 */
const discoverHandlers = (dir: string): ICustomHandler[] => {
	const collected: ICustomHandler[] = [];
	const seenUrls: Map<string, string> = new Map();   // urlPtn+method → 来源文件，用于查重

	const walk = (current: string, relative: string) => {
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			const abs = path.join(current, entry.name);
			const rel = relative ? `${relative}/${entry.name}` : entry.name;

			if (entry.isDirectory()) {
				walk(abs, rel);
				continue;
			}
			// 只加载 .ts（开发期）或 .js（编译后），跳过声明文件与 source map
			if (!/\.(ts|js)$/.test(entry.name) || entry.name.endsWith('.d.ts')) { continue; }

			// 插件式路由发现依赖运行时动态路径，无法改写成静态 import。
			// tsconfig 的 module 是 commonjs，这里用同步 require 以保证路由在 listen 前全部注册完成。
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const mod = require(abs);
			const exported: HandlerExport | undefined = mod.handler;
			if (!exported) { continue; }

			const list = Array.isArray(exported) ? exported : [exported];
			for (const h of list) {
				if (!isValidHandler(h)) {
					console.warn(`⚠️  ${rel} 导出了不合法的 handler（需含 urlPtn / method / bindFunc），已跳过`);
					continue;
				}
				// 同一 URL + 方法被重复注册时，Express 只会命中先绑定的那个，这里提前告警
				const dupKey = `${h.method}|${h.urlPtn}`;
				const prev = seenUrls.get(dupKey);
				if (prev) {
					console.warn(`⚠️  路由重复: ${methodLabel(h.method)} ${h.urlPtn} 同时由 ${prev} 和 ${rel} 注册，后者不会生效`);
					continue;
				}
				seenUrls.set(dupKey, rel);
				collected.push(h);
				console.log(`🔗 绑定路由: ${methodLabel(h.method)} ${h.urlPtn}  (${rel})`);
			}
		}
	};

	walk(dir, '');
	return collected;
};

export const bindHandler = (application: Express, config: IGlobalCfg, handlers: ICustomHandler[]) => {
	handlers.forEach((handler) => {
		// 位掩码独立判断：method 为 HTTP_GET | HTTP_POST 时两个方法都要绑定
		if (HTTP_GET === (handler.method & HTTP_GET)) {
			bindHttpGet(application, config, handler.urlPtn, handler.bindFunc);
		}
		if (HTTP_POST === (handler.method & HTTP_POST)) {
			bindHttpPost(application, config, handler.urlPtn, handler.bindFunc);
		}
	});
};

const bindHttpGet = (application: Express, config: IGlobalCfg, urlPtn: string, bindFunc: (context: IRequestContext, data: IRequestData) => void) => {
	application.get(urlPtn, async (request: Request, response: Response) => {
		const context: IRequestContext = {
			globalCfg: config,
			application: application,
			request: request,
			response: response,
		};
		// request.query 的真实类型是 ParsedQs（值可能是 string[] 或嵌套对象）。
		// 框架在此统一按「单值字符串」对外暴露，与所有现有 handler 的用法一致。
		// 如果将来有 handler 需要数组参数，要同时放宽 IRequestData.params。
		const params = request.query as IRequestData['params'];
		const data: IRequestData = {    // data stuff
			params: params,
			cookies: request.cookies,
			files: []
		};
		try {
			await bindFunc(context, data);
		} catch (error) {
			console.error(error);
		}
		// handler 未自行响应时补一个默认的 200 JSON 头并收尾。
		// 用 sendOnce 而非裸 end()：虽然重复 end() 不带数据实测无害，
		// 但显式守卫能避免以后有人改成 end(body) 时踩到 ERR_STREAM_WRITE_AFTER_END。
		sendOnce(context.response, 200, {
			'Content-Type': 'application/json;charset=utf-8',
			...corsHeadersFor(config, request),
		});
	});
};
const bindHttpPost = (application: Express, config: IGlobalCfg, urlPtn: string, bindFunc: (context: IRequestContext, data: IRequestData) => void) => {
	application.post(urlPtn, async (request: Request, response: Response) => {
		const context: IRequestContext = {
			globalCfg: config,
			application: application,
			request: request,
			response: response,
		};
		// 同 bindHttpGet：统一按「单值字符串」对外暴露，详见那里的说明
		const params = request.query as IRequestData['params'];
		if (request.body) {
			for (const f in request.body) {
				params[f] = request.body[f];
			}
		}
		// upload files
		// multer 用的是 .array('uploadFiles')，所以 request.files 是数组而非字典
		let uploadFiles: IUploadedFile[] = [];
		if (request.files && (request.files as IUploadedFile[]).length > 0) {
			uploadFiles = (request.files as IUploadedFile[]);
		};
		const data: IRequestData = {   // data stuff
			params: params,
			cookies: request.cookies,
			//cookies : cookies,
			files: uploadFiles
		};
		try {
			await bindFunc(context, data);
		} catch (error) {
			console.error(error);
		}
		// handler 未自行响应时补一个默认的 200 JSON 头并收尾。
		// 用 sendOnce 而非裸 end()：虽然重复 end() 不带数据实测无害，
		// 但显式守卫能避免以后有人改成 end(body) 时踩到 ERR_STREAM_WRITE_AFTER_END。
		sendOnce(context.response, 200, {
			'Content-Type': 'application/json;charset=utf-8',
			...corsHeadersFor(config, request),
		});
	});
};