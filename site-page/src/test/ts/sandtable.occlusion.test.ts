/**
 * 遮挡阴影的过滤、排序与遮挡判断（isOccluder + filterTokensInView）
 *
 * 这是给 view 页沙盘加战争迷雾「墙后阴影」的核心逻辑，纯几何、不碰 canvas
 *（jsdom 没有 2D 上下文，像素只能靠浏览器）。要盯住的是对齐老系统
 * `Observer.filterTokensInView` + `renderTokensOnSandbox` 的几条：
 *
 * - `filterTokensInView` 返回**所有**视野内（距离 < range）的 Token，
 *   从远到近排序，**不区分遮挡物** —— 交错绘制要逐个 Token 判断
 *   「画阴影 + 画自己」，所以不挡视线的 Token 也要留在结果里
 * - `isOccluder` 判断是否投射阴影：blockView 且不是观察者自己 / spectator
 * - 距离用 `getMostCloseVertex`（点到图形的最短距离），
 *   对圆是「圆心到观察者的距离 - 半径」
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	CircleToken, RectangleToken, SandTableUtils, IObserver, IToken2D,
} from '../../main/ts/trpg/sandtable.js';

/** 观察者工厂：默认视野 500 */
const obs = (x: number, y: number, id?: string): IObserver => ({
	c: { x, y },
	viewRange: () => 500,
	id,
});

/** 一个最小的图片裁剪 */
const clip = () => ({ imgKey: 'icons', sx: 0, sy: 0, width: 50, height: 50 });

/** 半径 10 的圆形 Token，blockView 默认 true */
const blocker = (id: string, x: number, y: number, blockView = true): CircleToken =>
	new CircleToken(id, x, y, 10, 0, '#000', '#000', true, blockView, '#0000FF', clip());

describe('isOccluder 的判断', () => {

	test('blockView=true 且非自己非 spectator → true', () => {
		assert.equal(SandTableUtils.isOccluder(blocker('wall', 60, 0, true), obs(0, 0, 'me')), true);
	});

	test('blockView=false → false', () => {
		assert.equal(SandTableUtils.isOccluder(blocker('see', 60, 0, false), obs(0, 0, 'me')), false);
	});

	test('观察者自己 → false', () => {
		assert.equal(SandTableUtils.isOccluder(blocker('me', 60, 0, true), obs(0, 0, 'me')), false);
	});

	test('spectator（旁观者棋子）→ false', () => {
		assert.equal(SandTableUtils.isOccluder(blocker('spectator', 60, 0, true), obs(0, 0, 'me')), false);
	});

	test('观察者没设 id 时不误判（token.id !== undefined 恒真）', () => {
		assert.equal(SandTableUtils.isOccluder(blocker('a', 60, 0, true), obs(0, 0)), true,
			'没有 id 时任何 Token 都不该被「是自己」这个条件排除');
	});

});

describe('filterTokensInView 的过滤', () => {

	test('距离 >= 视野范围的不保留', () => {
		const tokens: Array<IToken2D> = [
			blocker('inside', 50, 0),   // 圆心 50 - 半径 10 = 40，在范围内
			blocker('edge', 110, 0),    // 110 - 10 = 100，恰好在边界，不保留
			blocker('far', 200, 0),     // 190，超范围
		];
		const out = SandTableUtils.filterTokensInView(tokens, obs(0, 0), 100);
		assert.deepEqual(out.map(t => t.id), ['inside']);
	});

	test('保留不挡视线的 Token（blockView=false 只要在范围内就留）', () => {
		const tokens: Array<IToken2D> = [
			blocker('see-through', 30, 0, false),   // 距离 20，不挡视线但在范围内
			blocker('wall', 60, 0, true),           // 距离 50
		];
		const out = SandTableUtils.filterTokensInView(tokens, obs(0, 0), 100);
		// 从远到近：wall(50) 先、see-through(20) 后；两个都在
		assert.deepEqual(out.map(t => t.id), ['wall', 'see-through'],
			'不挡视线的也要留，交错绘制里它们还要画自己');
	});

});

describe('filterTokensInView 的排序', () => {

	test('从远到近（远的先画）', () => {
		const tokens: Array<IToken2D> = [
			blocker('near', 30, 0),   // 距离 20
			blocker('mid', 60, 0),    // 距离 50
			blocker('far', 90, 0),    // 距离 80
		];
		const out = SandTableUtils.filterTokensInView(tokens, obs(0, 0), 100);
		assert.deepEqual(out.map(t => t.id), ['far', 'mid', 'near'],
			'远 → 近，近的阴影后画压在远的上面');
	});

	test('矩形用最近顶点算距离', () => {
		// 矩形 (40, -10) 40×20，中心 (60, 0)，最近顶点是左上 (40,-10)
		// 距离 sqrt(40² + 10²) ≈ 41.23，在范围内
		const rect = new RectangleToken('r', 40, -10, 40, 20, 0, '#000', '#000',
			true, true, '#0000FF', clip());
		const out = SandTableUtils.filterTokensInView([rect], obs(0, 0), 100);
		assert.deepEqual(out.map(t => t.id), ['r']);
	});

});

describe('filterTokensInView 的边界', () => {

	test('空列表不抛错', () => {
		assert.deepEqual(SandTableUtils.filterTokensInView([], obs(0, 0), 100), []);
	});

	test('全部超范围时返回空数组', () => {
		const tokens: Array<IToken2D> = [blocker('far', 200, 0, true)];
		assert.deepEqual(SandTableUtils.filterTokensInView(tokens, obs(0, 0), 100), []);
	});

});
