/**
 * blog 层的选择器映射表与站点配置
 *
 * 这两张表是 P1 清理的产物：选择器原来散在函数体里，站点导航树原来写在
 * 库层的 `webHtmlPage.ts`。测试要盯住两件事 —— 默认值与页面结构对得上，
 * 以及传了覆盖项之后真的按覆盖项找元素。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { withDom, withDomAsync } from './_jsdom-setup.js';
import {
	blogSelectors, DEFAULT_BLOG_SELECTORS, BlogCommon, BlogSelectors,
} from '../../main/ts/blog/common.js';
import { JADE_DUNGEON_SITE } from '../../main/ts/site.config.js';

/**
 * 用假 XHR 顶替 jsdom 的真实请求
 *
 * `XMLHttpRequest` 在 `_jsdom-setup.ts` 的 PATCHED 列表里，所以退出 `withDom*`
 * 时会自动还原，这里不用自己收尾。
 *
 * @param body - 要让 `responseText` 返回的对象
 */
function stubXhr(body: unknown): void {
	const text = JSON.stringify(body);
	class FakeXhr {
		status = 200;
		statusText = 'OK';
		responseText = text;
		timeout = 0;
		withCredentials = false;
		onload: ((evt: unknown) => void) | null = null;
		open(): void { }
		setRequestHeader(): void { }
		send(): void { this.onload?.({}); }
	}
	(globalThis as unknown as Record<string, unknown>).XMLHttpRequest = FakeXhr;
}

describe('blogSelectors 合并默认值', () => {

	test('不传时每一项都有默认值', () => {
		const s = blogSelectors();
		for (const [k, v] of Object.entries(DEFAULT_BLOG_SELECTORS)) {
			assert.equal(s[k as keyof BlogSelectors], v, `${k} 应取默认值`);
		}
	});

	test('只覆盖传了的项，其余保持默认', () => {
		const s = blogSelectors({ userName: '#my-name' });
		assert.equal(s.userName, '#my-name');
		assert.equal(s.avatar, DEFAULT_BLOG_SELECTORS.avatar, '没传的项不受影响');
	});

	test('不修改传入的对象，也不修改默认表', () => {
		const input: BlogSelectors = { userName: '#a' };
		blogSelectors(input);
		assert.deepEqual(input, { userName: '#a' }, '入参应保持原样');
		assert.equal(DEFAULT_BLOG_SELECTORS.userName, '#widget-username',
			'默认表应保持原样');
	});

	test('photoFrameId 是元素 id，不带 #', () => {
		// BootStrapHelper.initPhotoFrame() 自己拼 `#${id}`，这里带 # 会拼成 ##
		assert.ok(!DEFAULT_BLOG_SELECTORS.photoFrameId.startsWith('#'));
	});

	test('默认选择器能在页面结构上找到元素', () => {
		// 对应 src/html/parts/side-blog-index.html 与 blog-main.html
		const html = `
			<h2 id="widget-username"></h2>
			<a id="widget-avatar-lnk"><img id="widget-avatar"></a>
			<div id="widget-user-desc"></div>
			<span id="widget-user-joined"></span>
			<span id="widget-user-group"></span>
			<ul id="widget-recommends-articles"></ul>
			<div id="articles"><img class="img-frame" data-origin="a.jpg"></div>
			<div id="photo-frame"></div>`;
		withDom(html, () => {
			const s = blogSelectors();
			for (const key of ['userName', 'avatar', 'avatarLink', 'desc',
				'joinTime', 'group', 'recommends', 'articleList', 'imageFrame'] as const) {
				assert.ok(document.querySelector(s[key]), `${key}（${s[key]}）应能找到元素`);
			}
			assert.ok(document.getElementById(s.photoFrameId), 'photoFrameId 应能找到元素');
			// lazyImage 是容器内的相对部分，实际用的是拼接后的形态
			assert.ok(document.querySelector(`${s.articleList} ${s.lazyImage}`),
				'articleList + lazyImage 拼接后应能找到元素');
		});
	});

});

describe('BlogCommon.loadUserInfo 按选择器表找元素', () => {

	/** 后端返回的用户信息 */
	const resp = {
		status: 'success',
		user: {
			userName: 'Teo', avatar: 'a.jpg', desc: 'd',
			joinTime: '2021-03-21', group: 'admin', homePageUrl: '/u/teo',
		},
	};

	test('不传选择器时写进默认的 widget 元素', async () => {
		await withDomAsync(`
			<h2 id="widget-username"></h2>
			<a id="widget-avatar-lnk"><img id="widget-avatar"></a>
			<div id="widget-user-desc"></div>
			<span id="widget-user-joined"></span>
			<span id="widget-user-group"></span>`, async () => {
			stubXhr(resp);
			await BlogCommon.loadUserInfo('/', 'teo');
			assert.equal(document.getElementById('widget-username')!.textContent, 'Teo');
			assert.equal(document.getElementById('widget-user-group')!.textContent, 'admin');
			const img = document.getElementById('widget-avatar') as HTMLImageElement;
			assert.equal(img.getAttribute('src'), 'a.jpg');
			assert.equal(img.alt, 'Teo');
		});
	});

	test('传了覆盖项时写进覆盖后的元素', async () => {
		await withDomAsync(`
			<h2 id="widget-username"></h2>
			<h2 id="my-name"></h2>`, async () => {
			stubXhr(resp);
			await BlogCommon.loadUserInfo('/', 'teo', { userName: '#my-name' });
			assert.equal(document.getElementById('my-name')!.textContent, 'Teo',
				'应写进覆盖后的选择器');
			assert.equal(document.getElementById('widget-username')!.textContent, '',
				'默认选择器的元素不该被写');
		});
	});

	test('元素不存在时不抛错', async () => {
		await withDomAsync('<div></div>', async () => {
			stubXhr(resp);
			await BlogCommon.loadUserInfo('/', 'teo');
		});
	});

});

describe('JADE_DUNGEON_SITE 站点配置', () => {

	test('themes 的选择器与导航项的 id 一一对应', () => {
		// 导航项渲染出带 id 的 <a>，bindChangeTheme() 再按选择器找它绑点击事件。
		// 两边对不上的结果是主题菜单点了没反应，而且不报错
		const ids: Array<string> = [];
		for (const item of JADE_DUNGEON_SITE.navItems) {
			for (const sub of item.subs ?? []) {
				if (sub.id) { ids.push(`#${sub.id}`); }
			}
		}
		const slts = JADE_DUNGEON_SITE.themes.map(t => t.elemSlt);
		assert.deepEqual(slts.slice().sort(), ids.slice().sort());
	});

	test('themes 的主题名就是 gulpfile 里的三套内容主题', () => {
		assert.deepEqual(JADE_DUNGEON_SITE.themes.map(t => t.themeName),
			['hobbit', 'lo-fi', 'paper-print']);
	});

	test('品牌名与链接非空', () => {
		assert.ok(JADE_DUNGEON_SITE.brandName.length > 0);
		assert.ok(JADE_DUNGEON_SITE.brandLink.length > 0);
	});

});
