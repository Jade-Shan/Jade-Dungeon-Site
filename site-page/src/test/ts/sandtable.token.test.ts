/**
 * 沙盘 Token 的编辑交互与存量数据兼容
 *
 * 这些是 sandbox 模块迁移的期 1 产物（见 docs/sandbox-refactor.md）。
 * 要盯住的三件事：
 *
 * - **`visiable` 兼容**：存量数据的拼写错误要认，但写回时只写 `visible`，
 *   这样场景在第一次保存后自动转正（4.1 节）
 * - **`moveTo` / `scaleTo` 返回新实例**：几何层字段是 `readonly`，
 *   而且 `Rectangle2D` 缓存了顶点与边。原地改会让缓存失效且不报错（4.6 节）
 * - **`isHit` 的边界**：编辑器靠它选中 Token，线段还要靠容差
 *
 * 全是纯几何与纯数据，不需要 jsdom。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	CircleToken, RectangleToken, LineToken, readVisible,
	LINE_HIT_TOLERANCE, ICircleTokenRec, IRectangleTokenRec, ILineTokenRec,
} from '../../main/ts/trpg/sandtable.js';

/** 一个最小的图片裁剪，三种 Token 都能用 */
const clip = () => ({ imgKey: 'icons', sx: 0, sy: 0, width: 50, height: 50 });

const circle = () => new CircleToken('c1', 100, 100, 25, 0, '#000', '#000',
	true, true, '#0000FF', clip());
const rect = () => new RectangleToken('r1', 100, 100, 40, 20, 0, '#000', '#000',
	true, true, '#0000FF', clip());
const line = () => new LineToken('l1', 0, 0, 100, 0, 6, '', '#00FF00', false, true);

describe('readVisible 兼容存量数据的 visiable 拼写', () => {

	test('只有 visiable（存量老数据）时取它的值', () => {
		assert.equal(readVisible({ visiable: true }), true);
		assert.equal(readVisible({ visiable: false }), false);
	});

	test('只有 visible（新数据）时取它的值', () => {
		assert.equal(readVisible({ visible: true }), true);
		assert.equal(readVisible({ visible: false }), false);
	});

	test('两个都有且冲突时 visible 优先', () => {
		// ?? 的语义：左边不是 null/undefined 就用左边
		assert.equal(readVisible({ visible: true, visiable: false }), true);
		assert.equal(readVisible({ visible: false, visiable: true }), false);
	});

	test('两个都没有时得到 false，不是 undefined', () => {
		// 兜底成 false 是有意的：棋子隐形是可观测的异常，
		// 默认可见会把「数据有问题」伪装成「一切正常」
		assert.equal(readVisible({}), false);
	});

});

describe('fromRecord 读老拼写、toRecord 只写新拼写', () => {

	/** 老数据：只有 visiable */
	const legacyCircle = {
		type: 'Circle', id: 'c1', x: 10, y: 20, radius: 25,
		visiable: true, blockView: true, color: '#0000FF', img: clip(),
	} as unknown as ICircleTokenRec;

	test('CircleToken 认老拼写', () => {
		assert.equal(CircleToken.fromRecord(legacyCircle, []).visible, true);
	});

	test('RectangleToken 认老拼写', () => {
		const rec = {
			type: 'Rectangle', id: 'r1', x: 10, y: 20, width: 40, height: 20,
			visiable: true, blockView: true, color: '#0000FF', img: clip(),
		} as unknown as IRectangleTokenRec;
		assert.equal(RectangleToken.fromRecord(rec, []).visible, true);
	});

	test('LineToken 认老拼写', () => {
		const rec = {
			type: 'Line', id: 'l1', x: 0, y: 0, x2: 100, y2: 0,
			visiable: true, blockView: true, color: '#00FF00',
		} as unknown as ILineTokenRec;
		assert.equal(LineToken.fromRecord(rec).visible, true);
	});

	test('toRecord 的输出不含 visiable 键', () => {
		for (const tk of [circle(), rect(), line()]) {
			const rec = tk.toRecord() as unknown as Record<string, unknown>;
			assert.ok('visible' in rec, `${tk.id} 应写 visible`);
			assert.ok(!('visiable' in rec), `${tk.id} 不该写 visiable`);
		}
	});

	test('老数据往返一圈之后只剩新拼写，值不变', () => {
		// 这条是「自动转正」的保证：GM 第一次保存后，存量数据就不再有老拼写
		const rec = CircleToken.fromRecord(legacyCircle, []).toRecord() as
			unknown as Record<string, unknown>;
		assert.equal(rec.visible, true, '值要保住');
		assert.ok(!('visiable' in rec), '老键应该消失');
	});

});

describe('isHit 命中测试', () => {

	test('圆形：圆心、边界内、边界上都算命中', () => {
		const c = circle();   // 圆心 (100,100) 半径 25
		assert.ok(c.isHit(100, 100), '圆心');
		assert.ok(c.isHit(120, 100), '半径内');
		assert.ok(c.isHit(125, 100), '正好在边界上');
	});

	test('圆形：边界外不命中', () => {
		const c = circle();
		assert.ok(!c.isHit(126, 100), '差 1 像素');
		assert.ok(!c.isHit(100, 200));
	});

	test('矩形：内部与四个角都算命中', () => {
		const r = rect();   // (100,100) 40×20
		assert.ok(r.isHit(120, 110), '内部');
		for (const [x, y] of [[100, 100], [140, 100], [140, 120], [100, 120]]) {
			assert.ok(r.isHit(x, y), `角 (${x},${y})`);
		}
	});

	test('矩形：外部不命中', () => {
		const r = rect();
		assert.ok(!r.isHit(99, 110));
		assert.ok(!r.isHit(141, 110));
		assert.ok(!r.isHit(120, 121));
	});

	test('线段：容差之内命中，之外不命中', () => {
		const l = line();   // (0,0) → (100,0)
		assert.ok(l.isHit(50, 0), '正好在线上');
		assert.ok(l.isHit(50, LINE_HIT_TOLERANCE), '容差边界');
		assert.ok(!l.isHit(50, LINE_HIT_TOLERANCE + 1), '超出容差');
	});

	test('线段：延长线上不命中（用的是线段距离，不是直线距离）', () => {
		const l = line();
		// (200,0) 在直线上但在线段之外，距离终点 100
		assert.ok(!l.isHit(200, 0), '延长线上不该命中');
		assert.ok(l.isHit(100, 0), '终点要命中');
	});

	test('线段：两端重合（退化成点）不抛错', () => {
		const dot = new LineToken('d', 50, 50, 50, 50, 6, '', '#000', false, true);
		assert.ok(dot.isHit(50, 50));
		assert.ok(!dot.isHit(70, 70));
	});

});

describe('moveTo / scaleTo 返回新实例，不改原对象', () => {

	test('moveTo 不动原对象', () => {
		const c = circle();
		const moved = c.moveTo(10, 20);
		assert.notEqual(moved, c, '必须是不同的对象');
		assert.deepEqual([c.c.x, c.c.y], [100, 100], '原对象的坐标不该变');
		assert.deepEqual([moved.c.x, moved.c.y], [110, 120]);
	});

	test('scaleTo 不动原对象', () => {
		const c = circle();
		const scaled = c.scaleTo(10, 0);
		assert.equal(c.radius, 25, '原半径不该变');
		assert.equal(scaled.radius, 35);
	});

	test('三种 Token 的 moveTo 都平移正确', () => {
		const c = circle().moveTo(5, 5);
		assert.deepEqual([c.c.x, c.c.y], [105, 105]);

		const r = rect().moveTo(5, -5);
		assert.deepEqual([r.x, r.y], [105, 95]);
		assert.deepEqual([r.width, r.height], [40, 20], '尺寸不该变');

		const l = line().moveTo(10, 10);
		assert.deepEqual([l.a.x, l.a.y, l.b.x, l.b.y], [10, 10, 110, 10],
			'两端一起移');
	});

	test('矩形 moveTo 之后缓存的顶点跟着走（4.6 节那个坑的回归）', () => {
		// Rectangle2D 在构造函数里就把 vertexs / sides 算好缓存了。
		// 如果 moveTo 是原地改 x/y，这里拿到的还是旧位置的顶点 ——
		// 阴影投射与碰撞检测会静默按旧位置算。
		const moved = rect().moveTo(100, 0);
		const xs = moved.getVertex().map(p => p.x).sort((a, b) => a - b);
		assert.deepEqual(xs, [200, 200, 240, 240],
			'顶点必须在新位置；如果出现 100/140 说明缓存没更新');
		assert.equal(moved.getCenter().x, 220, '中心点也要跟着走');
	});

	test('圆形 scaleTo 之后 getMostCloseVertex 用的是新半径', () => {
		const scaled = circle().scaleTo(25, 0);   // 半径 25 → 50
		// 圆心 (100,100)、半径 50，外部点 (200,100) 到圆的距离应是 50
		assert.equal(scaled.getMostCloseVertex(200, 100).distance, 50);
	});

	test('尺寸有下限 1，不会变成 0 或负数', () => {
		// 0 尺寸的 Token 画不出来，而且 isHit 永远 false ——
		// 会变成选不中、删不掉的幽灵
		assert.equal(circle().scaleTo(-999, 0).radius, 1);
		const r = rect().scaleTo(-999, -999);
		assert.deepEqual([r.width, r.height], [1, 1]);
	});

	test('线段的 scaleTo 只动终点', () => {
		const l = line().scaleTo(20, 30);
		assert.deepEqual([l.a.x, l.a.y], [0, 0], '起点不动');
		assert.deepEqual([l.b.x, l.b.y], [120, 30]);
	});

	test('属性照搬：id / 可见性 / 阻挡 / 颜色都不变', () => {
		const src = circle();
		for (const tk of [src.moveTo(1, 1), src.scaleTo(1, 0), src.clone()]) {
			assert.equal(tk.id, src.id);
			assert.equal(tk.visible, src.visible);
			assert.equal(tk.blockView, src.blockView);
			assert.equal(tk.color, src.color);
		}
	});

});

describe('clone', () => {

	test('是独立对象，但位置尺寸一致', () => {
		const c = circle();
		const cp = c.clone();
		assert.notEqual(cp, c, '不是同一个对象');
		assert.deepEqual(cp.toRecord(), c.toRecord(), '序列化结果应一致');
	});

	test('imgClip 是新对象（改副本不影响原件）', () => {
		const c = circle();
		const cp = c.clone();
		assert.notEqual(cp.imgClip, c.imgClip, 'imgClip 应该是拷贝');
		cp.imgClip.sx = 999;
		assert.equal(c.imgClip.sx, 0, '原件的裁剪参数不该被改');
	});

	test('三种 Token 都能 clone', () => {
		for (const tk of [circle(), rect(), line()]) {
			assert.deepEqual(tk.clone().toRecord(), tk.toRecord());
		}
	});

});
