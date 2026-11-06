import { ICustomHandler, IRequestContext, IRequestData, HTTP_GET, HTTP_POST } from '@/types';
import { corsHeadersFor, sendOnce } from '@/middleware/simpleHTTPServer';
import { getAlbum, listAlbums, saveAlbum } from '@/service/blogService';

/**
 * 相册接口。数据存 SQLite（2026-11-04 从 Redis List 迁入），图片拆成了子表。
 *
 * 与博客不同，相册列表**仍然返回图片列表**：相册的 text 很短，
 * 图片只是 URL 字符串，单组最多 19 张，而前端要显示缩略图，所以带上更划算。
 *
 * 响应里的图片列表字段叫 `album`。**2026-11-05 前是 `ablum`**（旧后端的拼写
 * 错误），旧后端停用后与前端 `site-page` 一起改正了。表里存为 `gallery_photo`，
 * 映射在 blogService 完成。
 *
 * `save` 仍不校验身份（按决策照搬）。
 */

const sendJson = (context: IRequestContext, status: number, body: unknown) => {
	sendOnce(context.response, status, {
		'Content-Type': 'application/json;charset=utf-8',
		...corsHeadersFor(context.globalCfg, context.request),
	}, JSON.stringify(body));
};

/**
 * 从表单参数里取出图片数组。
 *
 * 旧实现期望 `picTitle` / `picDesc` / `picUrl` 是三个等长数组
 * （HTML 表单里同名字段重复出现时，Express 会解析成数组）。
 * 但只提交一张图时它们是字符串而非数组，旧实现对此的处理是
 * `picUrls.length > 0` —— 字符串也有 length，于是会按字符逐个遍历，
 * 得到一堆单字符的 url。这里统一归一化成数组，避免该问题。
 */
const readPhotos = (data: IRequestData) => {
	const toArr = (v: unknown): string[] => {
		if (v === undefined || v === null) { return []; }
		return Array.isArray(v) ? v.map((x) => String(x)) : [String(v)];
	};
	const titles = toArr(data.params.picTitle);
	const descs = toArr(data.params.picDesc);
	const urls = toArr(data.params.picUrl);

	const photos: { title: string; desc: string; url: string }[] = [];
	for (let i = 0; i < urls.length; i++) {
		// 沿用旧实现：url 为空的条目跳过
		if (urls[i] && urls[i].length > 0) {
			photos.push({ title: titles[i] ?? '', desc: descs[i] ?? '', url: urls[i] });
		}
	}
	return photos;
};

export const handler: ICustomHandler[] = [
	{
		urlPtn: '/api/gallery/loadByUser',
		method: HTTP_GET | HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const userId = data.params.userId;
			if (!userId || userId.length <= 1) {
				sendJson(context, 200, { status: 'err', page: 1, pageCount: 0, articles: [] });
				return;
			}
			try {
				const r = await listAlbums(userId, data.params.page, data.params.pageSize);
				// 响应字段沿用旧实现的 articles（虽然装的是相册）
				sendJson(context, 200, {
					status: 'success', page: r.page, pageCount: r.pageCount, articles: r.items,
				});
			} catch (err) {
				console.error('❌ gallery/loadByUser 失败:', (err as Error).message);
				sendJson(context, 200, {
					status: 'err', page: 1, pageCount: 0, articles: [], msg: (err as Error).message,
				});
			}
		}
	},
	{
		// 新增接口，与 blog/getArticle 对称
		urlPtn: '/api/gallery/getAlbum',
		method: HTTP_GET | HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const id = parseInt(data.params.id ?? '', 10);
			if (!Number.isFinite(id) || id < 1) {
				sendJson(context, 200, { status: 'err', msg: 'miss or invalid id' });
				return;
			}
			try {
				const album = await getAlbum(id);
				if (!album) {
					sendJson(context, 200, { status: 'err', msg: 'not found' });
					return;
				}
				sendJson(context, 200, { status: 'success', article: album });
			} catch (err) {
				console.error('❌ gallery/getAlbum 失败:', (err as Error).message);
				sendJson(context, 200, { status: 'err', msg: (err as Error).message });
			}
		}
	},
	{
		urlPtn: '/api/gallery/save',
		method: HTTP_GET | HTTP_POST,
		bindFunc: async (context: IRequestContext, data: IRequestData) => {
			const userId = data.params.userId;
			const photos = readPhotos(data);
			// 沿用旧实现：没有有效图片就不保存
			if (!userId || userId.length === 0 || photos.length === 0) {
				sendJson(context, 200, { status: 'err', msg: 'miss userId or picUrl' });
				return;
			}
			const timeRaw = parseInt(data.params.time ?? '', 10);
			const time = Number.isFinite(timeRaw) ? timeRaw : Date.now();

			try {
				const id = await saveAlbum(
					userId, data.params.title ?? '', data.params.text ?? '', photos, time);
				sendJson(context, 200, { status: 'success', id });
			} catch (err) {
				console.error('❌ gallery/save 失败:', (err as Error).message);
				sendJson(context, 200, { status: 'err', msg: (err as Error).message });
			}
		}
	},
];
