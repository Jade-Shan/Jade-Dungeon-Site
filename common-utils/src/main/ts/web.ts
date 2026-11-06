import { StrUtil, TimeUtil } from './basic.js';
import { SimpleMap } from './dataStructure.js';


/**
 * 自定义标签 `esp-unicode` 的元素类型，用于显示Unicode字符
 *
 * 仅为类型声明，编译后被擦除；标签的实现在 {@link WebUtil.initCustomElements} 中定义，
 * 以免模块加载期求值 `HTMLElement` 而污染无 DOM 的运行环境
 */
export type IEscapeUnicode = HTMLElement;

/**
 * 规范可以使用的图标大小
 */
export enum IconSize { x12, x16, x24, x32, x48 };
/**
 * Base64图片的类型
 */
export enum Base64ImgType {
	BASE64_JPG = "data:image/jpeg;base64",
	BASE64_PNG = "data:image/png;base64",
};
/**
 * Base64格式的图片
 */
export type IBase64Img = { format: Base64ImgType, data: string };

/**
 * HTTP 请求选项
 */
export interface HttpRequestOption {
	/** 是否忽略缓存 */
	ignoreCache    ?: boolean;
	/** 自定义请求头 */
	headers        ?: SimpleMap<string, string>;
	/** 超时时间（毫秒），默认 30000 */
	timeout        ?: number;
	/** 是否携带跨域凭证 */
	withCredentials?: boolean;
}

/**
 * HTTP 请求定义
 * @typeParam T - 请求体类型
 */
export interface HttpRequest<T> {
	/** HTTP 方法，默认 GET */
	method ?: ("GET" | "POST");
	/** 请求 URL */
	url     : string;
	/** 请求选项 */
	opt    ?: HttpRequestOption;
	/** 请求体 */
	body   ?: T;
}

/**
 * HTTP 响应
 * @typeParam T - 响应体类型
 */
export interface HttpResponse<T> {
	/** HTTP 状态码 */
	statusCode: number;
	/** HTTP 状态消息 */
	statusMsg : string;
	/** 响应头 */
	headers  ?: SimpleMap<string, string>;
	/** 响应体，失败时为 null */
	body      : T | null;
}

/**
 * HTTP 请求事件处理器
 * @typeParam T - 请求体类型
 * @typeParam R - 响应体类型
 */
export interface HttpRequestHandler<T, R> {
	/** 请求成功回调 */
	onLoad    ?: (evt: ProgressEvent, xhr: XMLHttpRequest, req: HttpRequest<T>) => HttpResponse<R>;
	/** 进度回调 */
	onProgress?: (evt: ProgressEvent, xhr: XMLHttpRequest, req: HttpRequest<T>) => HttpResponse<R>;
	/** 超时回调 */
	onTimeout ?: (evt: ProgressEvent, xhr: XMLHttpRequest, req: HttpRequest<T>) => HttpResponse<R>;
	/** 中止回调 */
	onAbort   ?: (evt: ProgressEvent, xhr: XMLHttpRequest, req: HttpRequest<T>) => HttpResponse<R>;
	/** 错误回调 */
	onError   ?: (evt: ProgressEvent, xhr: XMLHttpRequest, req: HttpRequest<T>) => HttpResponse<R>;
}


/**
 * 内部 HTTP 请求执行函数
 *
 * @param req - HTTP 请求定义
 * @param hdl - 可选的事件处理器
 * @returns {Promise<HttpResponse<R>>} 响应 Promise
 */
function doHttp<T, R>(req: HttpRequest<T>, //
	hdl?: HttpRequestHandler<T, R>): Promise<HttpResponse<R>> // 
{
	return new Promise<HttpResponse<R>>((resolve, reject) => {
		let xhr = new XMLHttpRequest();
		let method = req.method ? req.method : "GET";
		xhr.open(method, req.url);
		xhr.withCredentials = req.opt?.withCredentials ? req.opt?.withCredentials : false;
		if (req.opt?.ignoreCache) {
			xhr.setRequestHeader('Cache-Control', 'no-cache');
		}
		if (req.opt?.headers) {
			for (let i = 0; i < req.opt.headers.size(); i++) {
				let hh = req.opt.headers.getElementByIndex(i);
				if (hh) {
					xhr.setRequestHeader(hh[0], hh[1]);
				}
			}
		}
		xhr.timeout = req.opt?.timeout ? req.opt.timeout : 30_000;
		//
		let onload     = hdl?.onLoad;
		let onprogress = hdl?.onProgress;
		let onerror    = hdl?.onError;
		let ontimeout  = hdl?.onTimeout;
		let onabort    = hdl?.onAbort;

		if (onprogress) { xhr.onprogress = (evt: ProgressEvent) => { onprogress(evt, xhr, req); }; }
		xhr.onload = (evt: ProgressEvent) => {
			if (onload) { resolve(onload(evt, xhr, req)); }
			else { resolve({ statusCode: xhr.status, statusMsg: xhr.statusText, body: xhr.response as unknown as R }); }
		};
		xhr.onerror   = (evt: ProgressEvent) => { reject(onerror   ? onerror  (evt, xhr, req) : { statusCode: xhr.status, statusMsg: xhr.statusText, body: xhr.response as unknown as R }); };
		xhr.ontimeout = (evt: ProgressEvent) => { reject(ontimeout ? ontimeout(evt, xhr, req) : { statusCode: xhr.status, statusMsg: xhr.statusText, body: xhr.response as unknown as R }); };
		xhr.onabort   = (evt: ProgressEvent) => { reject(onabort   ? onabort  (evt, xhr, req) : { statusCode: xhr.status, statusMsg: xhr.statusText, body: xhr.response as unknown as R }); };

		xhr.send(req.body as XMLHttpRequestBodyInit);
	});
}

/** 默认占位图片（Base64 编码的 1x1 灰色 JPEG） */
let defaultImgData = 'data:image/jpeg;base64,' +
	'/9j/4AAQSkZJRgABAQEASABIAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc' +
	'4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2' +
	'NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wgARCAAyADIDAREAAhEBAxEB/8QAGQAAAgMBAAAAAAAAAAAAAAAAAAQCAwUB/' +
	'8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEAMQAAAB3CoiXnTp0iZJYIEjcLSIuXFIuaJ0gJmeMjY0BEQECRpD' +
	'YHCozRkaLQAAAAA//8QAIBAAAgICAgIDAAAAAAAAAAAAAgMAARESBBATIBQhMP/aAAgBAQABBQKGwAi3AyZmfR1IAkD' +
	'HCZkKjqLvI9MELlQ6BsXxAGVWOrlrzd/J20bAbt6ctRtAuIeF02lrr67YOw+F1ylFUEcfl//EABQRAQAAAAAAAAAAAA' +
	'AAAAAAAFD/2gAIAQMBAT8BR//EABQRAQAAAAAAAAAAAAAAAAAAAFD/2gAIAQIBAT8BR//EACQQAAEDBAEDBQAAAAAAA' +
	'AAAAAEAAhEDEiAiECEwMUFRYYGR/9oACAEBAAY/Als6FqcpqeSpZ4UvdaFNKvchzvwWOxvLoPp8LV4V9RwuHtiAwrVo' +
	'/VFX6x6GFtVMKJ7f/8QAIBABAAICAgIDAQAAAAAAAAAAAQARITEQUSBhMEFxgf/aAAgBAQABPyGC4osc9SptOF85yP8' +
	'ASELu9k31VCyrxGy4jnfIIAfXcAGNQyg+onen6RgCjhULGfDIZt33e4VBGkgsKp8AeFORdwu77HHl1DswgUeCsWO4ur' +
	'8SAGQ+Mf/aAAwDAQACAAMAAAAQkkkgEEEEgAgEEggEAkEEEAAAn//EABQRAQAAAAAAAAAAAAAAAAAAAFD/2gAIAQMBA' +
	'T8QR//EABQRAQAAAAAAAAAAAAAAAAAAAFD/2gAIAQIBAT8QR//EACEQAQACAgICAgMAAAAAAAAAAAEAESFBEDFRYSCh' +
	'gZHR/9oACAEBAAE/EOiWr1a5jXtWKigBL1b3C3SMLcvLT9o/kF1zF1M2HJKCGADILfUUMUZrzwwkAuFtAQABgh1KF27' +
	'PcBERbSP3AAUHFCFoRshUeovIE8dfhE5nBas2LuI2cBxLiWTKBWkBOoiFCP3KJmwGUyDua4I8TSNM9uhtMRg2r2yick' +
	'18N8f/2Q==';

/**
 * 图片代理配置
 */
export interface ImageProxyConfig {
	/** 代理服务器 URL */
	proxyUrl  ?: string, 
	/** 自定义代理 URL 生成函数 */
	proxyFunc ?: (url: string) => string 
};

/**
 * 图片懒加载配置
 */
export interface LazyImageConfig {
	/** 存放真实图片地址的属性名，默认 `data-origin` */
	originAttr ?: string,
	/** 提前加载的距离，默认 `"200px"`，即图片距可视区还有 200px 时就开始加载 */
	rootMargin ?: string
};

/**
 * Web 工具类
 *
 * 提供 HTTP 请求、Cookie 操作、图片处理、文件下载、表单验证等通用功能。
 */
export class WebUtil {

	/**
	 * 发送 HTTP 请求
	 *
	 * @param req - 请求定义
	 * @param hdl - 可选的事件处理器
	 * @returns {Promise<HttpResponse<R>>} 响应 Promise
	 */
	static async requestHttp<T, R>(req: HttpRequest<T>, //
		hdl?: HttpRequestHandler<T, R>): Promise<HttpResponse<R>> // 
	{
		return await doHttp<T, R>(req, hdl);
	}

		/**
	 * 解析图片 URL，判断是否跨源，并给出绝对形式
	 *
	 * 代理存在的目的是绕开跨源图片对 canvas 的污染（污染后 `getImageData()` 会抛错），
	 * 所以判定标准应该是「是否跨源」，而不是「URL 长什么样」。
	 *
	 * 用 `new URL(url, location.href)` 解析后比对 origin，三种写法都能正确识别：
	 *
	 * | 写法 | 例子 | 结果 |
	 * |------|------|------|
	 * | 绝对 URL | `http://other.com/x.jpg` | 跨源则走代理 |
	 * | 协议相对 | `//other.com/x.jpg` | 跨源则走代理 |
	 * | 路径相对 | `/themes/x.jpg` | 同源，不走代理 |
	 *
	 * 同时返回 `absUrl`（补全协议后的绝对地址），交给代理用。协议相对的
	 * `//host/path` 直接丢给后端，后端多半解析不了（Python urllib 会报
	 * `unknown url type`），所以要先在前端补全。
	 *
	 * `data:` / `blob:` 不发网络请求，直接视为同源。
	 *
	 * @param url - 图片 URL
	 * @returns {{isCrossOrigin: boolean, absUrl: string}} 跨源标记与绝对地址。
	 *          解析失败时 `isCrossOrigin` 为 false、`absUrl` 为原值
	 */
	private static resolveImageUrl(url: string): { isCrossOrigin: boolean, absUrl: string } {
		if (!url) { return { isCrossOrigin: false, absUrl: url }; }
		// data: / blob: 是内联数据，不涉及跨源
		if (url.startsWith('data:') || url.startsWith('blob:')) {
			return { isCrossOrigin: false, absUrl: url };
		}
		try {
			const parsed = new URL(url, location.href);
			return { isCrossOrigin: parsed.origin !== location.origin, absUrl: parsed.href };
		} catch (e) {
			// 解析不了的 URL 按同源处理，交给浏览器自己报错，不要套上代理前缀
			console.warn(`resolveImageUrl: 无法解析的 URL，按同源处理: ${url}`);
			return { isCrossOrigin: false, absUrl: url };
		}
	}

	/**
	 * 通过代理加载图片，加载失败时使用默认占位图
	 *
	 * 只有跨源图片才会套上 `cfg.proxyUrl` 前缀。需要无条件走代理（比如用代理做图片
	 * 变换而不只是绕跨源）时，传 `cfg.proxyFunc` 自己决定。
	 *
	 * @param imageElem - 图片元素
	 * @param oriImageUrl - 原始图片 URL
	 * @param cfg - 代理配置
	 * @returns {Promise<void>}
	 */
	static async loadImageByProxy(imageElem: HTMLImageElement, oriImageUrl: string, //
		cfg?: ImageProxyConfig): Promise<void> //
	{
		let proxyFunc = cfg?.proxyFunc ? cfg.proxyFunc : (url: string) => {
			const { isCrossOrigin, absUrl } = WebUtil.resolveImageUrl(url);
			if (cfg?.proxyUrl && isCrossOrigin) {
				// 传绝对地址给代理，后端不用再猜协议
				return cfg.proxyUrl + encodeURIComponent(absUrl);
			}
			return url;
		};
		let imageUrl = proxyFunc(oriImageUrl);
		let pm = new Promise((
			resolve: (param: {elem: HTMLImageElement, url: string}) => void,
			 reject: (param: {elem: HTMLImageElement, url: string}) => void//
		) => {
			imageElem.onload  = () => { resolve({elem: imageElem, url: imageUrl}); };
			imageElem.onabort = () => {  reject({elem: imageElem, url: imageUrl}); };
			imageElem.onerror = () => {  reject({elem: imageElem, url: imageUrl}); };
			imageElem.src = imageUrl;
			imageElem.crossOrigin = 'Anonymous';
		});
		await pm.catch((param) => {
			param.elem.src = defaultImgData;
			param.elem.crossOrigin = 'Anonymous';
		});
	}

	/**
	 * 图片懒加载：元素进入可视区域后，才把真实地址写入 `src`
	 *
	 * 图片先用占位图渲染，真实地址放在 `data-origin` 属性里。滚动到可视区域
	 * 附近时才换成真实地址，避免一次性发起整页的图片请求。换好地址的图片会
	 * 立即取消监听，但 `data-origin` 保留，供点击放大等逻辑取原图地址。
	 *
	 * 浏览器不支持 `IntersectionObserver` 时直接全部加载，退化为原来的行为。
	 *
	 * @param elemSlt - 图片元素的 CSS 选择器或元素列表，默认 `img[data-origin]`
	 * @param cfg - 懒加载配置
	 * @returns {IntersectionObserver | null} 监听器，不支持或无需监听时返回 null。
	 *          调用方替换掉这批图片所在的 DOM 时，应调用其 `disconnect()`，
	 *          否则监听器会一直持有已经移除的元素
	 */
	static lazyLoadImages(elemSlt: string | NodeListOf<HTMLImageElement> = 'img[data-origin]',
		cfg?: LazyImageConfig): IntersectionObserver | null //
	{
		const originAttr = cfg?.originAttr ?? 'data-origin';
		const rootMargin = cfg?.rootMargin ?? '200px';
		const elemArr = typeof elemSlt === 'string'
			? document.querySelectorAll<HTMLImageElement>(elemSlt) : elemSlt;

		/** 把真实地址写入 src，没有 data-origin 的元素不动 */
		const loadOrigin = (img: HTMLImageElement): void => {
			const origin = img.getAttribute(originAttr);
			if (origin) { img.src = origin; }
		};

		// 不支持 IntersectionObserver 的浏览器直接全部加载
		if (typeof IntersectionObserver === 'undefined') {
			elemArr.forEach(loadOrigin);
			return null;
		}

		const observer = new IntersectionObserver((entries, obs) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) { continue; }
				const img = entry.target as HTMLImageElement;
				loadOrigin(img);
				obs.unobserve(img);  // 已经换成真实地址，不用再监听
			}
		}, {rootMargin: rootMargin});

		elemArr.forEach((img: HTMLImageElement) => { observer.observe(img); });
		return observer;
	}


	/**
	 * 创建自定义标签，用于显示Unicode字符
	 *
	 * 类定义放在方法内部，只在调用时（浏览器环境）才求值 `HTMLElement`，
	 * 避免模块顶层求值导致无 DOM 的环境（Node / SSR）import 即抛 `ReferenceError`
	 *
	 * 可重复调用：标签已注册时直接返回，避免 `customElements.define()` 抛
	 * `NotSupportedError`
	 */
	static initCustomElements(): void {
		// 已注册过就不再重复注册
		if (undefined !== customElements.get('esp-unicode')) { return; }
		/** 创建自定义标签，用于显示Unicode字符 */
		class EscapeUnicode extends HTMLElement {
			constructor() {
				super();
				let oldHtml = this.innerHTML;
				// 带 `g` 标志，一个标签里的多个转义实体要全部还原
				this.innerHTML = oldHtml.replace(/&amp;(#x?[0-9a-fA-F]{1,6};)/g, "&$1");
			}
		}
		/** 创建自定义标签必须要有一个连字符*/
		customElements.define('esp-unicode', EscapeUnicode);
	}

	/**
	 * 以16进制显示字符的Unicode编码
	 *
	 * @param c - 要转换的字符
	 * @returns {string} HTML 标签字符串
	 */
	static transUnicodeWikiInHex(c: string): string {
		// `page.transUnicodeWikiInHex('⛵')`
		//  `"<esp-unicode>&#x26f5;</esp-unicode>"`
		return "<esp-unicode>&#x" + c.codePointAt(0)!.toString(16) + ";</esp-unicode>";
	}

	/**
	 * 以10进制显示字符的Unicode编码
	 *
	 * @param c - 要转换的字符
	 * @returns {string} HTML 标签字符串
	 */
	static transUnicodeWikiInDec(c: string): string {
		// `page.transUnicodeWikiInDec('⛵')`
		//   `"<esp-unicode>&#9973;</esp-unicode>"`
		return "<esp-unicode>&#" + c.codePointAt(0)! + ";</esp-unicode>";
	}

	/**
	 * 图像Base64转为html img 的src
	 * @param base64Img 图像的Base64
	 * @returns src格式
	 */
	static transBase64ImgSrc(base64Img: IBase64Img): string { return `${base64Img.format},${base64Img.data}` }

	/**
	 * 图像Base64转为html 的URL
	 * @param base64Img 图像的Base64
	 * @returns src格式
	 */
	static transBase64ImgURL(base64Img: IBase64Img): string { return `url('${this.transBase64ImgSrc(base64Img)}')` }

	/**
	 * 通过动态创建 <a> 标签实现页面导航
	 *
	 * @param url - 目标 URL
	 * @param target - 打开方式（如 _blank），不指定时在当前窗口打开
	 * @returns {void}
	 */
	private static navigateUrl(url: string, target?: string): void {
		let el = document.createElement("a");
		document.body.appendChild(el);
		el.href = url;
		if (target) {
			el.target = target;
		}
		el.click();
		el.remove();
	}

	/**
	 * 在当前窗口跳转到指定 URL
	 *
	 * @param url - 目标 URL
	 * @returns {void}
	 */
	static goUrl(url: string): void {
		this.navigateUrl(url);
	}

	/**
	 * 在新窗口打开指定 URL
	 *
	 * @param url - 目标 URL
	 * @returns {void}
	 */
	static openWindow(url: string): void {
		this.navigateUrl(url, '_blank');
	}

	/**
	 * 生成 HTTP Basic 认证头
	 *
	 * @param username - 用户名
	 * @param password - 密码
	 * @returns {string} Authorization 头的值，如 "Basic xxx"
	 */
	static webAuthBasic(username: string, password: string): string {
		let encodeStr = StrUtil.base64encode(StrUtil.utf16to8(`${username}:${password}`));
		return `Basic ${encodeStr}`;
	}


	/**
	 * 读取指定名称的 Cookie 值
	 *
	 * @param name - Cookie 名称
	 * @returns {string} Cookie 值，不存在时返回空字符串
	 */
	static loadCookieValue(name: string): string {
		let cookieValue: string = "";
		if (document.cookie && document.cookie !== '') {
			let cookies = document.cookie.split(';');
			for (let i = 0; i < cookies.length; i++) {
				let cookie = cookies[i].trim();
				if (cookie.substring(0, name.length + 1) === (name + '=')) {
					cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
					break;
				}
			}
		}
		return cookieValue;
	}

	/**
	 * 删除指定名称的 Cookie
	 *
	 * @param name - Cookie 名称
	 * @returns {void}
	 */
	static deleteCookie(name: string): void {
		let d = new Date();
		d.setTime(d.getTime() + ((-1 * TimeUtil.UNIT_DAY)));
		document.cookie = `${name}=;expires=${d.toUTCString()};path=/`;
	}

	/**
	 * 设置 Cookie
	 *
	 * @param name - Cookie 名称
	 * @param value - Cookie 值
	 * @param rec - Cookie 属性配置（过期天数、路径、域名、SameSite、Secure）
	 * @returns {void}
	 */
	static setCookieValue(name: string, value: string, rec: {
		expireDays?: number,
		path?: string, domain?: string, secure?: boolean, sameSite?: string
	}): void {
		if (!value) {
			return;
		}
		rec.expireDays = rec.expireDays ? rec.expireDays : 30   ;
		rec.path       = rec.path       ? rec.path       : ""   ;
		rec.domain     = rec.domain     ? rec.domain     : ""   ;
		rec.sameSite   = rec.sameSite   ? rec.sameSite   : "Lax";
		rec.secure     = rec.secure     ? rec.secure     : false;

		if ("None" === rec.sameSite) {
			rec.secure = true;
		} else if ("Lax" != rec.sameSite && "Strict" != rec.sameSite) {
			rec.sameSite = "Lax";
		}
		//
		let expireStr   = `;expires=${(new Date((new Date()).getTime() + (rec.expireDays * TimeUtil.UNIT_DAY))).toUTCString()}`;
		let pathStr     = rec.path     ? `;path=${rec.path}`         : '';
		let domainStr   = rec.domain   ? `;domain=${rec.domain}`     : '';
		let sameSiteStr = rec.sameSite ? `;SameSite=${rec.sameSite}` : '';
		let secureStr   = rec.secure   ? `;secure`                   : '';
		document.cookie = `${name}=${encodeURIComponent(value)}${expireStr}${pathStr}${domainStr}${sameSiteStr}${secureStr}`;


	}

	/**
	 * 验证用户名：中文字、英文字母、数字，以中文或字母开头
	 *
	 * @param username - 用户名字符串
	 * @returns {boolean} 格式正确时返回 true
	 */
	static checkUsername(username: string): boolean {
		return /^[\u4e00-\u9fa5a-z][\u4e00-\u9fa5a-z0-9 ]+$/i.test(username);
	}

	/**
	 * 验证中国大陆手机号（1[3-9]xxxxxxxxx）
	 *
	 * @param phoneno - 手机号字符串
	 * @returns {boolean} 格式正确时返回 true
	 */
	static checkMobile_zh_CN(phoneno: string): boolean {
		return /^1[3-9]\d{9}$/.test(phoneno);
	}


	/**
	 * 按文件扩展名检查是否是图片（jpg/jpeg/gif/png/bmp/webp/svg）
	 *
	 * @param postfix - 文件名或扩展名字符串
	 * @returns {boolean} 是图片扩展名时返回 true
	 */
	static checkImageFilePostfix(postfix: string): boolean {
		return /\.(jpg|jpeg|gif|png|bmp|webp|svg)$/i.test(postfix);
	}


	/**
	 * 验证上传图片的文件大小
	 *
	 * @param fileInput - 文件上传 input 元素
	 * @param imgMaxSize - 最大允许的文件大小（字节）
	 * @param onOversize - 超限时的回调
	 * @returns {boolean} 未超限时返回 true
	 */
	static checkImageFileSize(fileInput: HTMLInputElement, imgMaxSize: number,
		onOversize?: (file: File, maxSize: number) => void): boolean {
		const handleOversize = onOversize ?? ((file: File, max: number) => {
			alert(`图片大于${Math.round(max / 1024)}K，请压缩后上传`);
		});
		if (fileInput.files && fileInput.files[0]) {
			let fileList: FileList = fileInput.files;
			for (let i = 0; i < fileList.length; i++) {
				let file: (File | null) = fileList.item(i);
				if (file && file.size > imgMaxSize) {
					handleOversize(file, imgMaxSize);
					return false;
				}
			}
		} else {
			console.error("browser version too old");
			return false;
		}
		return true;
	}

	/**
	 * 从国际化消息映射中获取指定 key 的文本
	 *
	 * @param msgMap - 国际化消息 Map
	 * @param key - 消息键
	 * @returns {string | undefined} 对应的消息文本，不存在时返回 undefined
	 */
	static getI18n(msgMap: Map<string, string>, key: string): (string | undefined) {
		return msgMap.get(key);
	}

	/**
	 * 下载blog文件
	 * 
	 * @param blob Blob文件
	 * @param filename 文件名
	 */
	static downloadBlob(blob: Blob, filename?: string) {
		const fName = filename ? filename : "default.download";
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fName;
		a.click();
		URL.revokeObjectURL(url);
		a.remove();
	}

	/**
	 * 下载blog文件
	 * 
	 * @param content 内容
	 * @param blobOption blob文件配置
	 * @param filename 文件名
	 */
	static downloadBlobContent(content: BlobPart, blobOption?: BlobPropertyBag, filename?: string) {
		const fileName = filename ? filename : `default-${(new Date()).getTime()}.download`;
		const opts = blobOption ? blobOption : { type: "application/octet-stream" };
		const blob = new Blob([content], opts);
		this.downloadBlob(blob, fileName);
	}

	/**
	 * 创建临时对象的URL
	 * 
	 * @param blob Blob 对象
	 * @param idleOption 超时配置
	 * @returns URL字符串
	 */
	static createTmpBlobURL(blob: Blob, idleOption?: IdleRequestOptions): string {
		const url = URL.createObjectURL(blob);
		requestIdleCallback(() => URL.revokeObjectURL(url), idleOption);
		return url;
	}

	/**
	 * 预览本地选择的图片
	 *
	 * @param uploader - 文件上传 input 元素
	 * @param images - 用于显示预览的 Image 元素数组
	 * @returns {void}
	 */
	static previewLocalImage(uploader: HTMLInputElement, images: Array<HTMLImageElement>) {
		uploader.onchange = (ev: Event) => {
			if (uploader.files && uploader.files.length > 0 && images.length > 0) {
				const count = Math.min(uploader.files.length, images.length);
				for (let i = 0; i < count; i++) {
					const file = uploader.files[i];
					const image = images[i];
					if (file) {
						const url = URL.createObjectURL(file);
						image.src = url;
						uploader.onload = () => URL.revokeObjectURL(url);
					}
				}
			}
		}
	}

	/**
	 * 预览远程图片（通过 fetch 加载并转为 blob URL）
	 *
	 * @param url - 图片 URL
	 * @param image - 显示图片的 Image 元素
	 * @returns {void}
	 */
	static previewRemoteImage(url: string, image: HTMLImageElement) {
		fetch(url, { mode: 'cors' }).then(resp => resp.blob()).then(blob => {
			const url = URL.createObjectURL(blob);
			image.src = url;
			image.onload = () => URL.revokeObjectURL(url);
		});
	}

}
