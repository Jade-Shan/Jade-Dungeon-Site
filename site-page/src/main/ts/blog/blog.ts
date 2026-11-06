import { StrUtil } from '@jade-dungeon/jade-utils/basic';
import { SiteConfig } from '@jade-dungeon/jade-utils/web-html-page';
import { WebUtil, HttpResponse } from '@jade-dungeon/jade-utils/web'
import { normalizeApiRoot, blogSelectors, BlogCommon, BlogSelectors } from './common.js';
import { JADE_DUNGEON_SITE } from '../site.config.js';


/**
 * 推荐文章
 */
interface RecommendArticle {
	/** 文章标题 */
	title: string;
	/** 缩略图 URL */
	thumbnail: string;
	/** 文章链接 */
	link: string;
};

/**
 * 推荐文章列表接口响应
 */
interface RecommendArticlesResp {
	/** 响应状态 */
	status: string;
	/**
	 * 推荐文章列表。
	 *
	 * 字段名与后端 API 保持一致。**2026-11-05 跟着后端一起改掉了拼写** ——
	 * 旧后端是 `recommands`（少个 e、多个 a），接口路径也是
	 * `loadRecommandArticles`，现在两处都正了。
	 *
	 * **可选**是照实写的：这个值来自 `JSON.parse`，后端报错时响应里只有
	 * `status`，没有这个字段。写成必填会让调用处的 `?? []` 看起来像废代码
	 */
	recommends?: Array<RecommendArticle>;
};

/**
 * 博客页面
 *
 * 组织博客页面的完整初始化流程，包括用户信息加载、推荐文章列表、
 * 文章分页列表以及主题切换。用户信息、文章渲染和分页列表的公共逻辑
 * 在 `BlogCommon` 中。
 */
export class BlogPage {

	/**
	 * 加载推荐文章列表并渲染到侧栏 Widget
	 *
	 * @param apiRoot - API 根路径
	 * @param slt - 页面选择器，缺省项走 `DEFAULT_BLOG_SELECTORS`
	 * @returns {Promise<void>}
	 */
	static async loadRecommendArticles (apiRoot: string, slt: BlogSelectors = {}) {
		let recoms: HttpResponse<RecommendArticlesResp> = await WebUtil.requestHttp<string, RecommendArticlesResp>({
			method: "GET", url: `${apiRoot}api/blog/loadRecommendArticles`
		}, {
			onLoad: (evt, xhr, req) => {
				let recommends = xhr.responseText ? JSON.parse(xhr.responseText) : null;
				return { statusCode: xhr.status, statusMsg: xhr.statusText, body: recommends };
			},
		});
		let recommends: RecommendArticlesResp = recoms.body ? recoms.body : {
			status: "success", recommends: []
		};
		let html = "";
		// `?? []` 不能省：响应体在但缺 `recommends` 字段时（后端报错、或字段名
		// 对不上）上面那个 `?:` 兜不住 —— 它只在 body 为 null 时才给默认值，
		// 直接 for...of 一个 undefined 会抛错。而这个函数是 initBlogPage() 里
		// Promise.all 的一支，抛了会把用户信息和文章列表一起带走
		for (const t of recommends.recommends ?? []) {
			html += `
				<li><div class="img-text-itm"><div class="item-thumbnail">
					<a href="${StrUtil.escapeHtml(t.link)}" target="_blank"><img class="img-hov" alt="" src="${StrUtil.escapeHtml(t.thumbnail)}" border="0"></a></div><div class="item-title">
					<a href="${StrUtil.escapeHtml(t.link)}">${StrUtil.escapeHtml(t.title)}</a></div></div><div style="clear: both;">
				</div></li>`;
		}
		let tk = document.querySelector(blogSelectors(slt).recommends);
		if (tk) tk.innerHTML = html;
	}

	/**
	 * 加载用户文章列表（分页）并渲染
	 *
	 * @param apiRoot - API 根路径
	 * @param userId - 用户 ID
	 * @param currPage - 当前页码
	 * @param slt - 页面选择器，缺省项走 `DEFAULT_BLOG_SELECTORS`
	 * @returns {Promise<void>}
	 */
	static async loadUserArticles (apiRoot: string, userId: string, currPage: number,
		slt: BlogSelectors = {}) //
	{
		await BlogCommon.loadArticleList(
			page => `${apiRoot}api/blog/loadByUser?userId=${encodeURIComponent(userId)}&page=${page}`,
			currPage, slt,
			// 列表只给摘要，全文点「展开」时按 id 单独取
			id => `${apiRoot}api/blog/getArticle?id=${encodeURIComponent(id)}`);
	}

	/**
	 * 博客页面初始化入口
	 *
	 * @param basePath - 后端 API 根路径。由页面从 `envs.js` 的 `apiRoot` 传入，
	 *                   空值退化为同源根路径 `/`
	 * @param title - 页面副标题
	 * @param userId - 用户 ID，默认为 "teo"
	 * @param currPage - 当前页码，默认第 1 页
	 * @param site - 站点配置（品牌名、导航树、主题列表），默认本站的 `JADE_DUNGEON_SITE`
	 * @param slt - 页面选择器，缺省项走 `DEFAULT_BLOG_SELECTORS`
	 * @returns {Promise<void>}
	 */
	static async initBlogPage(basePath: string, title: string, userId: string = "teo",
		currPage = 1, site: SiteConfig = JADE_DUNGEON_SITE, slt: BlogSelectors = {}) //
	{
		let apiRoot = normalizeApiRoot(basePath);
		BlogCommon.initPageFrame(apiRoot, title, "Journal", site, slt);

		try {
			await Promise.all([
				BlogCommon.loadUserInfo(apiRoot, userId, slt),
				BlogPage.loadRecommendArticles(apiRoot, slt),
				BlogPage.loadUserArticles(apiRoot, userId, currPage, slt),
			]);
		} catch (e) {
			console.error("Blog page init failed:", e);
		}

	}

}
