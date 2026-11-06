/**
 * Token 图片的装载与序列化
 *
 * 盯两条本来会静默失败的线：
 *
 * - **`loadFrom` 必须先备好图片元素再建 Token** —— `fromRecord()` 是把
 *   `ImageResource.imgElem` **快照拷贝**进 Token 的 `imgClip.imageElem` 的，
 *   建完之后再去填 `imgElem` 对已经建好的 Token 没有任何影响。
 *   表现是棋子图片不显示，而且不报错
 * - **`toRecord()` 不能把 `imageElem` 写进存档** —— 它是 HTMLImageElement，
 *   `JSON.stringify` 之后变成 `{}`。空对象是**真值**，
 *   下次载入时 `draw()` 会拿它去 `drawImage()`
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installDomForFile } from './_jsdom-setup.js';
import { SandboxScene } from '../../main/ts/sandbox/sandboxScene.js';
import {
	CircleToken, RectangleToken, SceneDataResp,
} from '../../main/ts/trpg/sandtable.js';

const ROOT = '//cdn.x/themes/trpg/images';

// 用图片桩：jsdom 不加载图片、两个事件都不触发，
// 真跑会让 loadImageByProxy 的 await 永久挂起（详见 stubImageLoading 的注释）
const dom = installDomForFile('<div></div>', { stubImages: true });
before(dom.setup);
after(dom.teardown);

/** 带图片的最小场景 */
const respWithImages = (): SceneDataResp => ({
	username: 'teo',
	imgResources: [
		{ id: 'map', type: 'Image', url: 'http://img.host/map.jpg' },
		{ id: 'icons', type: 'Image', url: 'http://img.host/icons.jpg' },
	],
	mapDatas: {
		teams: [{
		type: 'Circle', id: 'teo', x: 100, y: 100, radius: 25,
		visible: true, blockView: true, color: '#0000FF',
		img: { imgKey: 'icons', sx: 0, sy: 0, width: 50, height: 50 },
		}],
		doors: [{
		type: 'Rectangle', id: 'd1', x: 150, y: 440, width: 100, height: 15,
		visible: true, blockView: true, color: '#FF0000',
		img: { imgKey: 'icons', sx: 0, sy: 0, width: 100, height: 15 },
		}],
		creaters: [], furnishings: [], walls: [],
	},
} as unknown as SceneDataResp);

describe('Token 的图片元素', () => {

	test('装载完成后，带 imgKey 的 Token 都挂上了图片元素', async () => {
		const s = new SandboxScene();
		await s.loadFrom(respWithImages(), ROOT);

		const icons = s.images.get('icons');
		assert.ok(icons, '图片资源 icons 应当在表里');
		assert.ok(icons.imgElem,
			'loadFrom 应当已经把图片元素加载好了（jsdom 里加载会失败、换占位图，' +
			'但元素本身一定在）');

		const team = s.list('teams')[0] as CircleToken;
		const door = s.list('doors')[0] as RectangleToken;

		// 这是本次要修的那条：Token 的 imageElem 应当指向资源表里的元素
		assert.ok(team.imgClip, '圆形 Token 应当有 imgClip');
		assert.equal(team.imgClip.imgKey, 'icons');
		assert.ok(team.imgClip.imageElem,
			'圆形 Token 的 imageElem 没挂上 —— 棋子图片不会显示');
		assert.ok(door.imgClip.imageElem,
			'矩形 Token 的 imageElem 没挂上 —— 门的图片不会显示');
		assert.equal(team.imgClip.imageElem, icons.imgElem,
			'Token 的图片元素应当就是资源表里那一个');
	});

	test('toRecord 不把图片元素写进存档', async () => {
		const s = new SandboxScene();
		await s.loadFrom(respWithImages(), ROOT);

		// 这一步是本用例的前提：Token 身上**确实挂着**一个图片元素。
		// 不先确认的话，哪怕 toRecord 原样写出 imgClip 也会「通过」——
		// 因为 imageElem 本来就是 undefined。之前这个用例就是这么假通过的
		const team = s.list('teams')[0] as CircleToken;
		assert.ok(team.imgClip.imageElem,
			'前提不成立：Token 没挂上图片元素，这个用例验不到东西');

		const rec = team.toRecord();

		// imageElem 是 HTMLImageElement，JSON.stringify 之后是 {}，
		// 而空对象是真值 —— 下次载入时会被当成一张可用的图
		assert.equal((rec.img as unknown as Record<string, unknown>).imageElem, undefined,
			'存档里不该有 imageElem');
		const json = JSON.stringify(rec);
		assert.ok(!json.includes('imageElem'),
			`序列化结果里不该出现 imageElem，实际：${json}`);
	});

	test('存量数据里残留的 imageElem 空对象要被丢掉', async () => {
		// 模拟「新编辑器存过一次」的数据：img 里带着 imageElem: {}
		const resp = respWithImages() as unknown as {
			mapDatas: { teams: Array<{ img: Record<string, unknown> }> };
		};
		resp.mapDatas.teams[0].img.imageElem = {};

		const s = new SandboxScene();
		await s.loadFrom(resp as unknown as SceneDataResp, ROOT);
		const team = s.list('teams')[0] as CircleToken;

		// 要么挂上真元素，要么是 undefined —— 绝不能是那个空对象
		const elem = team.imgClip.imageElem as unknown;
		if (elem !== undefined) {
			assert.ok(typeof (elem as { getAttribute?: unknown }).getAttribute === 'function',
				'imageElem 必须是真的 HTMLImageElement，不能是存档里的空对象');
		}
	});

});
