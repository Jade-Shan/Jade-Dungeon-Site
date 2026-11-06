/**
 * 场景状态容器：装载、命中测试、序列化
 *
 * sandbox 模块迁移的期 3 产物里**唯一能自动验证**的部分 ——
 * 窗口与 Canvas 渲染要真实布局和 `getContext('2d')`，jsdom 都没有
 * （实测返回 null），只能靠浏览器手动验证。
 *
 * 这里盯四件事：
 *
 * - **装载时图片 URL 过归一化**（4.2 节）
 * - **`hitTest` 反向遍历**：点重叠处要选中上层的，老代码正向遍历选中下层
 * - **`requireMapImage` 给可读的错**（4.5 节的决定）
 * - **`toJsonStr` 只写 `visible`**，所以保存一次就自动转正（4.1 节）
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installDomForFile } from './_jsdom-setup.js';
import { SandboxScene } from '../../main/ts/sandbox/sandboxScene.js';
import { CircleToken, LineToken, SceneDataResp } from '../../main/ts/trpg/sandtable.js';

const ROOT = '//cdn.x/themes/trpg/images';

// `loadFrom` 现在是 async 的，内部会 `new Image()` 把图片资源加载好
// （详见 sandboxScene.ts 的注释：顺序反了棋子图片就不显示），所以整个文件要 DOM。
// jsdom 里图片一定加载失败、换成占位图 —— 这里的用例不关心图片内容，
// 只关心装载流程，所以不影响断言。
const dom = installDomForFile('<div></div>', { stubImages: true });
before(dom.setup);
after(dom.teardown);

/** 一份最小但完整的场景响应，故意用老拼写 `visiable` 和老相对路径 */
const legacyResp = (): SceneDataResp => ({
	username: 'teo',
	loginToken: 'teo|uuid|123',
	imgResources: [
		{ id: 'map', type: 'Image', url: './images/sandtable/map.jpg' },
		{ id: 'icons', type: 'Image', url: 'http://img.host/icons.jpg' },
	],
	mapDatas: {
		teams: [{
			type: 'Circle', id: 'teo', x: 100, y: 100, radius: 25,
			visiable: true, blockView: true, color: '#0000FF',
			img: { imgKey: 'icons', sx: 0, sy: 0, width: 50, height: 50 },
		}],
		creaters: [{
			type: 'Circle', id: 'orc1', x: 300, y: 300, radius: 25,
			visiable: true, blockView: true, color: '#FF0000',
			img: { imgKey: 'icons', sx: 0, sy: 0, width: 50, height: 50 },
		}],
		furnishings: [],
		doors: [],
		walls: [{
			type: 'Line', id: 'w1', x: 0, y: 100, x2: 200, y2: 100,
			visiable: false, blockView: true, color: '#00FF00',
		}],
	},
} as unknown as SceneDataResp);

describe('loadFrom 装载场景', () => {

	test('五个分组都装进去了', async () => {
		const s = new SandboxScene();
		await s.loadFrom(legacyResp(), ROOT);
		assert.equal(s.list('teams').length, 1);
		assert.equal(s.list('creaters').length, 1);
		assert.equal(s.list('walls').length, 1);
		assert.equal(s.list('doors').length, 0);
		assert.equal(s.list('furnishings').length, 0);
	});

	test('老拼写 visiable 被认出来', async () => {
		const s = new SandboxScene();
		await s.loadFrom(legacyResp(), ROOT);
		assert.equal(s.get('teams', 'teo')!.visible, true, '老数据的 true 要读到');
		assert.equal(s.get('walls', 'w1')!.visible, false, '墙是隐形的');
	});

	test('老相对路径的图片被归一化，绝对 URL 原样保留', async () => {
		const s = new SandboxScene();
		await s.loadFrom(legacyResp(), ROOT);
		assert.equal(s.images.get('map')!.url, `${ROOT}/map.jpg`, '相对路径要接 assetRoot');
		assert.equal(s.images.get('icons')!.url, 'http://img.host/icons.jpg',
			'绝对 URL 要原样（它走 parseImage 代理）');
	});

	test('重复装载会清掉上一次的内容', async () => {
		const s = new SandboxScene();
		await s.loadFrom(legacyResp(), ROOT);
		await s.loadFrom(legacyResp(), ROOT);
		assert.equal(s.list('teams').length, 1, '不该累积成 2 个');
		assert.equal(s.imageList().length, 2);
	});

	test('mapDatas 缺失时不抛错', async () => {
		const s = new SandboxScene();
		await s.loadFrom({ username: 'x', loginToken: '', imgResources: [] } as unknown as SceneDataResp, ROOT);
		assert.equal(s.allTokens().length, 0);
	});

	test('username 带进来了', async () => {
		const s = new SandboxScene();
		await s.loadFrom(legacyResp(), ROOT);
		assert.equal(s.username, 'teo');
	});

});

describe('allTokens 的渲染层次', () => {

	test('顺序是 墙 → 门 → 陈设 → 生物 → 玩家', async () => {
		const s = new SandboxScene();
		await s.loadFrom(legacyResp(), ROOT);
		assert.deepEqual(s.allTokens().map(t => t.id), ['w1', 'orc1', 'teo'],
			'玩家要在最上层');
	});

});

describe('hitTest 命中测试', () => {

	/** 墙和棋子重叠在 (100,100) 的场景 */
	function overlapped(): SandboxScene {
		const s = new SandboxScene();
		s.replace('walls', new LineToken('w1', 0, 100, 200, 100, 6, '', '#0F0', false, true));
		s.replace('teams', new CircleToken('teo', 100, 100, 25, 0, '#00F', '#00F',
			true, true, '#00F', { imgKey: 'icons', sx: 0, sy: 0, width: 50, height: 50 }));
		return s;
	}

	test('重叠处选中上层的（玩家），不是下层的墙', () => {
		// 老代码正向遍历 allTokens，这里会选中墙 —— 点不中自己的棋子
		const hit = overlapped().hitTest(100, 100);
		assert.equal(hit?.token.id, 'teo');
		assert.equal(hit?.group, 'teams');
	});

	test('只命中墙的位置选中墙', () => {
		// (10,100) 在墙上但在棋子半径外
		const hit = overlapped().hitTest(10, 100);
		assert.equal(hit?.token.id, 'w1');
		assert.equal(hit?.group, 'walls');
	});

	test('空白处返回 undefined', () => {
		assert.equal(overlapped().hitTest(500, 500), undefined);
	});

	test('同组内后放的在上层', () => {
		const s = new SandboxScene();
		const mk = (id: string) => new CircleToken(id, 100, 100, 25, 0, '#00F', '#00F',
			true, true, '#00F', { imgKey: 'i', sx: 0, sy: 0, width: 50, height: 50 });
		s.replace('teams', mk('first'));
		s.replace('teams', mk('second'));
		assert.equal(s.hitTest(100, 100)?.token.id, 'second');
	});

});

describe('replace / remove', () => {

	test('replace 同 id 是替换不是追加（moveTo 之后要用它）', async () => {
		const s = new SandboxScene();
		await s.loadFrom(legacyResp(), ROOT);
		const tk = s.get('teams', 'teo')!;
		s.replace('teams', tk.moveTo(50, 50));
		assert.equal(s.list('teams').length, 1, '不该变成 2 个');
		const moved = s.get('teams', 'teo')!;
		assert.deepEqual([moved.getCenter().x, moved.getCenter().y], [150, 150],
			'容器里应该是移动后的新实例');
	});

	test('remove 删得掉', async () => {
		const s = new SandboxScene();
		await s.loadFrom(legacyResp(), ROOT);
		s.remove('teams', 'teo');
		assert.equal(s.list('teams').length, 0);
		assert.equal(s.get('teams', 'teo'), undefined);
	});

});

describe('putImage / removeImage', () => {

	test('putImage 新增图片资源，imageList 能读到', async () => {
		const s = new SandboxScene();
		await s.loadFrom(legacyResp(), ROOT);
		s.putImage({ type: 'Image', id: 'new-img', url: 'http://x/new.jpg' });
		assert.equal(s.images.get('new-img')!.url, 'http://x/new.jpg');
		assert.equal(s.imageList().length, 3, 'map + icons + new-img');
	});

	test('putImage 同 id 是替换（改 url 用），不是追加', async () => {
		const s = new SandboxScene();
		await s.loadFrom(legacyResp(), ROOT);
		s.putImage({ type: 'Image', id: 'icons', url: 'http://x/other.jpg' });
		assert.equal(s.images.get('icons')!.url, 'http://x/other.jpg');
		assert.equal(s.imageList().length, 2, '不该追加成 3 个');
	});

	test('removeImage 删得掉，且不影响 Token 分组', async () => {
		const s = new SandboxScene();
		await s.loadFrom(legacyResp(), ROOT);
		s.removeImage('icons');
		// SimpleMap.get 缺项返回 null（不是 undefined），见 dataStructure.ts
		assert.equal(s.images.get('icons'), null);
		assert.equal(s.imageList().length, 1);
		assert.equal(s.list('teams').length, 1, 'Token 分组不受影响');
	});

});

describe('requireMapImage', () => {

	test('有 map 项时返回它', async () => {
		const s = new SandboxScene();
		await s.loadFrom(legacyResp(), ROOT);
		assert.equal(s.requireMapImage().id, 'map');
	});

	test('缺 map 项时抛出可读的错，并列出现有图片', async () => {
		// 老代码这里抛的是 `Cannot read properties of undefined (reading 'image')`，
		// 指向一句取宽高的代码，看不出是「数据缺了 map 这一项」
		const resp = legacyResp();
		resp.imgResources = [{ id: 'icons', type: 'Image', url: 'http://x/i.jpg' }];
		const s = new SandboxScene();
		await s.loadFrom(resp, ROOT);
		assert.throws(() => s.requireMapImage(), (e: Error) => {
			assert.ok(e.message.includes('map'), '要提到缺的是 map');
			assert.ok(e.message.includes('icons'), '要列出现有的图片资源');
			assert.ok(e.message.includes('编辑器'), '要说怎么修');
			return true;
		});
	});

	test('一张图都没有时也给可读的错', () => {
		const s = new SandboxScene();
		assert.throws(() => s.requireMapImage(), /空/);
	});

});

describe('toJsonStr 序列化', () => {

	test('带上 username 与 loginToken（后端靠它鉴权）', async () => {
		const s = new SandboxScene();
		await s.loadFrom(legacyResp(), ROOT);
		const o = JSON.parse(s.toJsonStr('teo', 'tk-123'));
		assert.equal(o.username, 'teo');
		assert.equal(o.loginToken, 'tk-123');
	});

	test('五个分组都在，字段名与后端一致', async () => {
		const s = new SandboxScene();
		await s.loadFrom(legacyResp(), ROOT);
		const o = JSON.parse(s.toJsonStr('teo', 'tk'));
		for (const k of ['teams', 'creaters', 'furnishings', 'doors', 'walls']) {
			assert.ok(Array.isArray(o.mapDatas[k]), `mapDatas.${k} 应是数组`);
		}
		assert.ok(Array.isArray(o.imgResources));
	});

	test('老数据存一次就自动转正：输出只有 visible', async () => {
		// 这是 4.1 节「写时只写新拼写」的保证
		const s = new SandboxScene();
		await s.loadFrom(legacyResp(), ROOT);
		const json = s.toJsonStr('teo', 'tk');
		assert.ok(!json.includes('visiable'), '输出里不该有老拼写');
		assert.ok(json.includes('visible'), '应该有新拼写');
		const o = JSON.parse(json);
		assert.equal(o.mapDatas.teams[0].visible, true, '值要保住');
		assert.equal(o.mapDatas.walls[0].visible, false);
	});

	test('图片资源只存 id/type/url 三个字段', async () => {
		const s = new SandboxScene();
		await s.loadFrom(legacyResp(), ROOT);
		const o = JSON.parse(s.toJsonStr('teo', 'tk'));
		// imgElem 是运行期加载的 HTMLImageElement，不能进 JSON
		assert.deepEqual(Object.keys(o.imgResources[0]).sort(), ['id', 'type', 'url']);
	});

});
