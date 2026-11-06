/**
 * demo / 测试页面的运行时环境配置
 *
 * demo 脚本里原来写死了后端和 CDN 的地址（`www.jade-dungeon.cn:8088` / `:8081`），
 * 导致本地开发时 demo 页面会去打生产环境。现在改为由页面从 `envs.js` 注入：
 *
 * ```
 * envs.js  →  gulp-file-include 的 @@变量  →  HTML 内联脚本  →  入口函数形参
 * ```
 *
 * 本文件**不在** `package.json` 的 `exports` 里 —— 这是 demo 专用的概念，
 * 不随 npm 包对外发布。
 */

/** demo 页面的运行时配置 */
export interface DemoEnvConfig {
	/** 后端 API 根路径。页面传 `@@apiRoot` */
	apiRoot?: string;
	/**
	 * 主题图片根路径。页面传 `@@staticRoot/themes` 拼出来，
	 * `envs.js` 里没有同名键 —— 它就是 `staticRoot` 加 `/themes`，不另设配置项
	 */
	themeRoot?: string;
	/** 第三方库 CDN 根路径。页面传 `@@cdn3rd` */
	cdn3rd?: string;
}

/**
 * 取配置项的值，未传时返回空串
 *
 * 不兜底成生产地址是有意的：兜底会让「页面忘了传参」这个错误静默地变成
 * 「偷偷去打生产环境」。返回空串会让请求打到同源的错误路径上，在控制台里看得见。
 *
 * @param env - 页面注入的配置，可能整个对象都是 undefined
 * @param key - 要取的字段名
 * @returns {string} 配置值，缺失时为空串
 */
export function demoEnv(env: DemoEnvConfig | undefined, key: keyof DemoEnvConfig): string {
	const val = env?.[key];
	return val ? val : "";
}
