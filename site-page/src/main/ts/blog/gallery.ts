import { SiteConfig } from '@jade-dungeon/jade-utils/web-html-page';
import { normalizeApiRoot, BlogCommon, BlogSelectors } from './common.js';
import { JADE_DUNGEON_SITE } from '../site.config.js';


/**
 * 相册页面
 *
 * 组织相册页面的完整初始化流程，包括用户信息加载、相册分页列表以及主题切换。
 * 用户信息、文章渲染和分页列表的公共逻辑在 `BlogCommon` 中。
 */
export class GalleryPage {

	/**
	 * 加载用户相册列表（分页）并渲染
	 *
	 * @param apiRoot - API 根路径
	 * @param userId - 用户 ID
	 * @param currPage - 当前页码
	 * @param slt - 页面选择器，缺省项走 `DEFAULT_BLOG_SELECTORS`
	 * @returns {Promise<void>}
	 */
	static async loadUserAblume (apiRoot: string, userId: string, currPage: number,
		slt: BlogSelectors = {}) //
	{
		await BlogCommon.loadArticleList(
			page => `${apiRoot}api/gallery/loadByUser?userId=${encodeURIComponent(userId)}&pageSize=5&page=${page}`,
			currPage, slt);
	}

	/**
	 * 相册页面初始化入口
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
	static async initGalleryPage(basePath: string, title: string, userId: string = "teo",
		currPage = 1, site: SiteConfig = JADE_DUNGEON_SITE, slt: BlogSelectors = {}) //
	{
		let apiRoot = normalizeApiRoot(basePath);
		BlogCommon.initPageFrame(apiRoot, title, "Gallery", site, slt);

		try {
			await Promise.all([
				BlogCommon.loadUserInfo(apiRoot, userId, slt),
				GalleryPage.loadUserAblume(apiRoot, userId, currPage, slt),
			]);
		} catch (e) {
			console.error("Gallery page init failed:", e);
		}

	}

}
