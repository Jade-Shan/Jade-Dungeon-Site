import { ICustomHandler, IRequestContext, IRequestData, HTTP_GET, HTTP_POST } from '@/types';
import { corsHeadersFor, sendOnce } from '@/middleware/simpleHTTPServer';
import { getArticle, listArticles, saveArticle } from '@/service/blogService';

/**
 * 博客接口。数据存 SQLite（2026-11-04 从 Redis List 迁入）。
 *
 * 与旧后端的行为差异：
 *
 * - `loadByUser` **不再返回正文**，只返回摘要（id / auth / title / time）。
 *   实测正文平均 34.7 KB、最长 1.3 MB，列表页带着它翻页很慢。
 *   完整正文走新增的 `getArticle` 接口。备份脚本需同步改用它。
 * - `loadByUser` 的响应多了 `id` 字段，用于调用 `getArticle`。
 * - 页数不再算错：旧实现用 `parseInt((n+1)/pageSize)`，36 条会算出 3 页（应为 4）。
 *
 * - `loadRecommendArticles` 的**路径与字段名改掉了拼写错误**（2026-11-05）：
 *   旧后端是 `loadRecommandArticles` / `recommands`（少个 e、多个 a），
 *   现在是 `loadRecommendArticles` / `recommends`。前端 `site-page` 同步改了。
 *   旧前端 `Jade-Dungeon-page` 已停用，没有别的调用方。
 *
 * 保持与旧后端一致的部分：
 * - `loadUserById` / `loadRecommendArticles` 仍返回硬编码假数据（按决策照搬）
 * - `save` 仍不校验身份，`userId` 由客户端传（按决策照搬）
 * - 响应字段名沿用 `auth` / `time` / `articles`
 */

const sendJson = (context: IRequestContext, status: number, body: unknown) => {
	sendOnce(context.response, status, {
		'Content-Type': 'application/json;charset=utf-8',
		...corsHeadersFor(context.globalCfg, context.request),
	}, JSON.stringify(body));
};

export const handler: ICustomHandler[] = [
	{
		// 旧实现返回的是硬编码假数据，按决策照搬不变
		urlPtn: '/api/blog/loadUserById',
		method: HTTP_GET | HTTP_POST,
		bindFunc: (context: IRequestContext, _data: IRequestData) => {
			sendJson(context, 200, {
				status: 'success',
				user: {
					userName: 'Jade Shan',
					avatar: 'http://47.102.120.187:8081/jadeutils.v2/themes/hobbit/images/atc-01.jpg',
					desc: 'Demo post with formatted elements and comments.',
					joinTime: '2021-03-21',
					group: 'Primer',
					homePageUrl: '#',
				},
			});
		}
	},
	{
		// 同上，硬编码假数据
		urlPtn: '/api/blog/loadRecommendArticles',
		method: HTTP_GET | HTTP_POST,
		bindFunc: (context: IRequestContext, _data: IRequestData) => {
			sendJson(context, 200, {
				status: 'success',
				recommends: [{
					title: 'Demo post with formatted elements and comments',
					thumbnail: 'http://47.102.120.187:8081/jadeutils.v2/themes/hobbit/images/atc-01.jpg',
					link: '#',
				}, {
					title: 'Images in this template',
					thumbnail: 'http://47.102.120.187:8081/jadeutils.v2/themes/hobbit/images/atc-02.jpg',
					link: '#',
				}],
			});
		}
	},
	{
		urlPtn: '/api/blog/loadByUser',
		method: HTTP_GET | HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const userId = data.params.userId;
			// 沿用旧实现的 length > 1 判断
			if (!userId || userId.length <= 1) {
				sendJson(context, 200, { status: 'err', page: 1, pageCount: 0, articles: [] });
				return;
			}
			try {
				const r = await listArticles(userId, data.params.page, data.params.pageSize);
				sendJson(context, 200, {
					status: 'success', page: r.page, pageCount: r.pageCount, articles: r.items,
				});
			} catch (err) {
				console.error('❌ blog/loadByUser 失败:', (err as Error).message);
				sendJson(context, 200, {
					status: 'err', page: 1, pageCount: 0, articles: [], msg: (err as Error).message,
				});
			}
		}
	},
	{
		// 新增接口：取单篇完整正文。列表页不再返回 text，所以需要它。
		urlPtn: '/api/blog/getArticle',
		method: HTTP_GET | HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const id = parseInt(data.params.id ?? '', 10);
			if (!Number.isFinite(id) || id < 1) {
				sendJson(context, 200, { status: 'err', msg: 'miss or invalid id' });
				return;
			}
			try {
				const article = await getArticle(id);
				if (!article) {
					sendJson(context, 200, { status: 'err', msg: 'not found' });
					return;
				}
				sendJson(context, 200, { status: 'success', article });
			} catch (err) {
				console.error('❌ blog/getArticle 失败:', (err as Error).message);
				sendJson(context, 200, { status: 'err', msg: (err as Error).message });
			}
		}
	},
	{
		urlPtn: '/api/blog/save',
		method: HTTP_GET | HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const userId = data.params.userId;
			const text = data.params.text;
			if (!userId || userId.length <= 1 || !text || text.length === 0) {
				sendJson(context, 200, { status: 'err', msg: 'miss userId or text' });
				return;
			}
			const now = Date.now();
			// 沿用旧实现：没传标题就用时间戳生成一个
			const title = (data.params.title && data.params.title.length > 0)
				? data.params.title : `New Article ${now}`;
			const timeRaw = parseInt(data.params.time ?? '', 10);
			const time = Number.isFinite(timeRaw) ? timeRaw : now;

			try {
				const id = await saveArticle(userId, title, text, time);
				sendJson(context, 200, { status: 'success', id });
			} catch (err) {
				console.error('❌ blog/save 失败:', (err as Error).message);
				sendJson(context, 200, { status: 'err', msg: (err as Error).message });
			}
		}
	},
];
