import { PageConfig, SiteConfig, WebHtmlPage } from '@jade-dungeon/jade-utils/web-html-page';

// 导航栏模板在库侧，要全局脚本的那些在 3rdLibTool.ts，见第 18 节的决定 6 / 14
import { BootStrapTemplate } from '@jade-dungeon/jade-utils/bootstrap-template';
import { SyntaxHighlighterHelper, MathJaxHelper, BootStrapHelper, DataTableHelper } from '../3rdLibTool.js';

import { WebUtil } from '@jade-dungeon/jade-utils/web';

import { JADE_DUNGEON_SITE } from '../site.config.js';

/**
 * Wiki 页面的配置
 *
 * 这三项原来写死在 `initWikiPage()` 的函数体里，且 `hlCodePath` 指向的是
 * **本项目之外**的 vimwiki 项目目录（`../../vimwiki-theme/...`）。
 * 按 `docs/refactor-20261101.md` 第 4.2 节改成可注入，默认值保持原样 ——
 * 那边的调用不用动。
 *
 * 全部字段可选，缺的项走 {@link DEFAULT_WIKI_PAGE_CONFIG}。
 */
export interface WikiPageConfig {
	/** API 根路径，默认 `/` */
	apiRoot?: string;
	/** 页面标题，用于标出当前导航项，默认 `Study Notes` */
	pageTitle?: string;
	/**
	 * SyntaxHighlighter 的 brush 脚本目录，相对 `basePath`，不带尾斜杠。
	 *
	 * 默认值指向 vimwiki 项目的位置。**换站点时这一项一定要传** ——
	 * 路径不对时 autoloader 不会报错，只是代码高亮静默失效
	 */
	hlCodePath?: string;
	/** AJAX 超时时间（毫秒），默认 500 */
	ajaxTimeout?: number;
}

/** {@link WikiPageConfig} 的默认值，对应本站 vimwiki 的部署结构 */
export const DEFAULT_WIKI_PAGE_CONFIG: Required<WikiPageConfig> = {
	apiRoot:     "/",
	pageTitle:   "Study Notes",
	hlCodePath:  "../../vimwiki-theme/3rd/SyntaxHighlighter/2.1.364/scripts",
	ajaxTimeout: 500,
};

/**
 * Wiki 页面
 *
 * 组织 Wiki 页面的完整初始化流程，包括导航、代码高亮、数学公式、
 * 图片查看、DataTable 以及目录面板的交互。
 */
export class WikiPage {

	/**
	 * Wiki 页面初始化入口
	 *
	 * @param basePath - 站点根路径前缀，用于加载 SyntaxHighlighter 脚本
	 * @param title - 页面副标题
	 * @param site - 站点配置（品牌名、导航树、主题列表），默认本站的 `JADE_DUNGEON_SITE`
	 * @param opt - 页面配置（API 根路径、标题、brush 脚本目录），
	 *              缺省项走 {@link DEFAULT_WIKI_PAGE_CONFIG}
	 * @returns {Promise<void>}
	 *
	 * 后两个形参都放在末尾、都带默认值 —— 调用方在另一个 vimwiki 项目里，
	 * 那边不改调用也能继续跑
	 */
	static async initWikiPage(basePath: string, title: string,
		site: SiteConfig = JADE_DUNGEON_SITE, opt: WikiPageConfig = {}) //
	{
		const o = { ...DEFAULT_WIKI_PAGE_CONFIG, ...opt };

		// 注册 `esp-unicode` 标签，页面里已有的该标签会在注册时被 upgrade
		WebUtil.initCustomElements();

		let cfg: PageConfig = {
			apiRoot: o.apiRoot, pageTitle: o.pageTitle,
			subTitle: title, ajaxTimeout: o.ajaxTimeout,
		};
		let page = new WebHtmlPage(cfg);
		page.renderSubTitle();
		// 页面是 Bootstrap 3 的，所以显式传 BS3 的导航栏模板
		page.renderTopNav(site, "#topnav", BootStrapTemplate.renderTopNav);

		//
		DataTableHelper.bindInitDataTable();

		//
		page.bindImageNewTab("img.img-newwin");

		//
		BootStrapHelper.initPhotoFrame("photo-frame");
		//
		BootStrapHelper.bindImageFrame("img.img-frame");
		//
		SyntaxHighlighterHelper.loadCodeHightlight(basePath, o.hlCodePath);
		//
		MathJaxHelper.initMathJax();
		//
		let tocOri = document.querySelector<HTMLElement>("div.toc");
		if (null != tocOri) {
			WebHtmlPage.prepareTocIndex(tocOri.innerHTML, "div.sideTocIdx" );
			tocOri.remove();
		}
		//
		WebHtmlPage.bindOnClick('#tocLevBtn' ,  () => {page.toggleSideTocContract("div.sideTocIdx")});
		WebHtmlPage.bindOnClick('#tocLevBtn2',  () => {page.toggleSideTocContract("div.sideTocIdx")});
		WebHtmlPage.bindOnClick('#tocBoxBtn' ,  () => {page.toggleSideTocWrap    ("div.sideTocIdx", 90, "div.sideToc")});
		WebHtmlPage.bindOnClick('#tocBoxBtn2',  () => {page.toggleSideTocWrap    ("div.sideTocIdx", 80, "div.sideToc")});

		let changeTocWithWindow = () => {
			page.changeTocPanelSize("div#sideTocIdxTree" , 80);
			page.changeTocPanelSize("div#floatTocIdxTree", 90);
		};

		window.addEventListener('resize', changeTocWithWindow);

		page.initUITheme();
		page.bindChangeTheme(site.themes);

		// 调整一下目录列表的大小
		changeTocWithWindow();
	}

}
