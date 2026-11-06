/**
 * WebUtil 里碰 DOM 的部分
 *
 * 重点是 `initCustomElements()` —— 它注册 `esp-unicode` 标签，
 * 而这个标签的实现曾经写在模块顶层，导致无 DOM 的环境 import 即崩
 * （见 design-pkg.md）。挪进方法后行为应当不变，这里把行为钉下来。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { withDom } from './_jsdom-setup.js';
import { WebUtil } from '../../main/ts/web.js';

describe('WebUtil.initCustomElements', () => {

	test('注册后 esp-unicode 标签生效', () => {
		withDom('', () => {
			WebUtil.initCustomElements();
			assert.ok(customElements.get('esp-unicode'),
				'esp-unicode 应已注册');
		});
	});

	test('已有的 esp-unicode 元素会被 upgrade 并解码实体', () => {
		// 页面里先有标签，再注册 —— 自定义元素规范要求此时触发 upgrade
		withDom('<esp-unicode>&amp;#x26f5;</esp-unicode>', () => {
			WebUtil.initCustomElements();
			const el = document.querySelector('esp-unicode');
			assert.ok(el, '元素应存在');
			// `&amp;#x26f5;` 解码后应渲染成 ⛵
			assert.equal(el!.textContent, '⛵',
				`应解码为 ⛵，实际 ${JSON.stringify(el!.textContent)}`);
		});
	});

	test('十进制实体同样能解码', () => {
		withDom('<esp-unicode>&amp;#9973;</esp-unicode>', () => {
			WebUtil.initCustomElements();
			const el = document.querySelector('esp-unicode');
			assert.equal(el!.textContent, '⛵');
		});
	});

	test('注册后新建的元素也走同样的解码', () => {
		withDom('<div id="host"></div>', () => {
			WebUtil.initCustomElements();
			const host = document.getElementById('host')!;
			host.innerHTML = '<esp-unicode>&amp;#x26f5;</esp-unicode>';
			assert.equal(host.querySelector('esp-unicode')!.textContent, '⛵');
		});
	});

	test('一个标签里的多个实体全部还原', () => {
		// 实现的正则带 `g` 标志就是为了这个。去掉 g 只会换掉第一个，
		// 而那种退化用单实体的用例测不出来
		withDom('<esp-unicode>&amp;#x26f5;&amp;#x2600;&amp;#x2601;</esp-unicode>', () => {
			WebUtil.initCustomElements();
			const txt = document.querySelector('esp-unicode')!.textContent;
			assert.equal(txt, '⛵☀☁',
				`三个实体应全部还原，实际 ${JSON.stringify(txt)}`);
		});
	});

	test('实体之间夹着普通文字也能全部还原', () => {
		withDom('<esp-unicode>a&amp;#x26f5;b&amp;#x2600;c</esp-unicode>', () => {
			WebUtil.initCustomElements();
			assert.equal(
				document.querySelector('esp-unicode')!.textContent, 'a⛵b☀c');
		});
	});

	test('不含实体的内容原样保留', () => {
		withDom('<esp-unicode>plain text</esp-unicode>', () => {
			WebUtil.initCustomElements();
			assert.equal(
				document.querySelector('esp-unicode')!.textContent, 'plain text');
		});
	});

	test('重复调用不抛错', () => {
		// customElements.define 对同名重复注册会抛 NotSupportedError，
		// 调用方（每个页面的初始化流程）可能不止调一次
		withDom('', () => {
			WebUtil.initCustomElements();
			assert.doesNotThrow(() => { WebUtil.initCustomElements(); },
				'第二次调用不应抛错');
		});
	});

});

describe('WebUtil.lazyLoadImages', () => {

	test('不支持 IntersectionObserver 时退化为立即全部加载', () => {
		withDom(
			'<img data-origin="a.jpg"><img data-origin="b.jpg">', () => {
				// jsdom 没有 IntersectionObserver，正好测这个退化分支
				const g = globalThis as unknown as Record<string, unknown>;
				assert.equal(g.IntersectionObserver, undefined,
					'前提：jsdom 不提供 IntersectionObserver');

				const ob = WebUtil.lazyLoadImages('img[data-origin]');
				assert.equal(ob, null, '不支持时应返回 null');

				const imgs = document.querySelectorAll<HTMLImageElement>('img[data-origin]');
				for (const img of imgs) {
					assert.ok(img.getAttribute('src'),
						'退化路径应把 data-origin 写进 src');
				}
			});
	});

	test('没有匹配元素时返回 null，不抛错', () => {
		withDom('<div></div>', () => {
			assert.equal(WebUtil.lazyLoadImages('img[data-origin]'), null);
		});
	});

	test('data-origin 保留，供点击放大等逻辑取原图', () => {
		withDom('<img data-origin="orig.jpg">', () => {
			WebUtil.lazyLoadImages('img[data-origin]');
			const img = document.querySelector<HTMLImageElement>('img')!;
			assert.equal(img.getAttribute('data-origin'), 'orig.jpg',
				'data-origin 不应被清掉');
		});
	});

});
