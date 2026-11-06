/**
 * 主题切换
 *
 * 机制是启用/禁用 `<link title>` 标签，当前主题存进 cookie（`ui.theme`），
 * 下次加载时 `initUITheme()` 读回来。涉及 DOM + cookie 两层联动。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { withDom } from './_jsdom-setup.js';
import { WebHtmlPage, PageConfig } from '../../main/ts/ui/webHtmlPage.js';
import { WebUtil } from '../../main/ts/web.js';

const cfg = (): PageConfig => ({
	apiRoot: '/', pageTitle: 'T', subTitle: 'S', ajaxTimeout: 500,
});

/** 三套主题的 link 标签，模拟真实页面的 head */
const THEME_LINKS = `
	<link title="hobbit"      rel="stylesheet"           href="/h.css">
	<link title="lo-fi"       rel="alternate stylesheet" href="/l.css">
	<link title="paper-print" rel="alternate stylesheet" href="/p.css">
`;

/** 取当前处于启用状态的主题名 */
const enabledThemes = () =>
	Array.from(document.querySelectorAll<HTMLLinkElement>('link[title]'))
		.filter(l => !l.disabled)
		.map(l => l.title);

describe('WebHtmlPage.changeTheme', () => {

	test('切到指定主题后只有它启用', () => {
		withDom(THEME_LINKS, () => {
			new WebHtmlPage(cfg()).changeTheme('lo-fi');
			assert.deepEqual(enabledThemes(), ['lo-fi']);
		});
	});

	test('切换会写入 cookie', () => {
		withDom(THEME_LINKS, () => {
			new WebHtmlPage(cfg()).changeTheme('paper-print');
			assert.equal(WebUtil.loadCookieValue('ui.theme'), 'paper-print');
		});
	});

	test('可以连续切换', () => {
		withDom(THEME_LINKS, () => {
			const page = new WebHtmlPage(cfg());
			page.changeTheme('lo-fi');
			page.changeTheme('hobbit');
			assert.deepEqual(enabledThemes(), ['hobbit']);
			assert.equal(WebUtil.loadCookieValue('ui.theme'), 'hobbit');
		});
	});

	test('切到不存在的主题名：全部保持禁用，且不写 cookie', () => {
		// 实现里只有找到匹配的 link 才写 cookie，这是有意的 ——
		// 否则会把一个取不到样式的主题名持久化下来
		withDom(THEME_LINKS, () => {
			new WebHtmlPage(cfg()).changeTheme('nonexistent');
			assert.deepEqual(enabledThemes(), [], '没有主题应被启用');
			assert.equal(WebUtil.loadCookieValue('ui.theme'), '',
				'不该写入无效的主题名');
		});
	});

	test('自定义 cookie 键名', () => {
		withDom(THEME_LINKS, () => {
			new WebHtmlPage(cfg()).changeTheme('lo-fi', 'my.theme');
			assert.equal(WebUtil.loadCookieValue('my.theme'), 'lo-fi');
			assert.equal(WebUtil.loadCookieValue('ui.theme'), '',
				'不该写进默认键');
		});
	});

	test('页面没有主题 link 时不抛错', () => {
		withDom('<div></div>', () => {
			assert.doesNotThrow(() => {
				new WebHtmlPage(cfg()).changeTheme('hobbit');
			});
		});
	});

});

describe('WebHtmlPage.initUITheme', () => {

	test('从 cookie 恢复上次选的主题', () => {
		withDom(THEME_LINKS, () => {
			WebUtil.setCookieValue('ui.theme', 'paper-print', { sameSite: 'Lax' });
			new WebHtmlPage(cfg()).initUITheme();
			assert.deepEqual(enabledThemes(), ['paper-print']);
		});
	});

	test('cookie 为空时不动现状', () => {
		withDom(THEME_LINKS, () => {
			const before = enabledThemes();
			new WebHtmlPage(cfg()).initUITheme();
			assert.deepEqual(enabledThemes(), before,
				'没有 cookie 时应保持 HTML 里的默认主题');
		});
	});

	test('与 changeTheme 往返一致', () => {
		withDom(THEME_LINKS, () => {
			const page = new WebHtmlPage(cfg());
			page.changeTheme('lo-fi');
			// 模拟重新加载：把所有 link 恢复成初始状态，再 init
			for (const l of document.querySelectorAll<HTMLLinkElement>('link[title]')) {
				l.disabled = false;
			}
			page.initUITheme();
			assert.deepEqual(enabledThemes(), ['lo-fi'],
				'应恢复到切换时选的主题');
		});
	});

});

describe('WebHtmlPage.bindChangeTheme', () => {

	test('点击绑定的元素会切主题', () => {
		withDom(`${THEME_LINKS}
			<a id="to-lofi">lo-fi</a><a id="to-paper">paper</a>`, () => {
			new WebHtmlPage(cfg()).bindChangeTheme([
				{ elemSlt: '#to-lofi', themeName: 'lo-fi' },
				{ elemSlt: '#to-paper', themeName: 'paper-print' },
			]);
			(document.getElementById('to-paper') as HTMLElement).click();
			assert.deepEqual(enabledThemes(), ['paper-print']);
			(document.getElementById('to-lofi') as HTMLElement).click();
			assert.deepEqual(enabledThemes(), ['lo-fi']);
		});
	});

	test('选择器找不到元素时跳过，不抛错', () => {
		withDom(THEME_LINKS, () => {
			assert.doesNotThrow(() => {
				new WebHtmlPage(cfg()).bindChangeTheme([
					{ elemSlt: '#nope', themeName: 'lo-fi' },
				]);
			});
		});
	});

	test('空列表是空操作', () => {
		withDom(THEME_LINKS, () => {
			assert.doesNotThrow(() => {
				new WebHtmlPage(cfg()).bindChangeTheme([]);
			});
		});
	});

});
