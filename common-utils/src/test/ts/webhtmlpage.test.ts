/**
 * WebHtmlPage 的 DOM 操作与分页渲染
 *
 * 这个类是 blog / wiki / gallery 三个页面共用的框架层，
 * 出错会同时影响三个页面。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { withDom } from './_jsdom-setup.js';
import {
	WebHtmlPage, PageConfig, SiteConfig, NavTreeNode, TopNavRenderer,
} from '../../main/ts/ui/webHtmlPage.js';
import { BootStrapTemplate } from '../../main/ts/ui/bootstrapTemplate.js';

const cfg = (): PageConfig => ({
	apiRoot: '/', pageTitle: 'T', subTitle: 'S', ajaxTimeout: 500,
});

/** 只关心导航项时用，品牌名和主题列表取占位值 */
const site = (navItems: Array<NavTreeNode>): SiteConfig => ({
	brandName: 'Brand', brandLink: '/', navItems: navItems, themes: [],
});

describe('WebHtmlPage 的静态 DOM 工具', () => {

	test('addElemClass / removeElemClass 按选择器批量操作', () => {
		withDom('<p class="x"></p><p class="x"></p>', () => {
			WebHtmlPage.addElemClass('p.x', 'added');
			for (const el of document.querySelectorAll('p.x')) {
				assert.ok(el.classList.contains('added'));
			}
			WebHtmlPage.removeElemClass('p.x', 'added');
			for (const el of document.querySelectorAll('p.x')) {
				assert.ok(!el.classList.contains('added'));
			}
		});
	});

	test('一次加多个 class', () => {
		withDom('<p class="x"></p>', () => {
			WebHtmlPage.addElemClass('p.x', 'a', 'b', 'c');
			const el = document.querySelector('p.x')!;
			for (const c of ['a', 'b', 'c']) {
				assert.ok(el.classList.contains(c), `应含 ${c}`);
			}
		});
	});

	test('选择器无匹配时是安全的空操作', () => {
		withDom('<div></div>', () => {
			assert.doesNotThrow(() => {
				WebHtmlPage.addElemClass('p.nope', 'x');
				WebHtmlPage.removeElemClass('p.nope', 'x');
				WebHtmlPage.setElemHtml('p.nope', 'x');
			});
		});
	});

	test('setElemHtml 写入 innerHTML', () => {
		withDom('<div class="t"></div><div class="t"></div>', () => {
			WebHtmlPage.setElemHtml('div.t', '<b>hi</b>');
			for (const el of document.querySelectorAll('div.t')) {
				assert.equal(el.innerHTML, '<b>hi</b>');
			}
		});
	});

	test('bindOnClick 绑定事件', () => {
		withDom('<button id="b"></button>', () => {
			let hits = 0;
			WebHtmlPage.bindOnClick('#b', () => { hits++; });
			const btn = document.getElementById('b') as HTMLElement;
			btn.click();
			btn.click();
			assert.equal(hits, 2);
		});
	});

	test('也接受 NodeList 而非选择器', () => {
		withDom('<p class="x"></p><p class="x"></p>', () => {
			const list = document.querySelectorAll<HTMLElement>('p.x');
			WebHtmlPage.addElemClass(list, 'viaList');
			assert.equal(document.querySelectorAll('p.viaList').length, 2);
		});
	});

	test('parseHTML 把字符串转成 DocumentFragment', () => {
		withDom('', () => {
			const frag = WebHtmlPage.parseHTML('<span>a</span><span>b</span>');
			assert.equal(frag.childNodes.length, 2);
			assert.equal((frag.firstChild as Element).textContent, 'a');
		});
	});

});

describe('WebHtmlPage.renderPaging', () => {

	test('返回 ul 元素，带 pagination class', () => {
		withDom('', () => {
			const ul = WebHtmlPage.renderPaging(1, 5);
			assert.equal(ul.tagName, 'UL');
			assert.ok(ul.classList.contains('pagination'));
		});
	});

	test('当前页标记为 active，且只有一个', () => {
		withDom('', () => {
			const ul = WebHtmlPage.renderPaging(3, 10);
			assert.equal(ul.querySelectorAll('li.active').length, 1);
			assert.equal(ul.querySelector('li.active')!.textContent, '3');
		});
	});

	test('首页时「上一页」被禁用', () => {
		withDom('', () => {
			const ul = WebHtmlPage.renderPaging(1, 5);
			// 首页不该再渲染一个指向第 1 页的数字链接
			assert.ok(ul.textContent!.includes('«'), '应有上一页符号');
		});
	});

	test('末页时「下一页」被禁用', () => {
		withDom('', () => {
			const ul = WebHtmlPage.renderPaging(5, 5);
			assert.equal(ul.querySelectorAll('li.disable').length >= 1, true,
				'末页应有 disable 项');
		});
	});

	test('页数很多时出现省略号', () => {
		withDom('', () => {
			const ul = WebHtmlPage.renderPaging(50, 100);
			assert.ok(ul.textContent!.includes('...'), '应有省略号');
		});
	});

	test('点击页码触发回调并带上页号', () => {
		withDom('', () => {
			const got: Array<number> = [];
			const ul = WebHtmlPage.renderPaging(5, 10, n => { got.push(n); });
			// 找一个非当前页的数字链接点一下
			const links = Array.from(ul.querySelectorAll('a'))
				.filter(a => /^\d+$/.test(a.textContent || ''))
				.filter(a => a.textContent !== '5');
			assert.ok(links.length > 0, '应有可点的其他页码');
			(links[0] as HTMLElement).click();
			assert.equal(got.length, 1, '回调应被调用一次');
			assert.equal(got[0], Number(links[0].textContent));
		});
	});

	test('非法页码被纠正为 1', () => {
		withDom('', () => {
			for (const bad of [0, -5]) {
				const ul = WebHtmlPage.renderPaging(bad, 5);
				assert.equal(ul.querySelector('li.active')!.textContent, '1',
					`页码 ${bad} 应纠正为 1`);
			}
		});
	});

	test('总页数非法时按 1 处理', () => {
		withDom('', () => {
			assert.doesNotThrow(() => { WebHtmlPage.renderPaging(1, 0); });
			assert.doesNotThrow(() => { WebHtmlPage.renderPaging(1, -3); });
		});
	});

});

describe('WebHtmlPage 的实例方法', () => {

	test('renderSubTitle 写入配置里的副标题', () => {
		withDom('<div id="subTitle"></div>', () => {
			new WebHtmlPage(cfg()).renderSubTitle();
			assert.equal(document.getElementById('subTitle')!.textContent, 'S');
		});
	});

	test('renderSubTitle 目标不存在时不抛错', () => {
		withDom('<div></div>', () => {
			assert.doesNotThrow(() => { new WebHtmlPage(cfg()).renderSubTitle(); });
		});
	});

	test('renderTopNav 渲染导航项，并转义文本', () => {
		withDom('<nav id="topnav"></nav>', () => {
			new WebHtmlPage(cfg()).renderTopNav(site([
				{ title: 'Home', link: '/' },
				{ title: '<script>x</script>', link: '/evil' },
			]));
			const html = document.getElementById('topnav')!.innerHTML;
			assert.ok(html.includes('Home'), '应含正常项');
			assert.ok(!html.includes('<script>'), 'title 里的标签应被转义');
			assert.ok(html.includes('&lt;script&gt;'), '应是转义后的形态');
		});
	});

	test('renderTopNav 渲染子菜单', () => {
		withDom('<nav id="topnav"></nav>', () => {
			new WebHtmlPage(cfg()).renderTopNav(site([
				{ title: 'More', subs: [{ title: 'A', link: '/a' }] },
			]));
			const nav = document.getElementById('topnav')!;
			assert.ok(nav.querySelector('li.nav-group'), '应有子菜单容器');
			assert.ok(nav.querySelector('ul.nav-sub > li > a[href="/a"]'), '应有子项');
		});
	});

	test('renderTopNav 对空列表是空操作', () => {
		withDom('<nav id="topnav"></nav>', () => {
			assert.doesNotThrow(() => {
				new WebHtmlPage(cfg()).renderTopNav(site([]));
			});
		});
	});

	test('renderTopNav 渲染品牌名与链接', () => {
		withDom('<nav id="topnav"></nav>', () => {
			new WebHtmlPage(cfg()).renderTopNav({
				brandName: 'My Site', brandLink: '/home', navItems: [], themes: [],
			});
			const brand = document.querySelector<HTMLAnchorElement>('#topnav a.nav-brand')!;
			assert.equal(brand.textContent, 'My Site');
			assert.equal(brand.getAttribute('href'), '/home');
		});
	});

	test('renderTopNav 用传入的模板替换默认骨架', () => {
		withDom('<nav id="topnav"></nav>', () => {
			new WebHtmlPage(cfg()).renderTopNav(
				site([{ title: 'Home', link: '/' }]), '#topnav',
				(ctx) => `<b>${ctx.items.length}-${ctx.brandName}-${ctx.activeTitle}</b>`);
			// activeTitle 取的是 PageConfig.pageTitle
			assert.equal(document.getElementById('topnav')!.innerHTML, '<b>1-Brand-T</b>');
		});
	});

	test('renderTopNav 目标元素不存在时不抛错', () => {
		withDom('<div></div>', () => {
			assert.doesNotThrow(() => {
				new WebHtmlPage(cfg()).renderTopNav(site([{ title: 'Home', link: '/' }]));
			});
		});
	});

});

describe('导航栏模板', () => {

	/** 当前页（`activeTitle`）、普通项、分隔符、新窗口、带 id 各一个 */
	const items: Array<NavTreeNode> = [
		{ title: 'T', link: '/t' },
		{ title: 'Other', link: '/o' },
		{
			title: 'More', subs: [
				{ title: 'Github', link: '//github.com/x/', isNewWin: true },
				{ title: '', link: '' },
				{ title: 'hobbit', id: 'switch-theme-hobbit', link: '#' }]
		},
	];

	/** 两套模板都要满足的契约 */
	const shared: Array<[string, TopNavRenderer]> = [
		['renderPlainTopNav', WebHtmlPage.renderPlainTopNav],
		['BootStrapTemplate.renderTopNav', BootStrapTemplate.renderTopNav],
	];

	for (const [name, render] of shared) {

		test(`${name}：当前页标为 li.active`, () => {
			const html = render({
				items: items, brandName: 'B', brandLink: '/', activeTitle: 'T',
			});
			withDom(`<nav>${html}</nav>`, () => {
				const active = document.querySelectorAll('li.active');
				assert.equal(active.length, 1, '只有一项是当前页');
				assert.equal(active[0].textContent, 'T');
			});
		});

		test(`${name}：title 为空串的子项渲染成分隔符`, () => {
			const html = render({
				items: items, brandName: 'B', brandLink: '/', activeTitle: 'T',
			});
			withDom(`<nav>${html}</nav>`, () => {
				assert.equal(document.querySelectorAll('li.divider').length, 1);
			});
		});

		test(`${name}：isNewWin 与 id 落到 a 标签上`, () => {
			const html = render({
				items: items, brandName: 'B', brandLink: '/', activeTitle: 'T',
			});
			withDom(`<nav>${html}</nav>`, () => {
				const gh = document.querySelector<HTMLAnchorElement>('a[href="//github.com/x/"]')!;
				assert.equal(gh.target, '_blank');
				assert.ok(document.querySelector('a#switch-theme-hobbit'), '主题项要带 id');
			});
		});

		test(`${name}：品牌名与导航项都转义`, () => {
			const html = render({
				items: [{ title: '<img src=x>', link: '"/evil"' }],
				brandName: '<script>b</script>', brandLink: '"javascript:x"',
				activeTitle: 'T',
			});
			assert.ok(!html.includes('<script>'), '品牌名的标签要转义');
			assert.ok(!html.includes('<img src=x>'), '导航项的标签要转义');
			assert.ok(html.includes('&lt;script&gt;'), '应是转义后的形态');
		});

		test(`${name}：空导航树也产出完整骨架`, () => {
			const html = render({
				items: [], brandName: 'B', brandLink: '/', activeTitle: 'T',
			});
			assert.ok(html.includes('B'), '品牌名还在');
			withDom(`<nav>${html}</nav>`, () => {
				assert.equal(document.querySelectorAll('li').length, 0, '没有导航项');
			});
		});
	}

	test('renderPlainTopNav 不带任何 CSS 框架的 class', () => {
		const html = WebHtmlPage.renderPlainTopNav({
			items: items, brandName: 'B', brandLink: '/', activeTitle: 'T',
		});
		// 这是这个模板存在的意义：库层不绑定 Bootstrap
		for (const bs of ['navbar', 'dropdown', 'caret', 'data-toggle', 'sr-only']) {
			assert.ok(!html.includes(bs), `不该出现 Bootstrap 的 ${bs}`);
		}
	});

	test('BootStrapTemplate.renderTopNav 产出 BS3 骨架', () => {
		const html = BootStrapTemplate.renderTopNav({
			items: items, brandName: 'B', brandLink: '/', activeTitle: 'T',
		});
		for (const bs of ['navbar-header', 'navbar-toggle', 'navbar-brand',
			'navbar-collapse', 'nav navbar-nav', 'dropdown-toggle', 'dropdown-menu']) {
			assert.ok(html.includes(bs), `应含 BS3 的 ${bs}`);
		}
		withDom(`<nav>${html}</nav>`, () => {
			// 折叠按钮的 data-target 要对上容器 id，否则小屏下展不开
			const btn = document.querySelector('button.navbar-toggle')!;
			const target = btn.getAttribute('data-target')!;
			assert.ok(document.querySelector(target), `${target} 应存在`);
		});
	});

});
