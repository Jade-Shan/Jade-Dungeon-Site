/**
 * 登录页：登录 / 修改密码跳转 / 返回选战役
 *
 * sandbox 模块迁移的期 5 产物。2026-11-07 把「登录」和「选战役」拆成两页之后，
 * 这里只测 `login.html` 的登录页（选战役页的跳转测在 `sandbox.index.test.ts`，
 * 修改密码页测在 `sandbox.changePassword.test.ts`）。这一页不碰 Canvas，能测得比较全。
 *
 * 要盯住的：
 *
 * - **密码走 POST 不进 URL**：GET 会把密码留在 URL、浏览器历史和访问日志里
 * - **登录成功带着场景参数回 index.html**：用户在 index 填好的三级定位不丢
 * - **「修改密码」带着用户名跳 changePassword.html**：用户名是改谁的依据
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { withDom, withDomAsync } from './_jsdom-setup.js';
import { initSandboxLogin } from '../../main/ts/sandbox/sandboxLogin.js';

/** 登录页的 DOM，和 html/sandbox/login.html 一致：一个桌面容器，窗口由脚本建 */
const PAGE = `<div id="sandbox-desktop" class="desktop dock-content"></div>`;

/** 记下假 XHR 收到的请求 */
let sent: Array<{ url: string, method: string, body?: string }> = [];

/**
 * 用假 XHR 顶替真实请求
 * @param resp - 响应体
 */
function stubXhr(resp: unknown): void {
	sent = [];
	class FakeXhr {
		status = 200;
		statusText = 'OK';
		responseText = '';
		timeout = 0;
		withCredentials = false;
		onload: ((e: unknown) => void) | null = null;
		onerror: ((e: unknown) => void) | null = null;
		private url = '';
		private method = '';
		open(m: string, u: string): void { this.method = m; this.url = u; }
		setRequestHeader(): void { }
		send(body?: string): void {
			sent.push({ url: this.url, method: this.method, body: body });
			this.responseText = JSON.stringify(resp);
			this.onload?.({});
		}
	}
	(globalThis as unknown as Record<string, unknown>).XMLHttpRequest = FakeXhr;
}

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

describe('init 回填', () => {

	test('已有 cookie 时回填用户名（换身份省一次输入）', () => {
		withDom(PAGE, () => {
			document.cookie = 'username=teo;path=/';
			initSandboxLogin({ iconBaseUrl: '//cdn/SE98', apiRoot: '/' });
			assert.equal((document.getElementById('username') as HTMLInputElement).value, 'teo');
		});
	});

});

describe('登录', () => {

	test('成功后写 cookie 并跳回 index.html', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr({ status: 'success', username: 'teo', token: 'teo|uuid|9' });
			let jumped = '';
			initSandboxLogin({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api', navigate: u => { jumped = u; } });
			fill('username', 'teo');
			fill('password', 'pw');
			click('btn-login');
			await new Promise(r => setTimeout(r, 10));
			assert.ok(document.cookie.includes('username=teo'), `cookie: ${document.cookie}`);
			assert.ok(document.cookie.includes('loginToken='), `cookie: ${document.cookie}`);
			assert.equal(jumped, './index.html');
		});
	});

	test('登录成功带着场景参数回 index.html', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr({ status: 'success', username: 'teo', token: 't' });
			let jumped = '';
			initSandboxLogin({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api', navigate: u => { jumped = u; } });
			fill('username', 'teo');
			fill('password', 'pw');
			click('btn-login');
			await new Promise(r => setTimeout(r, 10));
			assert.equal(jumped, './index.html?campaignId=1&placeId=2&sceneId=3'
				+ '&campaignName=Waterdeep&placeName=Harbor&sceneName=Dock');
		}, 'http://localhost/login.html?campaignId=1&placeId=2&sceneId=3'
			+ '&campaignName=Waterdeep&placeName=Harbor&sceneName=Dock');
	});

	test('走 POST，密码不出现在 URL 里', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr({ status: 'success', username: 'teo', token: 't' });
			initSandboxLogin({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api', navigate: () => { } });
			fill('username', 'teo');
			fill('password', 'secret-pw');
			click('btn-login');
			await new Promise(r => setTimeout(r, 10));
			assert.equal(sent[0].method, 'POST');
			assert.ok(!sent[0].url.includes('secret-pw'),
				'密码走 GET 会留在 URL、浏览器历史和访问日志里');
			assert.ok(sent[0].body?.includes('secret-pw'), '应该在请求体里');
		});
	});

	test('失败时显示后端给的原因，不写 cookie', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr({ status: 'err', msg: 'wrong password' });
			initSandboxLogin({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api' });
			fill('username', 'teo');
			fill('password', 'bad');
			click('btn-login');
			await new Promise(r => setTimeout(r, 10));
			assert.ok(status().includes('wrong password'), `实际: ${status()}`);
			assert.ok(!document.cookie.includes('loginToken'), '失败不该写 token');
		});
	});

	test('用户名或密码为空时不发请求', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr({ status: 'success' });
			initSandboxLogin({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api' });
			fill('username', 'teo');
			click('btn-login');
			await new Promise(r => setTimeout(r, 10));
			assert.equal(sent.length, 0, '不该发请求');
			assert.ok(status().includes('都要填'), `实际: ${status()}`);
		});
	});

	test('输入框的首尾空白被去掉', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr({ status: 'success', username: 'teo', token: 't' });
			initSandboxLogin({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api', navigate: () => { } });
			fill('username', '  teo  ');
			fill('password', 'pw');
			click('btn-login');
			await new Promise(r => setTimeout(r, 10));
			assert.ok(sent[0].body?.includes('username=teo&'), `实际: ${sent[0].body}`);
		});
	});

});

describe('修改密码跳转', () => {

	test('点修改密码带着用户名跳 changePassword.html', () => {
		withDom(PAGE, () => {
			let jumped = '';
			initSandboxLogin({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api', navigate: u => { jumped = u; } });
			fill('username', 'teo');
			click('btn-change-password');
			assert.equal(jumped, './changePassword.html?username=teo');
		});
	});

	test('用户名为空时只跳 changePassword.html 不带查询串', () => {
		withDom(PAGE, () => {
			let jumped = '';
			initSandboxLogin({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api', navigate: u => { jumped = u; } });
			click('btn-change-password');
			assert.equal(jumped, './changePassword.html');
		});
	});

	test('用户名里的特殊字符被 URL 编码', () => {
		withDom(PAGE, () => {
			let jumped = '';
			initSandboxLogin({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api', navigate: u => { jumped = u; } });
			fill('username', 'a&b c');
			click('btn-change-password');
			assert.equal(jumped, './changePassword.html?username=a%26b%20c');
		});
	});

});

describe('返回选战役', () => {

	test('点返回按钮带着场景参数回 index.html', () => {
		withDom(PAGE, () => {
			let jumped = '';
			initSandboxLogin({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api', navigate: u => { jumped = u; } });
			click('btn-back');
			assert.equal(jumped, './index.html?campaignId=1&placeId=2&sceneId=3'
				+ '&campaignName=Waterdeep&placeName=Harbor&sceneName=Dock');
		}, 'http://localhost/login.html?campaignId=1&placeId=2&sceneId=3'
			+ '&campaignName=Waterdeep&placeName=Harbor&sceneName=Dock');
	});

	test('没有场景参数时只回 index.html 不带查询串', () => {
		withDom(PAGE, () => {
			let jumped = '';
			initSandboxLogin({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api', navigate: u => { jumped = u; } });
			click('btn-back');
			assert.equal(jumped, './index.html');
		});
	});

});

describe('选择器可覆盖', () => {

	test('传了覆盖项时按覆盖后的 id 建元素并跳转', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr({ status: 'success', username: 'teo', token: 't' });
			let jumped = '';
			initSandboxLogin({
				iconBaseUrl: '//cdn/SE98', apiRoot: '//api',
				navigate: u => { jumped = u; },
				selectors: {
					username: '#my-user', password: '#my-pw',
					loginBtn: '#my-login', status: '#my-status',
				},
			});
			(document.getElementById('my-user') as HTMLInputElement).value = 'teo';
			(document.getElementById('my-pw') as HTMLInputElement).value = 'pw';
			document.getElementById('my-login')!.dispatchEvent(new MouseEvent('click'));
			await new Promise(r => setTimeout(r, 10));
			assert.equal(jumped, './index.html', '覆盖后的登录按钮要能触发登录并跳转');
		});
	});

	test('桌面容器缺失时抛可读的错', () => {
		withDom('<div></div>', () => {
			assert.throws(() => initSandboxLogin({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api' }), /桌面容器/);
		});
	});

});
