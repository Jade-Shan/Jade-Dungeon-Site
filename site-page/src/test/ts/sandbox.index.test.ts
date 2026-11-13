/**
 * 选战役页：加载战役表格、选中后进入、换身份跳登录页
 *
 * sandbox 模块迁移的期 5 产物。2026-11-08 把「六个手填输入框」换成了「从数据库
 * 列出的战役表格」：页面加载时请求 `/api/sandtable/list-scene`，填一张
 * （战役 / 地点 / 场景 / owner）表格，用户选中一行再点「进入战役」或「编辑战役」。
 * 表格一行一个战役 —— 后端直接查 `sandtable_campaign` 的 curr_place_* /
 * curr_scene_* 字段，不再 JOIN place / scene 表。
 *
 * 要盯住的：
 *
 * - **列表加载后才出现行**，加载中 / 失败 / 空列表在表格下方的说明行里提示
 * - **跳转前检查登录态**：没登录点「进入战役」就提示，不跳
 * - **没选中就不跳**
 * - **6 值不全的记录进不去**：campaign 还没绑好当前地点/场景时（curr_place_* /
 *   curr_scene_* 为空），「进入战役」按钮禁用。这是第一道防护，
 *   后端 load-map 还有第二道
 * - **参数做 URL 编码**：战役名里一个空格或 `&` 会把后面的参数截断
 * - **换身份跳登录页时带上选中项**：登录回来不用重新选
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { withDom, withDomAsync } from './_jsdom-setup.js';
import { initSandboxIndex } from '../../main/ts/sandbox/sandboxLogin.js';

/** 选战役页的 DOM，和 html/sandbox/index.html 一致：一个桌面容器，窗口由脚本建 */
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
/** 读表格下方的说明行 */
const note = () => document.getElementById('campaign-note')!.textContent ?? '';

/** 已经登录：写身份 cookie */
function loginCookies(): void {
	document.cookie = 'username=teo;path=/';
	document.cookie = 'loginToken=teo|uuid|1;path=/';
}

/** 等异步加载（list-scene 的 XHR 落定 + 微任务） */
async function settle(): Promise<void> {
	await new Promise(r => setTimeout(r, 10));
}

/** 表格里所有的行 */
function rows(): Array<HTMLTableRowElement> {
	return Array.from(document.querySelectorAll<HTMLTableRowElement>('#campaign-table tbody tr'));
}

/** 点指定 campaignId 的那一行（模拟用户点行选中） */
function selectCampaign(campaignId: number): void {
	const tr = rows().find(r => r.dataset.campaignId === String(campaignId));
	assert.ok(tr, `找不到 campaignId=${campaignId} 的行`);
	tr!.dispatchEvent(new MouseEvent('click'));
}

/**
 * 战役列表 fixture：三个战役，跨两个 owner。
 * 前两个绑好了当前地点/场景，最后一个（荒原）curr_place_* / curr_scene_* 为空，
 * 用来测「6 值不全 → 按钮禁用」。
 */
const CAMPAIGNS = [
	{ campaignId: 1, campaignName: '费伦大陆', owner: 'teo', currPlaceId: 2, currPlaceName: '深水城', currSceneId: 3, currSceneName: '港口' },
	{ campaignId: 5, campaignName: '异域', owner: 'alice', currPlaceId: 6, currPlaceName: '印记城', currSceneId: 7, currSceneName: '大殿' },
	{ campaignId: 9, campaignName: '荒原', owner: 'teo', currPlaceId: 0, currPlaceName: '', currSceneId: 0, currSceneName: '' },
];

/** 带一份战役列表的 stub（成功） */
const stubCampaigns = (data: unknown) => stubXhr({ status: 'success', msg: '', data: data });

describe('列表加载', () => {

	test('加载后表格按列表填出行（含 owner）', async () => {
		await withDomAsync(PAGE, async () => {
			stubCampaigns(CAMPAIGNS);
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			assert.ok(sent[0].url.includes('/api/sandtable/list-scene'), `实际: ${sent[0].url}`);
			assert.equal(rows().length, 3);
			const cells = rows()[0].querySelectorAll('td');
			// 4 列：战役 / 地点 / 场景 / owner
			assert.equal(cells[0].textContent, '费伦大陆');
			assert.equal(cells[1].textContent, '深水城');
			assert.equal(cells[2].textContent, '港口');
			assert.equal(cells[3].textContent, 'teo');
		});
	});

	test('空列表时在说明行提示', async () => {
		await withDomAsync(PAGE, async () => {
			stubCampaigns([]);
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			assert.equal(document.querySelectorAll('#campaign-table tbody tr').length, 0);
			assert.ok(note().includes('还没有战役'), `实际: ${note()}`);
		});
	});

	test('加载失败时在说明行提示原因', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr({ status: 'error', msg: 'boom' });
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			assert.ok(note().includes('boom'), `实际: ${note()}`);
		});
	});

	test('加载完成后显示战役数量', async () => {
		await withDomAsync(PAGE, async () => {
			stubCampaigns(CAMPAIGNS);
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			assert.ok(note().includes('共 3 个战役'), `实际: ${note()}`);
		});
	});

});

describe('点行选中', () => {

	test('点整行后该行高亮，其他行不高亮', async () => {
		await withDomAsync(PAGE, async () => {
			stubCampaigns(CAMPAIGNS);
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			selectCampaign(1);
			const sel = rows().filter(r => r.classList.contains('highlighted'));
			assert.equal(sel.length, 1, '只高亮一行');
			assert.equal(Number(sel[0].dataset.campaignId), 1);
		});
	});

	test('再点另一行，前一行取消高亮（单选）', async () => {
		await withDomAsync(PAGE, async () => {
			stubCampaigns(CAMPAIGNS);
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			selectCampaign(1);
			selectCampaign(5);
			const sel = rows().filter(r => r.classList.contains('highlighted'));
			assert.equal(sel.length, 1);
			assert.equal(Number(sel[0].dataset.campaignId), 5);
		});
	});

});

describe('登录态', () => {

	test('没有 cookie 时提示请先登录', async () => {
		await withDomAsync(PAGE, async () => {
			stubCampaigns(CAMPAIGNS);
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			assert.ok(status().includes('请先登录'), `实际: ${status()}`);
		});
	});

	test('已有 cookie 时显示当前身份', async () => {
		await withDomAsync(PAGE, async () => {
			loginCookies();
			stubCampaigns(CAMPAIGNS);
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			assert.ok(status().includes('已登录'), `实际: ${status()}`);
			assert.ok(status().includes('teo'), `实际: ${status()}`);
		});
	});

});

describe('三级定位不全的记录', () => {

	test('选中 6 值不全的记录后进入按钮禁用', async () => {
		await withDomAsync(PAGE, async () => {
			loginCookies();
			stubCampaigns(CAMPAIGNS);
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			selectCampaign(9); // 荒原：curr place/scene 为空
			const enter = document.getElementById('btn-enter') as HTMLButtonElement;
			assert.ok(enter.disabled, '进入按钮应禁用');
		});
	});

	test('改选齐全的记录后按钮恢复可点', async () => {
		await withDomAsync(PAGE, async () => {
			loginCookies();
			stubCampaigns(CAMPAIGNS);
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			selectCampaign(9);
			const enter = document.getElementById('btn-enter') as HTMLButtonElement;
			assert.ok(enter.disabled, '先禁用');
			selectCampaign(1);
			assert.ok(!enter.disabled, '齐全记录进入按钮应可点');
		});
	});

	test('没选中时进入按钮禁用', async () => {
		await withDomAsync(PAGE, async () => {
			loginCookies();
			stubCampaigns(CAMPAIGNS);
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			const enter = document.getElementById('btn-enter') as HTMLButtonElement;
			assert.ok(enter.disabled, '没选中时进入按钮应禁用');
		});
	});

});

describe('进入战役', () => {

	test('没登录时不跳转，提示请先登录', async () => {
		await withDomAsync(PAGE, async () => {
			stubCampaigns(CAMPAIGNS);
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			selectCampaign(1);
			click('btn-enter');
			assert.ok(status().includes('请先登录'), `实际: ${status()}`);
		});
	});

	test('没选中时（按钮已禁用）直接派发点击仍不跳转、防御性提示先选中', async () => {
		await withDomAsync(PAGE, async () => {
			loginCookies();
			stubCampaigns(CAMPAIGNS);
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			// 按钮已禁用，真实用户点不到；这里用 dispatchEvent 绕过 disabled，
			// 验证 enter() 的「没选中」防御分支仍兜底
			click('btn-enter');
			assert.ok(status().includes('先选中'), `实际: ${status()}`);
		});
	});

	test('选中后拼出带三级定位（3 id + 3 名字）的玩家视图地址', async () => {
		await withDomAsync(PAGE, async () => {
			loginCookies();
			stubCampaigns(CAMPAIGNS);
			let jumped = '';
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98', navigate: u => { jumped = u; } });
			await settle();
			selectCampaign(1);
			click('btn-enter');
			assert.equal(jumped, './viewScene.html?campaignId=1&placeId=2&sceneId=3'
				+ '&campaignName=' + encodeURIComponent('费伦大陆')
				+ '&placeName=' + encodeURIComponent('深水城')
				+ '&sceneName=' + encodeURIComponent('港口'));
		});
	});

	test('场景名里的空格与 & 被 URL 编码', async () => {
		await withDomAsync(PAGE, async () => {
			loginCookies();
			stubCampaigns([{
				campaignId: 1, campaignName: '费伦 大陆', owner: 'teo',
				currPlaceId: 2, currPlaceName: 'A&B', currSceneId: 3, currSceneName: 's1',
			}]);
			let jumped = '';
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98', navigate: u => { jumped = u; } });
			await settle();
			selectCampaign(1);
			click('btn-enter');
			const expected = './viewScene.html?campaignId=1&placeId=2&sceneId=3'
				+ '&campaignName=' + encodeURIComponent('费伦 大陆')
				+ '&placeName=A%26B&sceneName=s1';
			assert.equal(jumped, expected);
		});
	});

	test('自定义玩家视图地址生效', async () => {
		await withDomAsync(PAGE, async () => {
			loginCookies();
			stubCampaigns(CAMPAIGNS);
			let jumped = '';
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98', viewUrl: '/custom/v.html', navigate: u => { jumped = u; } });
			await settle();
			selectCampaign(1);
			click('btn-enter');
			assert.equal(jumped, '/custom/v.html?campaignId=1&placeId=2&sceneId=3'
				+ '&campaignName=' + encodeURIComponent('费伦大陆')
				+ '&placeName=' + encodeURIComponent('深水城')
				+ '&sceneName=' + encodeURIComponent('港口'));
		});
	});

});

describe('换身份登录', () => {

	test('选中后带着场景参数跳 login.html', async () => {
		await withDomAsync(PAGE, async () => {
			stubCampaigns(CAMPAIGNS);
			let jumped = '';
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98', navigate: u => { jumped = u; } });
			await settle();
			selectCampaign(1);
			click('btn-switch-login');
			assert.equal(jumped, './login.html?campaignId=1&placeId=2&sceneId=3'
				+ '&campaignName=' + encodeURIComponent('费伦大陆')
				+ '&placeName=' + encodeURIComponent('深水城')
				+ '&sceneName=' + encodeURIComponent('港口'));
		});
	});

	test('没选中时只跳 login.html 不带查询串', async () => {
		await withDomAsync(PAGE, async () => {
			stubCampaigns(CAMPAIGNS);
			let jumped = '';
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98', navigate: u => { jumped = u; } });
			await settle();
			click('btn-switch-login');
			assert.equal(jumped, './login.html');
		});
	});

	test('自定义登录页地址生效', async () => {
		await withDomAsync(PAGE, async () => {
			stubCampaigns(CAMPAIGNS);
			let jumped = '';
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98', loginUrl: '/auth.html', navigate: u => { jumped = u; } });
			await settle();
			selectCampaign(5);
			click('btn-switch-login');
			assert.equal(jumped, '/auth.html?campaignId=5&placeId=6&sceneId=7'
				+ '&campaignName=' + encodeURIComponent('异域')
				+ '&placeName=' + encodeURIComponent('印记城')
				+ '&sceneName=' + encodeURIComponent('大殿'));
		});
	});

});

describe('URL 回填选中', () => {

	test('URL 带 campaignId 时在表格里选中对应行（登录回来恢复选择）', async () => {
		await withDomAsync(PAGE, async () => {
			stubCampaigns(CAMPAIGNS);
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			const sel = rows().filter(r => r.classList.contains('highlighted'));
			assert.equal(sel.length, 1, '应该只高亮一行');
			assert.equal(Number(sel[0].dataset.campaignId), 5);
		}, 'http://localhost/index.html?campaignId=5&placeId=6&sceneId=7');
	});

});

describe('选择器可覆盖', () => {

	test('桌面容器缺失时抛可读的错', () => {
		withDom('<div></div>', () => {
			assert.throws(() => initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' }), /桌面容器/);
		});
	});

});

describe('编辑战役按钮', () => {

	test('没选中时禁用', async () => {
		await withDomAsync(PAGE, async () => {
			loginCookies();
			stubCampaigns(CAMPAIGNS);
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			const btn = document.getElementById('btn-edit-campaign') as HTMLButtonElement;
			assert.ok(btn.disabled, '没选中时编辑战役按钮应禁用');
		});
	});

	test('选中他人战役时禁用', async () => {
		await withDomAsync(PAGE, async () => {
			loginCookies(); // 当前登录 teo
			stubCampaigns(CAMPAIGNS);
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			selectCampaign(5); // alice 的战役
			const btn = document.getElementById('btn-edit-campaign') as HTMLButtonElement;
			assert.ok(btn.disabled, '他人战役应禁用编辑战役');
		});
	});

	test('选中自己战役时可用', async () => {
		await withDomAsync(PAGE, async () => {
			loginCookies();
			stubCampaigns(CAMPAIGNS);
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			selectCampaign(1); // teo 的战役
			const btn = document.getElementById('btn-edit-campaign') as HTMLButtonElement;
			assert.ok(!btn.disabled, '自己战役应可点');
		});
	});

	test('选中 campaignId 为 0 的记录时禁用', async () => {
		await withDomAsync(PAGE, async () => {
			loginCookies();
			stubCampaigns([{
				campaignId: 0, campaignName: '空', owner: 'teo',
				currPlaceId: 0, currPlaceName: '', currSceneId: 0, currSceneName: '',
			}]);
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			selectCampaign(0);
			const btn = document.getElementById('btn-edit-campaign') as HTMLButtonElement;
			assert.ok(btn.disabled, 'campaignId 为空应禁用');
		});
	});

	test('选中自己战役（即使 6 值不全）也可点', async () => {
		await withDomAsync(PAGE, async () => {
			loginCookies();
			stubCampaigns(CAMPAIGNS);
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			selectCampaign(9); // 荒原：owner teo，6 值不全
			const btn = document.getElementById('btn-edit-campaign') as HTMLButtonElement;
			assert.ok(!btn.disabled, '编辑战役不要求 6 值齐全');
		});
	});

	test('点击后拼出编辑战役地址（只带 campaignId + campaignName）', async () => {
		await withDomAsync(PAGE, async () => {
			loginCookies();
			stubCampaigns(CAMPAIGNS);
			let jumped = '';
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98', navigate: u => { jumped = u; } });
			await settle();
			selectCampaign(1);
			click('btn-edit-campaign');
			assert.equal(jumped, './editCampaign.html?campaignId=1&campaignName='
				+ encodeURIComponent('费伦大陆'));
		});
	});

	test('没选中时（按钮已禁用）直接派发点击仍提示先选中', async () => {
		await withDomAsync(PAGE, async () => {
			loginCookies();
			stubCampaigns(CAMPAIGNS);
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			// 按钮已禁用，真实用户点不到；这里用 dispatchEvent 绕过 disabled，
			// 验证 editCampaign() 的「没选中」防御分支仍兜底
			click('btn-edit-campaign');
			assert.ok(status().includes('先选中'), `实际: ${status()}`);
		});
	});

	test('没登录时点击提示请先登录', async () => {
		await withDomAsync(PAGE, async () => {
			stubCampaigns(CAMPAIGNS);
			initSandboxIndex({ apiRoot: '//api', iconBaseUrl: '//cdn/SE98' });
			await settle();
			selectCampaign(1);
			click('btn-edit-campaign');
			assert.ok(status().includes('请先登录'), `实际: ${status()}`);
		});
	});

});
