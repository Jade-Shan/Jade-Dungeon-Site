/**
 * 沙盘接口封装：URL 拼装、响应解析，以及两个纯函数
 *
 * sandbox 模块迁移的期 2 产物（见 docs/sandbox-refactor.md）。要盯住的：
 *
 * - **`normalizeImageUrl`**：绝对 URL 原样放过（它们要走 parseImage 代理），
 *   老相对路径接到 assetRoot 上（4.2 节）
 * - **`renderRollResults`**：老代码 view 那份把 `length` 拼成 `lenght`，
 *   导致玩家侧结果永远是空的。第一条用例就是它的回归（4.3 节）
 * - **URL 拼装**：10 个接口的参数名与后端对得上，撤销移动传的是负坐标
 * - **`status` 的两种失败拼写**：后端 `'err'` 和 `'error'` 都用，只能判 success
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
	SandboxApi, normalizeImageUrl, renderRollResults, RollResultRow,
} from '../../main/ts/sandbox/sandboxApi.js';

/** 假 XHR 记下的请求 */
interface Sent { url: string; method: string; body?: string; headers: Record<string, string> }

let sent: Array<Sent> = [];

/**
 * 用假 XHR 顶替真实请求
 *
 * @param resp - 要让后端「返回」的响应体
 * @param fail - true 时走 onerror，模拟网络断开
 */
function stubXhr(resp: unknown, fail = false): void {
	sent = [];
	class FakeXhr {
		status = 200;
		statusText = 'OK';
		responseText = '';
		timeout = 0;
		withCredentials = false;
		onload: ((e: unknown) => void) | null = null;
		onerror: ((e: unknown) => void) | null = null;
		private rec: Sent = { url: '', method: '', headers: {} };
		open(method: string, url: string): void {
			this.rec.method = method; this.rec.url = url;
		}
		setRequestHeader(k: string, v: string): void { this.rec.headers[k] = v; }
		send(body?: string): void {
			this.rec.body = body;
			sent.push(this.rec);
			if (fail) { this.onerror?.({}); return; }
			this.responseText = JSON.stringify(resp);
			this.onload?.({});
		}
	}
	(globalThis as unknown as Record<string, unknown>).XMLHttpRequest = FakeXhr;
}

const ID = { campaignId: 'c1', placeId: 'p1', sceneId: 's1' };
const api = () => new SandboxApi('//localhost:8089');

/** 从记录的 URL 里取查询参数 */
function params(url: string): Record<string, string> {
	const out: Record<string, string> = {};
	const q = url.split('?')[1] ?? '';
	for (const kv of q.split('&')) {
		const [k, v] = kv.split('=');
		out[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
	}
	return out;
}

describe('normalizeImageUrl', () => {

	const ROOT = '//cdn.x/themes/trpg/images';

	test('绝对 URL 原样放过（要走 parseImage 代理）', () => {
		const u = 'http://img.host/a/orc.png';
		assert.equal(normalizeImageUrl(u, ROOT), u);
		assert.equal(normalizeImageUrl('https://img.host/a/orc.png', ROOT),
			'https://img.host/a/orc.png');
	});

	test('协议相对地址原样放过', () => {
		assert.equal(normalizeImageUrl('//img.host/orc.png', ROOT),
			'//img.host/orc.png');
	});

	test('data: / blob: 原样放过', () => {
		assert.equal(normalizeImageUrl('data:image/png;base64,AAA', ROOT),
			'data:image/png;base64,AAA');
		assert.equal(normalizeImageUrl('blob:abc', ROOT), 'blob:abc');
	});

	test('老相对路径接到 assetRoot 上', () => {
		// 老页面在 webroot/ 根上，存的是这个形态
		assert.equal(normalizeImageUrl('./images/sandtable/map.jpg', ROOT),
			`${ROOT}/map.jpg`);
	});

	test('其他相对写法也按文件名接', () => {
		assert.equal(normalizeImageUrl('map.jpg', ROOT), `${ROOT}/map.jpg`);
		assert.equal(normalizeImageUrl('a/b/map.jpg', ROOT), `${ROOT}/map.jpg`);
	});

	test('空串原样返回，不抛错', () => {
		assert.equal(normalizeImageUrl('', ROOT), '');
	});

});

describe('renderRollResults', () => {

	const rows: Array<RollResultRow> = [
		{ userId: 'teo', threshold: 10, sum: 14, msg: '14=4+10(2d6+4)' },
		{ userId: 'leo', threshold: 12, sum: 7, msg: '7=3+4(1d6+4)' },
		{ userId: 'u3', threshold: 15, sum: 0, msg: '' },
	];

	test('每一条都出现在输出里', () => {
		// ⚠️ 这条就是老代码 `rollResult.lenght` 那个 bug 的回归：
		// 老实现循环零次、输出空串，但不报错。
		// 所以必须断言「内容出现了」，光断言不抛错测不出来
		const text = renderRollResults(rows, true);
		for (const r of rows) {
			assert.ok(text.includes(r.userId), `${r.userId} 应出现`);
		}
		assert.equal(text.split('\n').filter(l => l.startsWith('* ')).length, 3);
	});

	test('sum 大于阈值显示成功', () => {
		const text = renderRollResults([rows[0]], true);
		assert.ok(text.includes('成功'), '14 >= 10 应成功');
		assert.ok(!text.includes('失败'));
	});

	test('sum 小于阈值显示失败', () => {
		const text = renderRollResults([rows[1]], true);
		assert.ok(text.includes('失败'), '7 < 12 应失败');
	});

	test('sum 为 0 显示等待中', () => {
		const text = renderRollResults([rows[2]], true);
		assert.ok(text.includes('等待中'));
		assert.ok(!text.includes('成功') && !text.includes('失败'));
	});

	test('showThreshold 为 false 时不显示阈值（玩家侧）', () => {
		const text = renderRollResults(rows, false);
		assert.ok(!text.includes('阈值'), '玩家不该看到 GM 设的阈值');
		assert.ok(text.includes('teo'), '但结果本身要显示');
	});

	test('showThreshold 为 true 时显示阈值（GM 侧）', () => {
		assert.ok(renderRollResults(rows, true).includes('阈值：10'));
	});

	test('空列表返回空串，不抛错', () => {
		assert.equal(renderRollResults([], true), '');
	});

});

describe('URL 拼装与后端参数名对账', () => {

	test('三级定位参数名是 campaignId / placeId / sceneId', () => {
		stubXhr({ status: 'success' });
		return api().loadMap(ID).then(() => {
			const p = params(sent[0].url);
			assert.equal(p.campaignId, 'c1');
			assert.equal(p.placeId, 'p1');
			assert.equal(p.sceneId, 's1');
		});
	});

	test('每个请求都带防缓存的 t', async () => {
		stubXhr({ status: 'success' });
		await api().loadMap(ID);
		assert.ok(/[?&]t=\d+/.test(sent[0].url), `URL 应带时间戳: ${sent[0].url}`);
	});

	test('10 个接口的路径都对', async () => {
		const cases: Array<[string, () => Promise<unknown>]> = [
			['load-map', () => api().loadMap(ID)],
			['save-map', () => api().saveMap(ID, '{}')],
			['map-owner', () => api().mapOwner('c1')],
			['load-move-request', () => api().loadMoveRequests(ID)],
			['request-move', () => api().requestMove(ID, 'teo', 1, 2)],
			['roll-dice', () => api().rollDice(ID, 'teo', '2d6')],
			['set-roll-threshold', () => api().setRollThreshold(ID, 'teo', 10)],
			['get-roll-result', () => api().getRollResults(ID)],
			['auth/login', () => api().login('teo', 'pw')],
			['auth/regist', () => api().regist('teo', 'pw')],
		];
		for (const [path, fn] of cases) {
			stubXhr({ status: 'success' });
			await fn();
			assert.ok(sent[0].url.includes(path), `${path}: 实际 ${sent[0].url}`);
		}
	});

	test('参数做了 URL 编码', async () => {
		stubXhr({ status: 'success' });
		await api().rollDice({ ...ID, campaignId: '深水城 & 地下城' }, 'teo', '2d6+1');
		assert.ok(!sent[0].url.includes(' '), '空格应被编码');
		const p = params(sent[0].url);
		assert.equal(p.campaignId, '深水城 & 地下城', '解码后应还原');
		assert.equal(p.rollCmd, '2d6+1', '加号也要能还原');
	});

	test('saveMap 发 POST、带正确的 Content-Type、jsonStr 在请求体里', async () => {
		stubXhr({ status: 'success' });
		const json = '{"username":"teo","loginToken":"t|u|1"}';
		await api().saveMap(ID, json);
		assert.equal(sent[0].method, 'POST');
		// ⚠️ 不设这个头后端两个中间件都不解析，jsonStr 会是 undefined
		assert.equal(sent[0].headers['Content-Type'],
			'application/x-www-form-urlencoded');
		assert.ok(sent[0].body?.startsWith('jsonStr='));
		assert.equal(params(`?${sent[0].body}`).jsonStr, json, '解码后应还原');
	});

	test('读接口发 GET，不带 Content-Type', async () => {
		stubXhr({ status: 'success' });
		await api().loadMap(ID);
		assert.equal(sent[0].method, 'GET');
		assert.ok(!('Content-Type' in sent[0].headers));
	});

	test('cancelMove 传负坐标（后端据此删请求）', async () => {
		stubXhr({ status: 'success' });
		await api().cancelMove(ID, 'teo', 'tk');
		const p = params(sent[0].url);
		assert.equal(p.x, '-1');
		assert.equal(p.y, '-1');
	});

	test('token 传了就带上，没传就不出现在 URL 里', async () => {
		stubXhr({ status: 'success' });
		await api().requestMove(ID, 'teo', 1, 2, 'tk-123');
		assert.equal(params(sent[0].url).token, 'tk-123');

		stubXhr({ status: 'success' });
		await api().requestMove(ID, 'teo', 1, 2);
		assert.ok(!('token' in params(sent[0].url)), '没传时不该有空的 token 参数');
	});

	test('getRollResults 不传 username（查的是全场）', async () => {
		stubXhr({ status: 'success' });
		await api().getRollResults(ID);
		assert.ok(!('username' in params(sent[0].url)),
			'老代码两处都传了 username，是多余的');
	});

});

describe('响应解析', () => {

	test('status 为 success 时 ok 为 true', async () => {
		stubXhr({ status: 'success', data: [] });
		assert.equal((await api().getRollResults(ID)).ok, true);
	});

	test("失败的两种拼写都认：'err' 与 'error'", async () => {
		// 后端 map.ts 的读接口回 'error'、save-map 回 'err'、dice.ts 回 'error'
		for (const status of ['err', 'error']) {
			stubXhr({ status: status, msg: 'boom' });
			const r = await api().loadMap(ID);
			assert.equal(r.ok, false, `status=${status} 应判为失败`);
			assert.equal(r.msg, 'boom');
		}
	});

	test('后端没给 msg 时退回 status 本身', async () => {
		stubXhr({ status: 'empty' });
		assert.equal((await api().loadMap(ID)).msg, 'empty');
	});

	test('网络异常返回 ok:false，不抛异常', async () => {
		stubXhr(null, true);
		const r = await api().loadMap(ID);
		assert.equal(r.ok, false);
		assert.equal(r.msg, '网络异常');
	});

	test('响应体为空时返回 ok:false', async () => {
		stubXhr(null);
		assert.equal((await api().loadMap(ID)).ok, false);
	});

	test('loadMoveRequests 解析出 userId 与 pos', async () => {
		stubXhr({ status: 'success', data: [{ userId: 'teo', pos: { x: 10, y: 20 } }] });
		const r = await api().loadMoveRequests(ID);
		assert.equal(r.data![0].userId, 'teo');
		assert.deepEqual(r.data![0].pos, { x: 10, y: 20 });
	});

	test('data 缺失时列表接口给空数组，不是 undefined', async () => {
		stubXhr({ status: 'success' });
		assert.deepEqual((await api().loadMoveRequests(ID)).data, []);
		stubXhr({ status: 'success' });
		assert.deepEqual((await api().getRollResults(ID)).data, []);
	});

	test('login 取出 username 与 token', async () => {
		stubXhr({ status: 'success', username: 'teo', token: 'teo|uuid|123' });
		const r = await api().login('teo', 'pw');
		assert.deepEqual(r.data, { username: 'teo', token: 'teo|uuid|123' });
	});

	test('mapOwner 取出 owner；无主战役给空串', async () => {
		stubXhr({ status: 'success', owner: 'teo' });
		assert.equal((await api().mapOwner('c1')).data, 'teo');
		stubXhr({ status: 'success' });
		assert.equal((await api().mapOwner('c1')).data, '');
	});

});

describe('imageProxyUrl', () => {

	test('拼出 parseImage 的前缀', () => {
		assert.equal(api().imageProxyUrl,
			'//localhost:8089/api/sandtable/parseImage?src=');
	});

	test('apiRoot 带尾斜杠时不会拼出双斜杠', () => {
		assert.equal(new SandboxApi('//localhost:8089/').imageProxyUrl,
			'//localhost:8089/api/sandtable/parseImage?src=');
	});

	test('apiRoot 为空时退化成同源相对路径', () => {
		assert.equal(new SandboxApi('').imageProxyUrl,
			'/api/sandtable/parseImage?src=');
	});

});
