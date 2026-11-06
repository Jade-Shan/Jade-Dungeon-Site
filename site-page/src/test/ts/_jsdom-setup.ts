/**
 * jsdom 环境装配
 *
 * 被测模块读取 `document` / `location` 这些全局是在**方法调用时**，不是模块加载时
 * （这是之前专门改过的，见 design-pkg.md 的「顶层 DOM 求值」一节）。
 * 所以这里不需要在 import 之前装配，测试用例里按需调用即可。
 *
 * 用法：
 * ```typescript
 * import { withDom } from './_jsdom-setup.js';
 *
 * test('xxx', () => {
 *   withDom('<div id="a"></div>', () => {
 *     // 这里 document 可用
 *   });
 * });
 * ```
 */
import { JSDOM } from 'jsdom';

/** 装配时被覆盖的全局名，退出时要逐个还原 */
const PATCHED = [
	'window', 'document', 'location', 'navigator',
	'HTMLElement', 'HTMLImageElement', 'HTMLInputElement', 'HTMLAnchorElement',
	// Image 是 HTMLImageElement 的构造器别名，**两个都要装** ——
	// Node 全局没有 Image（实测 undefined），而 `new Image()` 是
	// SandTableUtils.loadImageResources() 的写法，缺了直接 ReferenceError
	'Image',
	'customElements', 'Node', 'NodeList', 'Element', 'Event', 'MouseEvent',
	'Blob', 'URL', 'XMLHttpRequest', 'IntersectionObserver', 'FileReader',
] as const;

/** 默认的页面地址。cookie 相关的测试需要一个非 about:blank 的源 */
const DEFAULT_URL = 'http://localhost/';

type Globals = Record<string, unknown>;

/**
 * 在一个临时的 jsdom 环境里执行 `fn`，结束后还原所有被覆盖的全局
 *
 * 每次调用都新建一个 DOM，所以用例之间不会通过 document 或 cookie 互相影响。
 *
 * @param html - body 的初始 HTML
 * @param fn - 在 DOM 环境里跑的函数
 * @param url - 页面地址，默认 `http://localhost/`
 * @returns {T} `fn` 的返回值
 */
export function withDom<T>(html: string, fn: (dom: JSDOM) => T,
	url: string = DEFAULT_URL): T //
{
	const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`, {
		url: url,
		// 不执行页面里的 <script>，测试只需要 DOM 结构
		runScripts: 'outside-only',
		pretendToBeVisual: true,
	});

	const restore = installGlobals(dom);
	try {
		return fn(dom);
	} finally {
		restore();
		dom.window.close();
	}
}

/**
 * 把 jsdom 的全局装到 globalThis 上，返回还原函数
 *
 * 用 `Object.defineProperty` 而不是直接赋值：Node 21+ 自带只读的 `navigator`
 * （只有 getter），直接赋值会抛 `Cannot set property navigator`。
 */
function installGlobals(dom: JSDOM): () => void {
	const g = globalThis as unknown as Globals;
	/** 装配前的属性描述符，null 表示原本不存在 */
	const saved = new Map<string, PropertyDescriptor | null>();

	for (const key of PATCHED) {
		const v = (dom.window as unknown as Globals)[key];
		// jsdom 没有的全局（如 IntersectionObserver）保持原样，由用例自己塞
		if (v === undefined) { continue; }
		saved.set(key, Object.getOwnPropertyDescriptor(g, key) ?? null);
		Object.defineProperty(g, key, {
			value: v, writable: true, configurable: true, enumerable: true,
		});
	}

	return () => {
		for (const [key, desc] of saved) {
			if (desc) { Object.defineProperty(g, key, desc); }
			else { delete g[key]; }
		}
	};
}

/**
 * `withDom` 的异步版本
 *
 * 注意全局会在 `fn` 的 promise 落定后才还原。所以同一时刻只能有一个
 * `withDomAsync` 在跑 —— 并发调用会互相覆盖全局。测试用例默认是顺序执行的，
 * 不特意开并发就没问题。
 */
/**
 * 把 `Image` 换成会**立即触发事件**的桩
 *
 * ## 为什么必须桩
 *
 * **jsdom 默认不加载图片，`onload` 和 `onerror` 都不触发**（实测 500ms 后
 * 两个都没来）。而 `WebUtil.loadImageByProxy()` 是 `await` 一个由这两个事件
 * 落定的 Promise —— 所以在 jsdom 里它**永久挂起**，
 * `node --test` 报 `Promise resolution is still pending but the event loop
 * has already resolved`，整个 suite 被 `cancelledByParent`。
 *
 * 开 jsdom 的 `resources: 'usable'` 能让事件真的触发，但那会发**真实网络请求**，
 * 单元测试不该依赖外网。
 *
 * 桩触发的是 `onerror` 而不是 `onload`：
 *
 * - `loadImageByProxy` 的失败分支只是把 `src` 换成内置占位图、**不抛错**
 *   （它内部 `catch` 住了），所以 Promise 正常落定
 * - 也更贴近真实情况 —— 这些测试用的是 `http://img.host/x.jpg` 这类假地址
 *
 * 所以用例能断言的是「元素建出来了、挂到 Token 上了」，
 * **不是**「图片内容对不对」。后者要靠浏览器手动验证。
 *
 * @returns {() => void} 还原函数
 */
export function stubImageLoading(): () => void {
	const g = globalThis as unknown as Globals;
	const saved = Object.getOwnPropertyDescriptor(g, 'Image') ?? null;
	const Real = g.Image as { new(): HTMLImageElement };

	class StubImage {
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;
		onabort: (() => void) | null = null;
		crossOrigin: string | null = null;
		width = 0;
		height = 0;
		private _src = '';

		/** 真实元素，用来让 `instanceof HTMLImageElement` 之类的判断仍然成立 */
		readonly elem: HTMLImageElement = new Real();

		get src(): string { return this._src; }
		set src(v: string) {
			this._src = v;
			// 同步触发会让 `imageElem.src = url` 这一行里就回调，
			// 那时 Promise 的 executor 还没返回。用微任务推到下一拍
			Promise.resolve().then(() => { this.onerror?.(); });
		}

		getAttribute(name: string): string | null {
			return name === 'src' ? this._src : null;
		}
	}

	Object.defineProperty(g, 'Image', {
		value: StubImage, writable: true, configurable: true, enumerable: true,
	});

	return () => {
		if (saved) { Object.defineProperty(g, 'Image', saved); }
		else { delete g.Image; }
	};
}

/**
 * 给**整个测试文件**装一份 jsdom，配 `before` / `after` 钩子用
 *
 * 适用于「文件里几乎每个用例都要 DOM」的情况 —— 比逐个包 {@link withDom}
 * 少一层缩进，也不会漏。用法：
 *
 * ```typescript
 * const dom = installDomForFile();
 * before(dom.setup);
 * after(dom.teardown);
 * ```
 *
 * 代价是**同一文件内的用例共享一个 document**，所以会通过 DOM 和 cookie
 * 互相影响。需要隔离的用例仍然用 {@link withDom} / {@link withDomAsync}。
 *
 * @param html - body 的初始 HTML
 * @param url - 页面地址，默认 `http://localhost/`
 * @returns {{setup: () => void, teardown: () => void}} 两个钩子函数
 */
export function installDomForFile(html = '<div></div>',
	opts: { stubImages?: boolean, url?: string } = {},
): { setup: () => void, teardown: () => void } //
{
	let dom: JSDOM | undefined;
	let restore: (() => void) | undefined;
	let restoreImg: (() => void) | undefined;
	return {
		setup: () => {
			dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`, {
				url: opts.url ?? DEFAULT_URL,
				runScripts: 'outside-only', pretendToBeVisual: true,
			});
			restore = installGlobals(dom);
			// 顺序要紧：先装 jsdom 的全局（里面有真 Image），再用桩盖掉它
			if (opts.stubImages) { restoreImg = stubImageLoading(); }
		},
		teardown: () => {
			restoreImg?.();
			restore?.();
			dom?.window.close();
			dom = undefined;
			restore = undefined;
			restoreImg = undefined;
		},
	};
}

/**
 * `withDom` 的异步版本
 *
 * 注意全局会在 `fn` 的 promise 落定后才还原。所以同一时刻只能有一个
 * `withDomAsync` 在跑 —— 并发调用会互相覆盖全局。测试用例默认是顺序执行的，
 * 不特意开并发就没问题。
 */
export async function withDomAsync<T>(html: string,
	fn: (dom: JSDOM) => Promise<T>, url: string = DEFAULT_URL): Promise<T> //
{
	const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`, {
		url: url, runScripts: 'outside-only', pretendToBeVisual: true,
	});
	const restore = installGlobals(dom);
	try {
		return await fn(dom);
	} finally {
		restore();
		dom.window.close();
	}
}
