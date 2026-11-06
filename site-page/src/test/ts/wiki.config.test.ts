/**
 * Wiki 页面的配置表
 *
 * P2 第三项的产物：`apiRoot` / `pageTitle` / brush 脚本目录原来写死在
 * `initWikiPage()` 的函数体里，其中 brush 目录指向本项目之外的 vimwiki 项目。
 * 现在三项都可注入，默认值保持原样。
 *
 * 这里只测配置表本身，不测 `initWikiPage()` —— 它要 jQuery、MathJax、
 * SyntaxHighlighter 三个全局库，脱离浏览器跑不起来。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	DEFAULT_WIKI_PAGE_CONFIG, WikiPageConfig,
} from '../../main/ts/blog/wiki.js';

describe('DEFAULT_WIKI_PAGE_CONFIG', () => {

	test('四项默认值与重构前写死的值一致', () => {
		// 这条是「改动提醒」而不是「禁止改动」：下游 vimwiki 项目确定整体重构，
		// 不再构成兼容性约束（见 docs/refactor-20261101.md 18.10 节）。
		// 有意识地改默认值时，连这条断言一起更新
		assert.deepEqual(DEFAULT_WIKI_PAGE_CONFIG, {
			apiRoot: '/',
			pageTitle: 'Study Notes',
			hlCodePath: '../../vimwiki-theme/3rd/SyntaxHighlighter/2.1.364/scripts',
			ajaxTimeout: 500,
		});
	});

	test('hlCodePath 不带尾斜杠', () => {
		// loadCodeHightlight 内部拼的是 `${root}${path}/`，带尾斜杠会出现 //
		assert.ok(!DEFAULT_WIKI_PAGE_CONFIG.hlCodePath.endsWith('/'));
	});

	test('展开覆盖时只改传了的项', () => {
		const opt: WikiPageConfig = { hlCodePath: '/my/brushes' };
		const merged = { ...DEFAULT_WIKI_PAGE_CONFIG, ...opt };
		assert.equal(merged.hlCodePath, '/my/brushes');
		assert.equal(merged.pageTitle, 'Study Notes', '没传的项不受影响');
	});

});
