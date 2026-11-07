/**
 * 修改密码页：本地校验 + 提交 + 返回登录
 *
 * 2026-11-07 从登录页把「注册」换成「修改密码」单开一页。这一页不碰 Canvas，
 * 所以能测得比较全。用户名从 URL 参数带来（登录页跳转时带上），
 * 页面里只有三个密码框。
 *
 * 要盯住的：
 *
 * - **本地校验先拦一道**：用户名缺失、三个框有空、两次新密码不一致、
 *   强度不够（<8 位或缺数字/字母/特殊字符）都在发请求前拦下
 * - **密码走 POST 不进 URL**
 * - **成功后回登录页**：旧 token 已被后端作废，要重新登录
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { withDom, withDomAsync } from './_jsdom-setup.js';
import { initSandboxChangePassword } from '../../main/ts/sandbox/sandboxLogin.js';

/** 修改密码页的 DOM，和 html/sandbox/changePassword.html 一致：一个桌面容器 */
const PAGE = `<div id="sandbox-desktop" class="desktop dock-content"></div>`;

/** 记下假 XHR 收到的请求 */
let sent: Array<{ url: string, method: string, body?: string }> = [];

/** 用假 XHR 顶替真实请求 */
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
const status = () => document.getElementById('change-password-status')!.textContent ?? '';

/** 填输入框 */
function fill(id: string, v: string): void {
	(document.getElementById(id) as HTMLInputElement).value = v;
}

/** 填满三个密码框（新密码两次一致） */
function fillAll(oldPw: string, newPw: string): void {
	fill('old-password', oldPw);
	fill('new-password', newPw);
	fill('confirm-password', newPw);
}

/** 带用户名的页面地址（登录页跳转过来的样子） */
const WITH_USER = 'http://localhost/changePassword.html?username=teo';

describe('提交前本地校验', () => {

	test('缺少用户名时提示从登录页进入，不发请求', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr({ status: 'success' });
			initSandboxChangePassword({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api' });
			fillAll('old', 'newpass1!');
			click('btn-submit-change');
			await new Promise(r => setTimeout(r, 10));
			assert.ok(status().includes('缺少用户名'), `实际: ${status()}`);
			assert.equal(sent.length, 0, '不该发请求');
		});
	});

	test('三个密码框有空时不发请求', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr({ status: 'success' });
			initSandboxChangePassword({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api' });
			fill('old-password', 'old');
			click('btn-submit-change');
			await new Promise(r => setTimeout(r, 10));
			assert.ok(status().includes('三个密码框都要填'), `实际: ${status()}`);
			assert.equal(sent.length, 0, '不该发请求');
		}, WITH_USER);
	});

	test('两次新密码不一致时提示，不发请求', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr({ status: 'success' });
			initSandboxChangePassword({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api' });
			fill('old-password', 'old');
			fill('new-password', 'newpass1!');
			fill('confirm-password', 'newpass2!');
			click('btn-submit-change');
			await new Promise(r => setTimeout(r, 10));
			assert.ok(status().includes('不一致'), `实际: ${status()}`);
			assert.equal(sent.length, 0, '不该发请求');
		}, WITH_USER);
	});

	test('新密码少于 8 位时提示，不发请求', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr({ status: 'success' });
			initSandboxChangePassword({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api' });
			fillAll('old', 'a1!b2');
			click('btn-submit-change');
			await new Promise(r => setTimeout(r, 10));
			assert.ok(status().includes('至少 8 位'), `实际: ${status()}`);
			assert.equal(sent.length, 0, '不该发请求');
		}, WITH_USER);
	});

	test('新密码缺数字时提示，不发请求', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr({ status: 'success' });
			initSandboxChangePassword({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api' });
			fillAll('old', 'abcdefgh!');
			click('btn-submit-change');
			await new Promise(r => setTimeout(r, 10));
			assert.ok(status().includes('数字、字母、特殊字符'), `实际: ${status()}`);
			assert.equal(sent.length, 0, '不该发请求');
		}, WITH_USER);
	});

	test('新密码缺字母时提示，不发请求', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr({ status: 'success' });
			initSandboxChangePassword({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api' });
			fillAll('old', '12345678!');
			click('btn-submit-change');
			await new Promise(r => setTimeout(r, 10));
			assert.ok(status().includes('数字、字母、特殊字符'), `实际: ${status()}`);
			assert.equal(sent.length, 0, '不该发请求');
		}, WITH_USER);
	});

	test('新密码缺特殊字符时提示，不发请求', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr({ status: 'success' });
			initSandboxChangePassword({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api' });
			fillAll('old', 'abcd1234');
			click('btn-submit-change');
			await new Promise(r => setTimeout(r, 10));
			assert.ok(status().includes('数字、字母、特殊字符'), `实际: ${status()}`);
			assert.equal(sent.length, 0, '不该发请求');
		}, WITH_USER);
	});

});

describe('提交', () => {

	test('成功后回登录页重新登录', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr({ status: 'success' });
			let jumped = '';
			initSandboxChangePassword({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api', navigate: u => { jumped = u; } });
			fillAll('old', 'newpass1!');
			click('btn-submit-change');
			await new Promise(r => setTimeout(r, 10));
			assert.equal(jumped, './login.html');
		}, WITH_USER);
	});

	test('走 POST，新密码不出现在 URL 里', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr({ status: 'success' });
			initSandboxChangePassword({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api', navigate: () => { } });
			fillAll('old', 'newpass1!');
			click('btn-submit-change');
			await new Promise(r => setTimeout(r, 10));
			assert.equal(sent[0].method, 'POST');
			assert.ok(!sent[0].url.includes('newpass1!'), '新密码不该出现在 URL');
			assert.ok(sent[0].body?.includes('newpass1!'), '新密码应该在请求体里');
			assert.ok(sent[0].body?.includes('oldPassword=old'), '旧密码应该在请求体里');
		}, WITH_USER);
	});

	test('旧密码错时显示后端给的原因，不跳转', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr({ status: 'err', msg: '旧密码错误' });
			let jumped = '';
			initSandboxChangePassword({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api', navigate: u => { jumped = u; } });
			fillAll('bad', 'newpass1!');
			click('btn-submit-change');
			await new Promise(r => setTimeout(r, 10));
			assert.ok(status().includes('旧密码错误'), `实际: ${status()}`);
			assert.equal(jumped, '', '失败不该跳转');
		}, WITH_USER);
	});

});

describe('返回登录', () => {

	test('点返回按钮跳回 login.html', () => {
		withDom(PAGE, () => {
			let jumped = '';
			initSandboxChangePassword({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api', navigate: u => { jumped = u; } });
			click('btn-back-login');
			assert.equal(jumped, './login.html');
		});
	});

	test('自定义登录页地址生效', () => {
		withDom(PAGE, () => {
			let jumped = '';
			initSandboxChangePassword({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api', loginUrl: '/login', navigate: u => { jumped = u; } });
			click('btn-back-login');
			assert.equal(jumped, '/login');
		});
	});

});

describe('选择器可覆盖', () => {

	test('桌面容器缺失时抛可读的错', () => {
		withDom('<div></div>', () => {
			assert.throws(() => initSandboxChangePassword({ iconBaseUrl: '//cdn/SE98', apiRoot: '//api' }), /桌面容器/);
		});
	});

});
