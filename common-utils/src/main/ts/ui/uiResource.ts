/**
 * 窗口 UI 的资源注册表
 *
 * `UIWindow.ts` 需要两样资源：窗口图标和桌面背景。原来它直接 import
 * `resource.ts`，而那个文件有 310 行 base64 —— 结果是**只想用窗口管理器的人
 * 也得连带下载 27 KB 图标数据**，而且没有办法换掉。
 *
 * 改成注册表之后，库层只有接口，不含任何图片数据：
 *
 * ```
 * 不注册          →  窗口没图标、桌面没背景图，外观交给 CSS
 * 注册内置的那套  →  registerDefaultUIResource()（在 resource.ts 里，opt-in）
 * 注册自己的      →  registerUIResourceProvider(myProvider)
 * ```
 *
 * 按 `docs/refactor-20261101.md` 第 4.3 节的方案实现。拆包之后
 * `resource.ts` 会成为独立的可选包 `@jade-dungeon/window-ui-icons`，
 * 本文件留在 `window-ui` 包里。
 */
import { IBase64Img, IconSize } from '../web.js';

/** 图标组：同一个图标的五种尺寸 */
export type IconGroup = {
	x12: IBase64Img, x16: IBase64Img, x24: IBase64Img,
	x32: IBase64Img, x48: IBase64Img
};

/** `IconSize` 枚举到 `IconGroup` 字段名的映射 */
const SIZE_KEY: Record<number, keyof IconGroup> = {
	[IconSize.x12]: "x12",
	[IconSize.x16]: "x16",
	[IconSize.x24]: "x24",
	[IconSize.x32]: "x32",
	[IconSize.x48]: "x48",
};

/**
 * 从图标组里按尺寸取一张
 *
 * @param grp - 图标组，`undefined` 时返回 `undefined`
 * @param size - 要取的尺寸
 * @returns {IBase64Img | undefined} 对应尺寸的图片，取不到时 `undefined`
 */
export function pickIconSize(grp: IconGroup | undefined,
	size: IconSize): IBase64Img | undefined //
{
	if (!grp) { return undefined; }
	const key = SIZE_KEY[size];
	return key ? grp[key] : undefined;
}

/**
 * UI 资源提供方
 *
 * 实现这个接口并调用 {@link registerUIResourceProvider} 就能换掉全套图标和背景。
 */
export interface IUIResourceProvider {
	/**
	 * 按名称取图标组
	 *
	 * @param name - 图标名。**省略时返回该 provider 的默认图标** ——
	 *               这样 `UIWindow` 不用知道有哪些图标名存在
	 * @returns {IconGroup | undefined} 图标组，没有这个名字时 `undefined`
	 */
	getIconGroup(name?: string): IconGroup | undefined;

	/**
	 * 取桌面背景图
	 *
	 * @returns {IBase64Img | undefined} 背景图，不提供时 `undefined`（交给 CSS）
	 */
	getDesktopBackground(): IBase64Img | undefined;
}

/** 当前注册的 provider。没注册时是 `undefined`，不是某个内置默认值 */
let provider: IUIResourceProvider | undefined = undefined;

/**
 * 注册 UI 资源提供方
 *
 * 可重复调用，后注册的覆盖先注册的。传 `undefined` 可以注销
 * （单元测试用得上，用例之间不互相影响）。
 *
 * @param p - 资源提供方，`undefined` 表示注销
 * @returns {void}
 */
export function registerUIResourceProvider(p: IUIResourceProvider | undefined): void {
	provider = p;
}

/**
 * 有没有注册过 provider
 *
 * @returns {boolean} 注册过则 true
 */
export function hasUIResourceProvider(): boolean {
	return provider !== undefined;
}

/**
 * 取图标组
 *
 * 没注册 provider 时返回 `undefined`，**不内嵌任何图片数据** ——
 * 这是本模块存在的意义，兜底成某张内置图片就等于没拆。
 *
 * @param name - 图标名，省略时取 provider 的默认图标
 * @returns {IconGroup | undefined} 图标组，没有则 `undefined`
 */
export function getIconGroup(name?: string): IconGroup | undefined {
	return provider?.getIconGroup(name);
}

/**
 * 取桌面背景图
 *
 * @returns {IBase64Img | undefined} 背景图，没有则 `undefined`
 */
export function getDesktopBackground(): IBase64Img | undefined {
	return provider?.getDesktopBackground();
}
