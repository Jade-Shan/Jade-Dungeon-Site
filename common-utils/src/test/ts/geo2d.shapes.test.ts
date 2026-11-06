/**
 * geo2d 几何类的单元测试
 *
 * 几个类都实现 GeoShape2D 接口（getCenter / getVertexesFrom / getMostCloseVertex），
 * 所以除了各自的构造语义，也测一遍接口契约是否真的齐备。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	Point2D, Line2D, Circle2D, Rectangle2D, Ray2D, Geo2DUtils as G
} from '../../main/ts/ui/geo2d.js';

describe('Point2D', () => {

	test('构造与坐标', () => {
		const p = new Point2D(3, 4);
		assert.equal(p.x, 3);
		assert.equal(p.y, 4);
	});

	test('getCenter 返回自身坐标', () => {
		const c = new Point2D(3, 4).getCenter();
		assert.equal(c.x, 3);
		assert.equal(c.y, 4);
	});

	test('作为单顶点多边形，getVertex 返回一个点', () => {
		const vs = new Point2D(3, 4).getVertex();
		assert.equal(vs.length, 1);
		assert.equal(vs[0].x, 3);
	});

	test('getMostCloseVertex 只能是自己', () => {
		const r = new Point2D(3, 4).getMostCloseVertex(0, 0);
		assert.equal(r.vertex.x, 3);
		assert.equal(r.vertex.y, 4);
		assert.equal(r.distance, 5, '(0,0) 到 (3,4) 距离为 5');
	});

});

describe('Line2D', () => {

	test('构造保留两个端点', () => {
		const ln = new Line2D({ x: 0, y: 0 }, { x: 3, y: 4 });
		assert.equal(ln.a.x, 0);
		assert.equal(ln.b.x, 3);
		assert.equal(ln.b.y, 4);
	});

	test('getVertex 返回两个端点', () => {
		const vs = new Line2D({ x: 0, y: 0 }, { x: 3, y: 4 }).getVertex();
		assert.equal(vs.length, 2);
	});

	test('getCenter 是中点', () => {
		const c = new Line2D({ x: 0, y: 0 }, { x: 10, y: 20 }).getCenter();
		assert.equal(c.x, 5);
		assert.equal(c.y, 10);
	});

});

describe('Circle2D', () => {

	test('构造签名是 (x, y, radius) 而非 (point, radius)', () => {
		const c = new Circle2D(1, 2, 5);
		assert.equal(c.c.x, 1);
		assert.equal(c.c.y, 2);
		assert.equal(c.radius, 5);
	});

	test('getCenter 返回圆心', () => {
		const c = new Circle2D(1, 2, 5).getCenter();
		assert.equal(c.x, 1);
		assert.equal(c.y, 2);
	});

	test('圆外的点：最近点落在圆周上', () => {
		const c = new Circle2D(0, 0, 5);
		const r = c.getMostCloseVertex(10, 0);
		assert.equal(r.vertex.x, 5, '最近点应在圆周上');
		assert.equal(r.vertex.y, 0);
		assert.equal(r.distance, 5, '(10,0) 到圆周距离为 10-5=5');
	});

	test('最近点到圆心的距离恒等于半径', () => {
		const c = new Circle2D(0, 0, 5);
		for (const [x, y] of [[10, 0], [0, 10], [7, 7], [-8, 3]]) {
			const v = c.getMostCloseVertex(x, y).vertex;
			const d = G.distanceP2P({ x: 0, y: 0 }, v);
			assert.ok(Math.abs(d - 5) < 1e-9, `(${x},${y}) 的最近点距圆心应为 5，实际 ${d}`);
		}
	});

});

describe('Rectangle2D', () => {

	test('构造签名是 (x1, y1, x2, y2)', () => {
		const r = new Rectangle2D(0, 0, 10, 10);
		const vs = r.getVertex();
		assert.equal(vs.length, 4, '矩形应有 4 个顶点');
	});

	test('四个顶点按顺序绕一圈', () => {
		const vs = new Rectangle2D(0, 0, 10, 10).getVertex();
		assert.deepEqual(
			vs.map(v => [v.x, v.y]),
			[[0, 0], [10, 0], [10, 10], [0, 10]]);
	});

	test('getCenter 是几何中心', () => {
		const c = new Rectangle2D(0, 0, 10, 10).getCenter();
		assert.equal(c.x, 5);
		assert.equal(c.y, 5);
	});

	test('getMostCloseVertex 挑最近的角', () => {
		const r = new Rectangle2D(0, 0, 10, 10);
		assert.deepEqual(
			[r.getMostCloseVertex(1, 1).vertex.x, r.getMostCloseVertex(1, 1).vertex.y],
			[0, 0]);
		assert.deepEqual(
			[r.getMostCloseVertex(9, 9).vertex.x, r.getMostCloseVertex(9, 9).vertex.y],
			[10, 10]);
	});

});

describe('Ray2D', () => {

	test('构造后带上角度与长度信息', () => {
		const ray = new Ray2D({ x: 0, y: 0 }, { x: 3, y: 4 });
		assert.equal(ray.start.x, 0);
		assert.equal(ray.mid.x, 3);
		assert.equal(ray.length, 5, '(0,0)→(3,4) 长度为 5');
		assert.equal(typeof ray.angle, 'number');
		assert.equal(typeof ray.angleStr, 'string');
	});

	test('setRayLength 改长度但保持方向', () => {
		const ray = new Ray2D({ x: 0, y: 0 }, { x: 3, y: 4 });
		const longer = G.setRayLength(ray, 10);
		assert.equal(longer.length, 10);
		// 方向不变 → 角度相同
		assert.ok(Math.abs(longer.angle - ray.angle) < 1e-9,
			`角度应不变：${ray.angle} vs ${longer.angle}`);
	});

	test('calRayByPoints 由两点构造射线', () => {
		const ray = G.calRayByPoints({ x: 0, y: 0 }, { x: 3, y: 4 });
		assert.equal(ray.length, 5);
	});

});

describe('GeoShape2D 接口契约', () => {

	test('四个类都实现了三个必需方法', () => {
		const shapes = [
			['Point2D', new Point2D(1, 1)],
			['Line2D', new Line2D({ x: 0, y: 0 }, { x: 1, y: 1 })],
			['Circle2D', new Circle2D(0, 0, 5)],
			['Rectangle2D', new Rectangle2D(0, 0, 10, 10)],
		] as const;

		for (const [name, shape] of shapes) {
			assert.equal(typeof shape.getCenter, 'function', `${name}.getCenter`);
			assert.equal(typeof shape.getVertexesFrom, 'function', `${name}.getVertexesFrom`);
			assert.equal(typeof shape.getMostCloseVertex, 'function', `${name}.getMostCloseVertex`);
		}
	});

	test('getMostCloseVertex 返回的 distance 恒为非负', () => {
		const shapes = [
			new Point2D(1, 1),
			new Line2D({ x: 0, y: 0 }, { x: 1, y: 1 }),
			new Circle2D(0, 0, 5),
			new Rectangle2D(0, 0, 10, 10),
		];
		for (const s of shapes) {
			for (const [x, y] of [[0, 0], [100, 100], [-50, 20]]) {
				const d = s.getMostCloseVertex(x, y).distance;
				assert.ok(d >= 0, `距离不应为负：${d}`);
				assert.ok(Number.isFinite(d), `距离应为有限数：${d}`);
			}
		}
	});

});
