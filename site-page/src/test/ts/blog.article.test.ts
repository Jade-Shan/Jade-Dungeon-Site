/**
 * 博客列表的摘要渲染、「展开」取全文、以及分页页数
 *
 * 这三件事是 2026-11-05 跟着 site-api 的接口变化一起改的，要盯住的点：
 *
 * - 列表接口只给 `excerpt`（**纯文本，不是 Markdown**），不能再过 showdown
 * - 摘要后面的「展开」链接点了要去 `api/blog/getArticle` 取全文，
 *   拿到的 Markdown 才过 showdown
 * - `pageCount` 直接用，**不再 `+ 1`** —— 旧后端算少 1 时补过，现在加回去
 *   会多出一个点进去空白的末页
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { withDom, withDomAsync } from './_jsdom-setup.js';
import { BlogCommon, UserArticle } from '../../main/ts/blog/common.js';
import { BlogPage } from '../../main/ts/blog/blog.js';

/**
 * 顶替全局 `showdown`
 *
 * `ShowdownUtils` 依赖 `<script>` 加载的全局变量，Node 下没有。
 * 转换结果包成 `[md]...[/md]`，这样断言能直接看出某段文字**有没有**过 showdown ——
 * 摘要不该过，全文该过。
 *
 * 装在模块加载期：`ShowdownUtils` 把 Converter 实例缓存在模块级变量里，
 * 第一次调用之后就不再读全局了，所以不能等到用例内部才装。
 */
(globalThis as unknown as Record<string, unknown>).showdown = {
	Converter: class { makeHtml(md: string): string { return `[md]${md}[/md]`; } },
};

/** 一篇只有摘要的文章，对应 `api/blog/loadByUser` 的返回 */
const SUMMARY: UserArticle = {
	id: 42, time: 1700000000000, auth: 'teo',
	title: '标题', excerpt: '摘要正文',
};

/** 取全文的 URL 生成函数 */
const detailUrl = (id: number) => `/api/blog/getArticle?id=${id}`;

describe('renderArticle 渲染摘要', () => {

	test('摘要不过 showdown，只做 HTML 转义', () => {
		// 后端的 makeExcerpt() 已经剥掉 Markdown 标记了，再过一遍 showdown
		// 会把正文里残留的 * _ # 当成标记吃掉
		const atc: UserArticle = { ...SUMMARY, excerpt: '带 *星号* 和 #井号 的纯文本' };
		const html = BlogCommon.renderArticle(atc, detailUrl);
		assert.ok(!html.includes('[md]'), '摘要不该过 showdown');
		assert.ok(html.includes('带 *星号* 和 #井号 的纯文本'), '摘要应原样出现');
	});

	test('摘要里的 HTML 被转义', () => {
		const atc: UserArticle = { ...SUMMARY, excerpt: '<script>alert(1)</script>' };
		const html = BlogCommon.renderArticle(atc, detailUrl);
		assert.ok(!html.includes('<script>'), '不该出现未转义的标签');
		assert.ok(html.includes('&lt;script&gt;'), '应转义成实体');
	});

	test('传了 detailUrl 且有 id 时，摘要后有「展开」链接', () => {
		const html = BlogCommon.renderArticle(SUMMARY, detailUrl);
		assert.ok(html.includes('[展开]'), '应有展开链接');
		assert.ok(html.includes('data-article-id="42"'), '链接应带文章 id');
	});

	test('不传 detailUrl 时没有「展开」链接（相册列表的用法）', () => {
		const html = BlogCommon.renderArticle(SUMMARY);
		assert.ok(!html.includes('[展开]'), '没有取全文的 URL 就不该给链接');
		assert.ok(html.includes('摘要正文'), '摘要照样要显示');
	});

	test('没有 id 时没有「展开」链接', () => {
		const { id, ...noId } = SUMMARY;
		const html = BlogCommon.renderArticle(noId as UserArticle, detailUrl);
		assert.ok(!html.includes('[展开]'), '没有 id 取不了全文，不该给链接');
	});

});

describe('renderArticle 渲染全文', () => {

	test('有 text 时过 showdown', () => {
		const atc: UserArticle = { ...SUMMARY, text: '# 标题\n正文' };
		const html = BlogCommon.renderArticle(atc, detailUrl);
		assert.ok(html.includes('[md]# 标题\n正文[/md]'), '正文该过 showdown');
	});

	test('有 text 时不再出现「展开」链接', () => {
		const atc: UserArticle = { ...SUMMARY, text: '正文' };
		const html = BlogCommon.renderArticle(atc, detailUrl);
		assert.ok(!html.includes('[展开]'), '全文已经在手，不需要展开');
	});

	test('相册的 text + album 一起渲染', () => {
		const atc: UserArticle = {
			id: 7, time: 1700000000000, auth: 'teo', title: '相册', text: '说明',
			album: [{ id: 0, title: 't', desc: 'd', url: 'a.jpg' }],
		};
		const html = BlogCommon.renderArticle(atc);
		assert.ok(html.includes('[md]说明[/md]'), '相册说明过 showdown');
		assert.ok(html.includes('data-origin="a.jpg"'), '缩略图走懒加载');
	});

	test('后端给旧字段名 ablum 时渲染不出图（自检：确实在读 album）', () => {
		// 2026-11-05 把 `ablum` 改成 `album`，两边必须同时改。
		// 只改一边不报错 —— 相册页静默变成「只有说明、没有图」，所以钉一条自检。
		// 没有这条的话，前端改回读 `ablum` 上面那条用例照样会过
		const atc = {
			id: 7, time: 1700000000000, auth: 'teo', title: '相册', text: '说明',
			ablum: [{ id: 0, title: 't', desc: 'd', url: 'a.jpg' }],
		} as unknown as UserArticle;
		const html = BlogCommon.renderArticle(atc);
		assert.ok(!html.includes('data-origin="a.jpg"'), '旧字段名不该被认出来');
		assert.ok(html.includes('[md]说明[/md]'), '说明文字照常渲染');
	});

});

// ───────────────────────── 带 DOM 的用例 ─────────────────────────

/** 列表容器 + 图片模态框，对应 blog-main.html 的结构 */
const PAGE = '<div id="articles"></div><div id="photo-frame"></div>';

/** 按 URL 分派响应的假 XHR 记录的请求 URL */
let requested: string[] = [];

/**
 * 用假 XHR 顶替 jsdom 的真实请求，按 URL 返回不同的响应
 *
 * 展开要连发两次请求（列表、单篇），所以不能像 `blog.selectors.test.ts`
 * 那样固定返回同一个 body。
 *
 * @param routes - URL 片段 → 响应体。按插入顺序取第一个命中的
 */
function stubXhrByUrl(routes: Array<[string, unknown]>): void {
	requested = [];
	class FakeXhr {
		status = 200;
		statusText = 'OK';
		responseText = '';
		timeout = 0;
		withCredentials = false;
		onload: ((evt: unknown) => void) | null = null;
		onerror: ((evt: unknown) => void) | null = null;
		private url = '';
		open(_m: string, url: string): void { this.url = url; }
		setRequestHeader(): void { }
		send(): void {
			requested.push(this.url);
			const hit = routes.find(([frag]) => this.url.includes(frag));
			if (hit) {
				this.responseText = JSON.stringify(hit[1]);
				this.onload?.({});
			} else {
				this.status = 404;
				this.onerror?.({});
			}
		}
	}
	(globalThis as unknown as Record<string, unknown>).XMLHttpRequest = FakeXhr;
}

/** 列表接口的响应：一页一篇，只有摘要 */
const listResp = (pageCount: number) => ({
	status: 'success', page: 1, pageCount: pageCount, articles: [SUMMARY],
});

describe('loadArticleList 的分页页数', () => {

	test('pageCount 直接用，不再 + 1', async () => {
		// 36 篇 / 每页 10 篇 = 4 页。旧代码补的 + 1 会渲染出点进去空白的第 5 页
		await withDomAsync(PAGE, async () => {
			stubXhrByUrl([['loadByUser', listResp(4)]]);
			await BlogCommon.loadArticleList(p => `/api/blog/loadByUser?page=${p}`, 1);

			const nums = Array.from(
				document.querySelectorAll('#articles ul.pagination li a'))
				.map(a => a.textContent ?? '')
				.filter(t => /^\d+$/.test(t))
				.map(Number);
			assert.equal(Math.max(...nums), 4, '最大页码应是后端给的 pageCount');
			assert.ok(!nums.includes(5), '不该多出第 5 页');
		});
	});

	test('只有 1 页时不渲染出第 2 页', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhrByUrl([['loadByUser', listResp(1)]]);
			await BlogCommon.loadArticleList(p => `/api/blog/loadByUser?page=${p}`, 1);

			const nums = Array.from(
				document.querySelectorAll('#articles ul.pagination li a'))
				.map(a => a.textContent ?? '')
				.filter(t => /^\d+$/.test(t))
				.map(Number);
			assert.ok(!nums.includes(2), '只有 1 页就不该有第 2 页');
		});
	});

});

describe('「展开」链接取全文', () => {

	/** 单篇接口的响应 */
	const detailResp = {
		status: 'success',
		article: { ...SUMMARY, text: '# 全文\n正文若干' },
	};

	test('点击后把摘要换成 showdown 转出的全文', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhrByUrl([['loadByUser', listResp(1)], ['getArticle', detailResp]]);
			await BlogCommon.loadArticleList(
				p => `/api/blog/loadByUser?page=${p}`, 1, {}, detailUrl);

			const link = document.querySelector<HTMLElement>('a.atc-expand');
			assert.ok(link, '列表里应有展开链接');
			link!.click();
			// onclick 里是 async，等它跑完
			await new Promise(r => setTimeout(r, 0));

			const body = document.querySelector('#articles .item .body')!;
			assert.ok(requested.some(u => u.includes('getArticle?id=42')),
				'应按 id 请求单篇接口');
			assert.ok(body.innerHTML.includes('[md]# 全文\n正文若干[/md]'),
				'全文应过 showdown');
			assert.equal(document.querySelector('a.atc-expand'), null,
				'换成全文之后展开链接该消失');
		});
	});

	test('请求失败时保留摘要、还原链接文字', async () => {
		await withDomAsync(PAGE, async () => {
			// getArticle 没配路由 → 假 XHR 走 onerror
			stubXhrByUrl([['loadByUser', listResp(1)]]);
			await BlogCommon.loadArticleList(
				p => `/api/blog/loadByUser?page=${p}`, 1, {}, detailUrl);

			const link = document.querySelector<HTMLElement>('a.atc-expand')!;
			link.click();
			await new Promise(r => setTimeout(r, 0));

			const body = document.querySelector('#articles .item .body')!;
			assert.ok(body.textContent?.includes('摘要正文'), '摘要不该被清掉');
			assert.equal(document.querySelector('a.atc-expand')!.textContent, '[展开]',
				'链接文字应从「展开中…」还原');
		});
	});

	test('后端返回 status=err 时不替换正文', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhrByUrl([
				['loadByUser', listResp(1)],
				['getArticle', { status: 'err', msg: 'not found' }],
			]);
			await BlogCommon.loadArticleList(
				p => `/api/blog/loadByUser?page=${p}`, 1, {}, detailUrl);

			const link = document.querySelector<HTMLElement>('a.atc-expand')!;
			link.click();
			await new Promise(r => setTimeout(r, 0));

			const body = document.querySelector('#articles .item .body')!;
			assert.ok(body.textContent?.includes('摘要正文'), '摘要不该被清掉');
			assert.ok(!body.innerHTML.includes('[md]'), '不该渲染出空正文');
		});
	});

	test('不传 detailUrl 时列表里没有展开链接', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhrByUrl([['loadByUser', listResp(1)]]);
			await BlogCommon.loadArticleList(p => `/api/blog/loadByUser?page=${p}`, 1);
			assert.equal(document.querySelector('a.atc-expand'), null);
		});
	});

});

describe('loadRecommendArticles 的拼写与后端对得上', () => {

	/**
	 * 这几条盯的是 2026-11-05 改掉的拼写：路径 `loadRecommandArticles` →
	 * `loadRecommendArticles`、字段 `recommands` → `recommends`。
	 *
	 * **改动涉及 URL，一边改一边不改的话不报错、只是推荐栏空着**，
	 * 所以这里把前端实际请求的 URL 和实际读的字段名都钉住。
	 * 后端那侧的值在 `site-api/src/main/ts/routes/blog.ts`。
	 */
	const recResp = {
		status: 'success',
		recommends: [
			{ title: '推荐一', thumbnail: 'a.jpg', link: '/a' },
			{ title: '推荐二', thumbnail: 'b.jpg', link: '/b' },
		],
	};

	test('请求的路径是 loadRecommendArticles（不是 Recommand）', async () => {
		await withDomAsync('<ul id="widget-recommends-articles"></ul>', async () => {
			stubXhrByUrl([['loadRecommendArticles', recResp]]);
			await BlogPage.loadRecommendArticles('/');
			assert.equal(requested.length, 1, '应发出一次请求');
			assert.ok(requested[0].includes('api/blog/loadRecommendArticles'),
				`路径拼写应与后端一致，实际请求的是 ${requested[0]}`);
			assert.ok(!requested[0].includes('Recommand'), '不该再有旧拼写');
		});
	});

	test('读的字段是 recommends（不是 recommands）', async () => {
		await withDomAsync('<ul id="widget-recommends-articles"></ul>', async () => {
			stubXhrByUrl([['loadRecommendArticles', recResp]]);
			await BlogPage.loadRecommendArticles('/');
			const items = document.querySelectorAll('#widget-recommends-articles li');
			assert.equal(items.length, 2, '两条推荐都该渲染出来');
			assert.ok(items[0].innerHTML.includes('推荐一'));
		});
	});

	test('后端给旧字段名时渲染不出东西（证明确实在读 recommends）', async () => {
		// 自检：万一哪天前端改回读 recommands，上面那条用例照样会过
		await withDomAsync('<ul id="widget-recommends-articles"></ul>', async () => {
			stubXhrByUrl([['loadRecommendArticles',
				{ status: 'success', recommands: recResp.recommends }]]);
			await BlogPage.loadRecommendArticles('/');
			assert.equal(
				document.querySelectorAll('#widget-recommends-articles li').length, 0,
				'旧字段名不该被认出来');
		});
	});

	test('响应体为空时不抛错，推荐栏留空', async () => {
		await withDomAsync('<ul id="widget-recommends-articles"></ul>', async () => {
			stubXhrByUrl([['loadRecommendArticles', { status: 'success' }]]);
			await BlogPage.loadRecommendArticles('/');
			assert.equal(
				document.querySelectorAll('#widget-recommends-articles li').length, 0);
		});
	});

});
