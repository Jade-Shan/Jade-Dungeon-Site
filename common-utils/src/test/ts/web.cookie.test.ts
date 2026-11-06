/**
 * WebUtil 的 Cookie 读写
 *
 * 这组是 DOM 层里最值得测的 —— 主题切换（`ui.theme`）和当前用户
 * （`data.currUser`）都靠它持久化，解析逻辑有不少边界。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { withDom } from './_jsdom-setup.js';
import { WebUtil } from '../../main/ts/web.js';

describe('WebUtil.setCookieValue / loadCookieValue', () => {

	test('写进去能读出来', () => {
		withDom('', () => {
			WebUtil.setCookieValue('k', 'v', { sameSite: 'Lax' });
			assert.equal(WebUtil.loadCookieValue('k'), 'v');
		});
	});

	test('读不存在的键返回空串', () => {
		withDom('', () => {
			assert.equal(WebUtil.loadCookieValue('nope'), '');
		});
	});

	test('多个 cookie 并存时各取各的', () => {
		withDom('', () => {
			WebUtil.setCookieValue('a', '1', { sameSite: 'Lax' });
			WebUtil.setCookieValue('b', '2', { sameSite: 'Lax' });
			WebUtil.setCookieValue('c', '3', { sameSite: 'Lax' });
			assert.equal(WebUtil.loadCookieValue('a'), '1');
			assert.equal(WebUtil.loadCookieValue('b'), '2');
			assert.equal(WebUtil.loadCookieValue('c'), '3');
		});
	});

	test('键名是前缀关系时不会串台', () => {
		// 朴素的 indexOf 解析容易把 `ui.theme` 的值读成 `ui.themeX` 的
		withDom('', () => {
			WebUtil.setCookieValue('ui', 'A', { sameSite: 'Lax' });
			WebUtil.setCookieValue('ui.theme', 'B', { sameSite: 'Lax' });
			assert.equal(WebUtil.loadCookieValue('ui'), 'A');
			assert.equal(WebUtil.loadCookieValue('ui.theme'), 'B');
		});
	});

	test('覆盖同名键', () => {
		withDom('', () => {
			WebUtil.setCookieValue('k', 'old', { sameSite: 'Lax' });
			WebUtil.setCookieValue('k', 'new', { sameSite: 'Lax' });
			assert.equal(WebUtil.loadCookieValue('k'), 'new');
		});
	});

	test('值为空串', () => {
		withDom('', () => {
			WebUtil.setCookieValue('empty', '', { sameSite: 'Lax' });
			assert.equal(WebUtil.loadCookieValue('empty'), '');
		});
	});

	test('每个用例是独立的 DOM，cookie 不会互相污染', () => {
		withDom('', () => {
			WebUtil.setCookieValue('leak', 'x', { sameSite: 'Lax' });
			assert.equal(WebUtil.loadCookieValue('leak'), 'x');
		});
		withDom('', () => {
			assert.equal(WebUtil.loadCookieValue('leak'), '',
				'上一个用例写的 cookie 不应出现在这里');
		});
	});

});

describe('WebUtil.deleteCookie', () => {

	test('删掉后读不到', () => {
		withDom('', () => {
			WebUtil.setCookieValue('k', 'v', { sameSite: 'Lax' });
			assert.equal(WebUtil.loadCookieValue('k'), 'v');
			WebUtil.deleteCookie('k');
			assert.equal(WebUtil.loadCookieValue('k'), '');
		});
	});

	test('删不存在的键是安全的空操作', () => {
		withDom('', () => {
			WebUtil.deleteCookie('nope');
			assert.equal(WebUtil.loadCookieValue('nope'), '');
		});
	});

	test('只删指定的那个，不碰别的', () => {
		withDom('', () => {
			WebUtil.setCookieValue('keep', '1', { sameSite: 'Lax' });
			WebUtil.setCookieValue('drop', '2', { sameSite: 'Lax' });
			WebUtil.deleteCookie('drop');
			assert.equal(WebUtil.loadCookieValue('drop'), '');
			assert.equal(WebUtil.loadCookieValue('keep'), '1', 'keep 不该被删掉');
		});
	});

});
