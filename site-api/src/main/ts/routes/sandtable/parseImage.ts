import http from 'http';
import https from 'https';
import net from 'net';
import { ICustomHandler, IRequestContext, IRequestData, HTTP_GET, HTTP_POST } from '@/types';
import { corsHeadersFor, sendOnce } from '@/middleware/simpleHTTPServer';

/**
 * 图片代理。前端把地图里 `http://` 开头的图片资源都经由这里取，
 * 以便在 canvas 上绘制时不受跨域限制（见 `sandtable-comm.js` 的 `loadImage`）。
 *
 * ⚠️ 这个接口本质是个开放代理：URL 由客户端提供，服务器照着去取。
 * 旧实现没有任何限制，意味着可以让服务器去访问内网地址
 * （如 `http://127.0.0.1:6379`、云环境的 `http://169.254.169.254/`），
 * 把内部服务的响应回显给调用者——即 SSRF。
 *
 * 迁移时加了两道基本防护，都不影响「代理公网图片」这个正常用途：
 * 1. 只允许 http / https 协议
 * 2. 拒绝指向私有网段、回环、链路本地地址的目标
 *
 * 仍未处理的风险（需要更大改动，不在本次范围）：
 * - 域名解析后才暴露的内网地址（DNS rebinding）：这里只检查了字面量 IP
 * - 响应体大小无上限，超大图片会占用内存
 * - `rejectUnauthorized: false` 沿用旧行为，不校验 HTTPS 证书
 */

const PRIVATE_V4 = [
	/^10\./,
	/^127\./,
	/^169\.254\./,                      // 链路本地，云元数据服务常驻此段
	/^172\.(1[6-9]|2\d|3[01])\./,
	/^192\.168\./,
	/^0\./,
];

/** 判断主机是否指向内网。只能拦住字面量 IP，域名要等解析后才知道。 */
const isPrivateHost = (hostname: string): boolean => {
	const host = hostname.toLowerCase();
	if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) { return true; }

	if (net.isIPv4(host)) {
		return PRIVATE_V4.some((re) => re.test(host));
	}
	if (net.isIPv6(host)) {
		// ::1 回环，fc00::/7 唯一本地，fe80::/10 链路本地
		return host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host);
	}
	return false;
};

const sendErr = (context: IRequestContext, status: number, msg: string, src: string) => {
	sendOnce(context.response, status, {
		'Content-Type': 'application/json;charset=utf-8',
		...corsHeadersFor(context.globalCfg, context.request),
	}, JSON.stringify({ status: 'error', msg, data: src }));
};

export const handler: ICustomHandler = {
	urlPtn: '/api/sandtable/parseImage',
	method: HTTP_GET | HTTP_POST,
	bindFunc: async (context: IRequestContext, data: IRequestData) => {
		const src = data.params.src;
		if (!src) {
			sendErr(context, 400, 'miss src', '');
			return;
		}

		let target: URL;
		try {
			target = new URL(src);
		} catch {
			sendErr(context, 400, 'invalid src', src);
			return;
		}

		if (target.protocol !== 'http:' && target.protocol !== 'https:') {
			sendErr(context, 400, 'only http/https allowed', src);
			return;
		}
		if (isPrivateHost(target.hostname)) {
			console.warn(`⚠️  parseImage 拒绝内网目标: ${target.hostname}`);
			sendErr(context, 403, 'target not allowed', src);
			return;
		}

		await new Promise<void>((resolve) => {
			let settled = false;
			const done = () => { if (!settled) { settled = true; resolve(); } };

			const onResponse = (res: http.IncomingMessage) => {
				const buffers: Buffer[] = [];
				res.on('data', (chunk: Buffer) => { buffers.push(chunk); });
				res.on('end', () => {
					const body = Buffer.concat(buffers);
					// 这里一律走 sendOnce：超时分支可能已经响应过了，
					// 此刻再 writeHead 会抛 ERR_HTTP_HEADERS_SENT、
					// 再 end(body) 会触发 ERR_STREAM_WRITE_AFTER_END 并搞挂进程。
					if (res.statusCode !== 200) {
						console.error(`parseImage 上游返回 ${res.statusCode}: ${src}`);
						sendOnce(context.response, 502, {
							'Content-Type': 'text/plain;charset=utf-8',
							...corsHeadersFor(context.globalCfg, context.request),
						}, `Err on get : ${src}\n   upstream code: ${res.statusCode}`);
					} else {
						sendOnce(context.response, 200, {
							'Content-Type': res.headers['content-type'] || 'application/octet-stream',
							'Cache-Control': 'private,maxage=36000',
							...corsHeadersFor(context.globalCfg, context.request),
						}, body);
					}
					done();
				});
				res.on('error', (err: Error) => {
					console.error(`parseImage 响应流异常 ${src}:`, err.message);
					sendErr(context, 502, 'image fetch failed', src);
					done();
				});
			};

			const request = target.protocol === 'https:'
				? https.get(src, { agent: new https.Agent({ rejectUnauthorized: false, keepAlive: true }) }, onResponse)
				: http.get(src, onResponse);

			request.on('error', (err: Error) => {
				console.error(`parseImage 请求异常 ${src}:`, err.message);
				sendErr(context, 502, 'image request failed', src);
				done();
			});
			request.setTimeout(15000, () => {
				request.destroy();
				sendErr(context, 504, 'image request timeout', src);
				done();
			});
		});
	}
};
