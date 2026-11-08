/**
 * 选场景页：回填、进入/编辑跳转、换身份跳登录页
 *
 * sandbox 模块迁移的期 5 产物。2026-11-07 把「登录」和「选场景」拆成两页之后，
 * 这里只测 `index.html` 的选场景页（登录页的请求测在 `sandbox.login.test.ts`）。
 * 这一页**不发请求** —— 进入场景只读 cookie、拼 URL 跳 view / editor，
 * 换身份只跳 login.html —— 所以不碰 Canvas，能测得比较全。
 *
 * 要盯住的：
 *
 * - **跳转前检查登录态**：没登录点「进入场景」就提示，不跳
 * - **三个场景参数缺一个就不跳**
 * - **参数做 URL 编码**：战役名里一个空格或 `&` 会把后面的参数截断
 * - **换身份跳登录页时带上场景参数**：登录回来不用重填三级定位
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { withDom } from './_jsdom-setup.js';
import { initSandboxIndex } from '../../main/ts/sandbox/sandboxLogin.js';

/** 选场景页的 DOM，和 html/sandbox/index.html 一致：一个桌面容器，窗口由脚本建 */
const PAGE = `<div id="sandbox-desktop" class="desktop dock-content"></div>`;

/** 点一个按钮 */
function click(id: string): void {
	document.getElementById(id)!.dispatchEvent(new MouseEvent('click'));
}

/** 读状态提示 */
const status = () => document.getElementById('login-status')!.textContent ?? '';

/** 填输入框 */
function fill(id: string, v: string): void {
	(document.getElementById(id) as HTMLInputElement).value = v;
}

/** 已经登录：写身份 cookie */
function loginCookies(): void {
	document.cookie = 'username=teo;path=/';
	document.cookie = 'loginToken=teo|uuid|1;path=/';
}

describe('init 回填', () => {

	test('URL 带场景参数时回填进输入框（方便分享链接）', () => {
		withDom(PAGE, () => {
			initSandboxIndex({ iconBaseUrl: '//cdn/SE98' });
			assert.equal((document.getElementById('campaignId') as HTMLInputElement).value, '1');
			assert.equal((document.getElementById('placeId') as HTMLInputElement).value, '2');
			assert.equal((document.getElementById('sceneId') as HTMLInputElement).value, '3');
			assert.equal((document.getElementById('campaignName') as HTMLInputElement).value, 'Waterdeep');
			assert.equal((document.getElementById('placeName') as HTMLInputElement).value, 'Harbor');
			assert.equal((document.getElementById('sceneName') as HTMLInputElement).value, 'Dock');
		}, 'http://localhost/index.html?campaignId=1&placeId=2&sceneId=3'
			+ '&campaignName=Waterdeep&placeName=Harbor&sceneName=Dock');
	});

	test('没有 cookie 时提示请先登录', () => {
		withDom(PAGE, () => {
			initSandboxIndex({ iconBaseUrl: '//cdn/SE98' });
			assert.ok(status().includes('请先登录'), `实际: ${status()}`);
		});
	});

	test('已有 cookie 时显示当前身份', () => {
		withDom(PAGE, () => {
			loginCookies();
			initSandboxIndex({ iconBaseUrl: '//cdn/SE98' });
			assert.ok(status().includes('已登录'), `实际: ${status()}`);
			assert.ok(status().includes('teo'), `实际: ${status()}`);
		});
	});

});

describe('进入场景', () => {

	test('没登录时不跳转，提示请先登录', () => {
		withDom(PAGE, () => {
			initSandboxIndex({ iconBaseUrl: '//cdn/SE98' });
			fill('campaignId', '1');
			fill('placeId', '2');
			fill('sceneId', '3');
			click('btn-enter');
			assert.ok(status().includes('请先登录'), `实际: ${status()}`);
		});
	});

	test('三个场景参数缺一个就不跳', () => {
		withDom(PAGE, () => {
			loginCookies();
			initSandboxIndex({ iconBaseUrl: '//cdn/SE98' });
			fill('campaignId', '1');
			fill('placeId', '2');
			fill('sceneId', '');
			click('btn-enter');
			assert.ok(status().includes('三个 ID 都要填'), `实际: ${status()}`);
		});
	});

	test('齐全时拼出带三级定位（3 id + 3 名字）的玩家视图地址', () => {
		withDom(PAGE, () => {
			loginCookies();
			let jumped = '';
			initSandboxIndex({ iconBaseUrl: '//cdn/SE98', navigate: u => { jumped = u; } });
			fill('campaignId', '1');
			fill('placeId', '2');
			fill('sceneId', '3');
			fill('campaignName', 'Waterdeep');
			fill('placeName', 'Harbor');
			fill('sceneName', 'Dock');
			click('btn-enter');
			assert.equal(jumped, './view.html?campaignId=1&placeId=2&sceneId=3'
				+ '&campaignName=Waterdeep&placeName=Harbor&sceneName=Dock');
		});
	});

	test('编辑按钮跳编辑器地址', () => {
		withDom(PAGE, () => {
			loginCookies();
			let jumped = '';
			initSandboxIndex({ iconBaseUrl: '//cdn/SE98', navigate: u => { jumped = u; } });
			fill('campaignId', '1');
			fill('placeId', '2');
			fill('sceneId', '3');
			click('btn-edit');
			assert.equal(jumped, './editor.html?campaignId=1&placeId=2&sceneId=3');
		});
	});

	test('场景名里的空格与 & 被 URL 编码', () => {
		withDom(PAGE, () => {
			loginCookies();
			let jumped = '';
			initSandboxIndex({ iconBaseUrl: '//cdn/SE98', navigate: u => { jumped = u; } });
			fill('campaignId', '1');
			fill('placeId', '2');
			fill('sceneId', '3');
			fill('campaignName', '费伦 大陆');
			fill('placeName', 'A&B');
			fill('sceneName', 's1');
			click('btn-enter');
			const expected = './view.html?campaignId=1&placeId=2&sceneId=3'
				+ '&campaignName=' + encodeURIComponent('费伦 大陆')
				+ '&placeName=A%26B&sceneName=s1';
			assert.equal(jumped, expected);
		});
	});

	test('自定义玩家视图地址生效', () => {
		withDom(PAGE, () => {
			loginCookies();
			let jumped = '';
			initSandboxIndex({ iconBaseUrl: '//cdn/SE98', viewUrl: '/custom/v.html', navigate: u => { jumped = u; } });
			fill('campaignId', '1');
			fill('placeId', '2');
			fill('sceneId', '3');
			click('btn-enter');
			assert.equal(jumped, '/custom/v.html?campaignId=1&placeId=2&sceneId=3');
		});
	});

});

describe('换身份登录', () => {

	test('带着填好的场景参数跳 login.html', () => {
		withDom(PAGE, () => {
			let jumped = '';
			initSandboxIndex({ iconBaseUrl: '//cdn/SE98', navigate: u => { jumped = u; } });
			fill('campaignId', '1');
			fill('placeId', '2');
			fill('sceneId', '3');
			click('btn-switch-login');
			assert.equal(jumped, './login.html?campaignId=1&placeId=2&sceneId=3');
		});
	});

	test('场景参数为空时只跳 login.html 不带查询串', () => {
		withDom(PAGE, () => {
			let jumped = '';
			initSandboxIndex({ iconBaseUrl: '//cdn/SE98', navigate: u => { jumped = u; } });
			click('btn-switch-login');
			assert.equal(jumped, './login.html');
		});
	});

	test('自定义登录页地址生效', () => {
		withDom(PAGE, () => {
			let jumped = '';
			initSandboxIndex({ iconBaseUrl: '//cdn/SE98', loginUrl: '/auth.html', navigate: u => { jumped = u; } });
			fill('campaignId', '1');
			click('btn-switch-login');
			assert.equal(jumped, '/auth.html?campaignId=1');
		});
	});

});

describe('选择器可覆盖', () => {

	test('桌面容器缺失时抛可读的错', () => {
		withDom('<div></div>', () => {
			assert.throws(() => initSandboxIndex({ iconBaseUrl: '//cdn/SE98' }), /桌面容器/);
		});
	});

});
