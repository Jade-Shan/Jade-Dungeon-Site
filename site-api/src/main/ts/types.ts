import { Express, Request, Response } from 'express';

/**
 * CLI 参数（由 index.ts 用 arg 解析后传给 initGlobalCfg）。
 * 三个值都是 String 类型的可选参数，未传时为 undefined。
 */
export interface ICliArgs {
	readonly '--host'?: string;
	readonly '--port'?: string;
	readonly '--uploadPath'?: string;
}

export interface IGlobalCfg {
	/**
	 * port 是 string：它的三个来源（CLI `--port`、`process.env.PORT`、字面量 `'3000'`）
	 * 全是字符串，`app.listen()` 也接受字符串端口。
	 * 注意 redis 的 port 是 number（硬编码字面量 6379），两者不一致是有意的。
	 */
	readonly server: { readonly hostname: string; readonly port: string };
	/**
	 * Redis 命名连接。`key` 是代码里取连接用的标识（trpg / blog / auth），
	 * `name` 是 ioredis 的 connectionName，仅用于在 Redis `CLIENT LIST` 里识别来源，
	 * 不参与 key 拼接。
	 */
	readonly redis?: readonly { readonly key: string; readonly host: string; readonly port: number; readonly name?: string }[];
	/** SQLite 配置。auth 模块的数据存这里；其他模块仍在 Redis。 */
	readonly sqlite?: { readonly path: string; readonly readPoolSize: number };
	/**
	 * 认证开关。
	 *
	 * `bypass` 为 true 时**登录接口不校验任何凭据**：任意用户名 + 任意密码
	 * 都登录成功，并按该用户名签发一个真 token（落 `auth_token` 表，
	 * 所以 sandtable 那套 `verifyToken` / `authorizeSceneWrite` 照常工作）。
	 *
	 * 这是给 sandtable 在**没法用真验证机的环境**里联调用的临时开关，
	 * 由 `AUTH_BYPASS` 环境变量开启，且 `NODE_ENV=production` 时强制关闭。
	 * 详见 config.ts 里的注释。
	 */
	readonly auth?: { readonly bypass: boolean };
	/**
	 * 允许跨域的 origin 白名单（来自 `CROS_SITE`，逗号分隔）。
	 * 空数组表示放开所有来源。元素是完整 origin，如 `http://example.com:8082`。
	 */
	readonly crosSite?: readonly string[];
	readonly path: { readonly appRootDir: string; readonly staticFile?: readonly { readonly path: string; readonly folder: string }[] };
	readonly upload?: { readonly tmpPath: string; readonly maxSize?: number };
};

/** 上传文件。等价于 `Express.Multer.File`，经 @types/multer 对 Request 的扩展间接取得。 */
export type IUploadedFile = NonNullable<Request['file']>;

/**
 * 传给 handler 的数据载荷。
 *
 * params 的值类型简化为 `string | undefined`：真实的 `request.query`（ParsedQs）
 * 还可能是 `string[]` 或嵌套对象，但现有 handler 一律按单个字符串使用。
 * 若将来有 handler 需要处理数组参数，再按需放宽。
 */
export interface IRequestData {
	params: Record<string, string | undefined>;
	cookies: Record<string, string>;
	files: IUploadedFile[];
}

export interface IRequestContext {
	globalCfg: IGlobalCfg;
	application: Express;
	request: Request;
	response: Response;
}

export const HTTP_GET = 1;
export const HTTP_POST = 2;

export interface ICustomHandler {
	urlPtn: string;
	/** 位掩码：HTTP_GET / HTTP_POST / 两者组合 `HTTP_GET | HTTP_POST` */
	method: number;
	/** 返回 `Promise<void>` 是因为现有 handler 多为 async，框架侧会 await */
	bindFunc: (context: IRequestContext, data: IRequestData) => void | Promise<void>;
}


export interface IWeatherRec {
	location: string;
	date: string;
	dayOfWeek: string;
	weatherCode: number;
	weatherDesc: string;
	/** 月相名称，WeatherAPI 原样返回的英文字符串，如 `"Waxing Crescent"` */
	moonPhase: string;
	uv: number;
	temp: number;
	tempBodyFeel: number;
	tempMin: number;
	tempMax: number;
	atmPressure: number;
	windSpeed: number;
	windDir: string;
	humedPct: number;
	preciPct: number;
	sunrise: string;
	sunset: string;
}
