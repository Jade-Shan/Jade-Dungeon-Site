/**
 * 编辑战役页：加载地点/场景两张表、点行选中回填表单、新建/提交、删除
 *
 * 页面是一个窗口，内含「地点编辑」「场景编辑」两个左右并排的 fieldset，
 * 各自「上表格 + 下属性编辑」。后端写操作走 token 鉴权（非 owner 会回 not owner），
 * 页面进入时先查一次 owner 并在窗口顶部提示。列表接口（list-place /
 * list-campaign-scene）只读、不校验身份。
 *
 * 要盯住的：
 *
 * - 页面加载后各发一次 list-place / list-campaign-scene，两张表填出行
 * - 点行选中 → 右栏字段回填（`data-field` 定位输入控件）
 * - 「新建」清空表单进入新建态；「提交」按是否带 id 决定新建还是更新
 *   （新建的 POST body 不带 id，更新带 id）
 * - 行内 `✕` 点下去发 delete-place / delete-scene；删除「还有场景的地点」
 *   后端回 err，提示要原样显示后端的 msg
 * - 场景的 placeId 要正整数，非法就提示、不发请求
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { withDomAsync } from './_jsdom-setup.js';
import { initSandboxEditCampaign } from '../../main/ts/sandbox/sandboxEditCampaign.js';

/** 编辑战役页的 DOM，和 html/sandbox/editCampaign.html 一致：一个桌面容器 */
const PAGE = `<div id="sandbox-desktop" class="desktop dock-content"></div>`;

/** 记下假 XHR 收到的请求 */
let sent: Array<{ url: string, method: string, body?: string }> = [];
/** 按 URL 分派响应的路由，各用例可覆盖 */
let router: (url: string, method: string) => unknown = () => ({ status: 'error', msg: 'no router' });

/** 用假 XHR 顶替真实请求，按 router 分派响应 */
function stubXhr(): void {
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
			this.responseText = JSON.stringify(router(this.url, this.method));
			this.onload?.({});
		}
	}
	(globalThis as unknown as Record<string, unknown>).XMLHttpRequest = FakeXhr;
}

/** 地点 fixture */
const PLACES = [
	{ id: 1, campaignId: 9, placeName: '深水城', detailInfo: '港口城市' },
	{ id: 2, campaignId: 9, placeName: '印记城', detailInfo: '万门之城' },
];

/** 场景 fixture */
const CAMPAIGN_SCENES = [
	{ id: 3, campaignId: 9, placeId: 1, sceneName: '港口', detailInfo: '码头' },
];

/** 默认路由：owner 是 teo，两张表返回上面的 fixture，写操作全成功 */
function defaultRouter(url: string, _method: string): unknown {
	if (url.includes('/map-owner')) { return { status: 'success', msg: '', owner: 'teo' }; }
	if (url.includes('/list-place')) { return { status: 'success', msg: '', data: PLACES }; }
	if (url.includes('/list-campaign-scene')) { return { status: 'success', msg: '', data: CAMPAIGN_SCENES }; }
	if (url.includes('/save-place') || url.includes('/delete-place')
		|| url.includes('/save-scene') || url.includes('/delete-scene')) {
		return { status: 'success', msg: '' };
	}
	return { status: 'error', msg: 'unknown url: ' + url };
}

/** 页面配置 */
const CFG = {
	apiRoot: '//api',
	desktopId: 'sandbox-desktop',
	iconBaseUrl: '//cdn/SE98',
	campaignId: 9,
	campaignName: '荒原',
	username: 'teo',
	loginToken: 'tok',
};

/** 默认启动：stub + 默认路由 + 启动页面 */
async function boot(): Promise<void> {
	stubXhr();
	router = defaultRouter;
	await initSandboxEditCampaign(CFG);
}

/** 等异步落定 */
async function settle(): Promise<void> {
	await new Promise(r => setTimeout(r, 10));
}

/** 指定窗口的表格行 */
function rows(windowId: string): Array<HTMLTableRowElement> {
	return Array.from(document.querySelectorAll<HTMLTableRowElement>(`#${windowId}-rows tr`));
}

/** 读指定窗口某个字段的当前值 */
function fieldValue(windowId: string, field: string): string {
	const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
		`#${windowId}-form [data-field="${field}"]`);
	return el ? el.value : '';
}

/** 给指定窗口某个字段填值 */
function setField(windowId: string, field: string, value: string): void {
	const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
		`#${windowId}-form [data-field="${field}"]`);
	assert.ok(el, `找不到字段 ${field}`);
	el!.value = value;
}

/** 点一个按钮 */
function click(id: string): void {
	document.getElementById(id)!.dispatchEvent(new MouseEvent('click'));
}

/** 读指定窗口的状态行 */
function note(windowId: string): string {
	return document.getElementById(`${windowId}-note`)!.textContent ?? '';
}

describe('加载列表', () => {

	test('两个 fieldset 标题分别是「地点编辑」「场景编辑」，地点在左', async () => {
		await withDomAsync(PAGE, async () => {
			await boot();
			await settle();
			const legends = Array.from(document.querySelectorAll('fieldset legend'))
				.map(l => l.textContent ?? '');
			assert.deepEqual(legends, ['地点编辑', '场景编辑']);
		});
	});

	test('加载后各发一次 list-place / list-campaign-scene，两张表填出行', async () => {
		await withDomAsync(PAGE, async () => {
			await boot();
			await settle();
			// 记录行之后各追加一行放「新建」按钮，所以行数 = 记录数 + 1
			assert.equal(rows('edit-campaign-place').length, 3);
			assert.equal(rows('edit-campaign-scene').length, 2);
			assert.ok(sent.some(s => s.url.includes('/list-place')), '应请求 list-place');
			assert.ok(sent.some(s => s.url.includes('/list-campaign-scene')), '应请求 list-campaign-scene');
		});
	});

	test('地点表第一行显示地点ID与地点名', async () => {
		await withDomAsync(PAGE, async () => {
			await boot();
			await settle();
			const cells = rows('edit-campaign-place')[0].querySelectorAll('td');
			assert.equal(cells[0].textContent, '1');
			assert.equal(cells[1].textContent, '深水城');
		});
	});

	test('场景表显示场景ID、场景名与所属地点 ID', async () => {
		await withDomAsync(PAGE, async () => {
			await boot();
			await settle();
			const cells = rows('edit-campaign-scene')[0].querySelectorAll('td');
			assert.equal(cells[0].textContent, '3');
			assert.equal(cells[1].textContent, '港口');
			assert.equal(cells[2].textContent, '1');
		});
	});

	test('新建按钮放在表格末尾新建行的最后一列', async () => {
		await withDomAsync(PAGE, async () => {
			await boot();
			await settle();
			for (const windowId of ['edit-campaign-place', 'edit-campaign-scene']) {
				const btn = document.getElementById(`${windowId}-new`);
				assert.ok(btn, `找不到 ${windowId} 的新建按钮`);
				const td = btn!.parentElement;
				const tr = td!.parentElement;
				const tbody = document.getElementById(`${windowId}-rows`);
				assert.equal(tr, tbody!.lastElementChild, `${windowId} 新建按钮应在最后一行`);
				assert.equal(td, tr!.lastElementChild, `${windowId} 新建按钮应在最后一列`);
			}
		});
	});

});

describe('owner 提示', () => {

	test('owner 是自己时窗口顶部提示拥有者', async () => {
		await withDomAsync(PAGE, async () => {
			await boot();
			await settle();
			const hint = document.getElementById('edit-campaign-hint')!.textContent ?? '';
			assert.ok(hint.includes('拥有者'), `实际: ${hint}`);
			assert.ok(hint.includes('teo'), `实际: ${hint}`);
		});
	});

});

describe('点行选中', () => {

	test('点地点行后右栏字段回填', async () => {
		await withDomAsync(PAGE, async () => {
			await boot();
			await settle();
			rows('edit-campaign-place')[0].dispatchEvent(new MouseEvent('click'));
			assert.equal(fieldValue('edit-campaign-place', 'placeName'), '深水城');
			assert.equal(fieldValue('edit-campaign-place', 'detailInfo'), '港口城市');
		});
	});

	test('点场景行后右栏字段回填（含地点 ID）', async () => {
		await withDomAsync(PAGE, async () => {
			await boot();
			await settle();
			rows('edit-campaign-scene')[0].dispatchEvent(new MouseEvent('click'));
			assert.equal(fieldValue('edit-campaign-scene', 'sceneName'), '港口');
			assert.equal(fieldValue('edit-campaign-scene', 'placeId'), '1');
			assert.equal(fieldValue('edit-campaign-scene', 'detailInfo'), '码头');
		});
	});

});

describe('新建与提交', () => {

	test('新建地点提交发出 save-place（POST，body 不带 id）', async () => {
		await withDomAsync(PAGE, async () => {
			await boot();
			await settle();
			click('edit-campaign-place-new');
			setField('edit-campaign-place', 'placeName', '新镇');
			setField('edit-campaign-place', 'detailInfo', '偏远小镇');
			click('edit-campaign-place-submit');
			await settle();
			const req = sent.find(s => s.url.includes('/save-place'));
			assert.ok(req, '应发出 save-place');
			assert.equal(req!.method, 'POST');
			assert.ok(req!.body!.includes(`placeName=${encodeURIComponent('新镇')}`), `body: ${req!.body}`);
			assert.ok(!req!.body!.includes('id='), '新建不带 id');
		});
	});

	test('选中已有地点提交发出 save-place（body 带 id）', async () => {
		await withDomAsync(PAGE, async () => {
			await boot();
			await settle();
			rows('edit-campaign-place')[0].dispatchEvent(new MouseEvent('click'));
			setField('edit-campaign-place', 'placeName', '深水城改');
			click('edit-campaign-place-submit');
			await settle();
			const req = sent.find(s => s.url.includes('/save-place'));
			assert.ok(req);
			assert.ok(req!.body!.includes('id=1'), `body: ${req!.body}`);
			assert.ok(req!.body!.includes(encodeURIComponent('深水城改')), `body: ${req!.body}`);
		});
	});

	test('地点名为空提交时提示、不发请求', async () => {
		await withDomAsync(PAGE, async () => {
			await boot();
			await settle();
			click('edit-campaign-place-new');
			click('edit-campaign-place-submit');
			await settle();
			assert.ok(!sent.some(s => s.url.includes('/save-place')), '不该发 save-place');
			assert.ok(note('edit-campaign-place').includes('地点名不能为空'), `实际: ${note('edit-campaign-place')}`);
		});
	});

	test('场景提交发出 save-scene（含 placeId）', async () => {
		await withDomAsync(PAGE, async () => {
			await boot();
			await settle();
			rows('edit-campaign-scene')[0].dispatchEvent(new MouseEvent('click'));
			setField('edit-campaign-scene', 'sceneName', '港口改');
			click('edit-campaign-scene-submit');
			await settle();
			const req = sent.find(s => s.url.includes('/save-scene'));
			assert.ok(req);
			assert.ok(req!.body!.includes('id=3'), `body: ${req!.body}`);
			assert.ok(req!.body!.includes('placeId=1'), `body: ${req!.body}`);
		});
	});

	test('场景 placeId 非法时提示、不发请求', async () => {
		await withDomAsync(PAGE, async () => {
			await boot();
			await settle();
			click('edit-campaign-scene-new');
			setField('edit-campaign-scene', 'sceneName', '新场景');
			setField('edit-campaign-scene', 'placeId', '0');
			click('edit-campaign-scene-submit');
			await settle();
			assert.ok(!sent.some(s => s.url.includes('/save-scene')), '不该发 save-scene');
			assert.ok(note('edit-campaign-scene').includes('正整数'), `实际: ${note('edit-campaign-scene')}`);
		});
	});

	test('点场景新建时，把地点表选中记录 id 带到「地点 ID」', async () => {
		await withDomAsync(PAGE, async () => {
			await boot();
			await settle();
			rows('edit-campaign-place')[0].dispatchEvent(new MouseEvent('click'));
			click('edit-campaign-scene-new');
			assert.equal(fieldValue('edit-campaign-scene', 'placeId'), '1');
		});
	});

	test('地点表没选中时点场景新建，「地点 ID」为空', async () => {
		await withDomAsync(PAGE, async () => {
			await boot();
			await settle();
			click('edit-campaign-scene-new');
			assert.equal(fieldValue('edit-campaign-scene', 'placeId'), '');
		});
	});

});

describe('删除', () => {

	test('点地点行内 ✕ 发出 delete-place', async () => {
		await withDomAsync(PAGE, async () => {
			await boot();
			await settle();
			window.confirm = () => true;
			const del = rows('edit-campaign-place')[0].querySelector('button');
			assert.ok(del, '找不到删除按钮');
			del!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await settle();
			const req = sent.find(s => s.url.includes('/delete-place'));
			assert.ok(req);
			assert.ok(req!.body!.includes('id=1'), `body: ${req!.body}`);
		});
	});

	test('点场景行内 ✕ 发出 delete-scene', async () => {
		await withDomAsync(PAGE, async () => {
			await boot();
			await settle();
			window.confirm = () => true;
			const del = rows('edit-campaign-scene')[0].querySelector('button');
			assert.ok(del);
			del!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await settle();
			const req = sent.find(s => s.url.includes('/delete-scene'));
			assert.ok(req);
			assert.ok(req!.body!.includes('id=3'), `body: ${req!.body}`);
		});
	});

	test('删除「还有场景的地点」时原样提示后端 msg', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr();
			router = (url, method) => {
				if (url.includes('/delete-place')) {
					return { status: 'err', msg: '该地点下还有场景，请先删除场景' };
				}
				return defaultRouter(url, method);
			};
			await initSandboxEditCampaign(CFG);
			await settle();
			window.confirm = () => true;
			const del = rows('edit-campaign-place')[0].querySelector('button');
			del!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await settle();
			assert.ok(note('edit-campaign-place').includes('该地点下还有场景'), `实际: ${note('edit-campaign-place')}`);
		});
	});

});

	test('点删除但取消确认时，不发删除请求', async () => {
		await withDomAsync(PAGE, async () => {
			await boot();
			await settle();
			window.confirm = () => false;
			const del = rows('edit-campaign-place')[0].querySelector('button');
			assert.ok(del, '找不到删除按钮');
			del!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await settle();
			assert.ok(!sent.some(s => s.url.includes('/delete-place')),
				'取消确认后不该发 delete-place');
		});
	});

describe('编辑场景按钮', () => {

	test('选中场景后点「编辑场景」跳编辑器地址（3 id + 3 名）', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr();
			router = defaultRouter;
			let jumped = '';
			await initSandboxEditCampaign({ ...CFG, navigate: u => { jumped = u; } });
			await settle();
			rows('edit-campaign-scene')[0].dispatchEvent(new MouseEvent('click'));
			click('edit-campaign-scene-edit');
			assert.equal(jumped, './editScene.html?campaignId=9&placeId=1&sceneId=3'
				+ '&campaignName=' + encodeURIComponent('荒原')
				+ '&placeName=' + encodeURIComponent('深水城')
				+ '&sceneName=' + encodeURIComponent('港口'));
		});
	});

	test('未选中场景时点「编辑场景」提示先选中', async () => {
		await withDomAsync(PAGE, async () => {
			await boot();
			await settle();
			click('edit-campaign-scene-edit');
			assert.ok(note('edit-campaign-scene').includes('先选中'), `实际: ${note('edit-campaign-scene')}`);
		});
	});

	test('没登录时点「编辑场景」提示请先登录', async () => {
		await withDomAsync(PAGE, async () => {
			stubXhr();
			router = defaultRouter;
			await initSandboxEditCampaign({ ...CFG, username: '', loginToken: '' });
			await settle();
			rows('edit-campaign-scene')[0].dispatchEvent(new MouseEvent('click'));
			click('edit-campaign-scene-edit');
			assert.ok(note('edit-campaign-scene').includes('请先登录'), `实际: ${note('edit-campaign-scene')}`);
		});
	});

});
