/**
 * Geo2DUtils 的单元测试
 *
 * geo2d 是重构方案里标为「复用价值最高」的模块（零 DOM 依赖、纯几何运算），
 * 所以测得比其他模块细一些。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Line2D, Geo2DUtils as G } from '../../main/ts/ui/geo2d.js';

describe('Geo2DUtils 常量', () => {

	test('三个 PI 常量', () => {
		assert.equal(G.PI_HALF, Math.PI / 2);
		assert.equal(G.PI_ONE_HALF, Math.PI * 1.5);
		assert.equal(G.PI_DOUBLE, Math.PI * 2);
	});

});

describe('Geo2DUtils.distanceP2P', () => {

	test('3-4-5 直角三角形', () => {
		assert.equal(G.distanceP2P({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
	});

	test('同一点距离为 0', () => {
		assert.equal(G.distanceP2P({ x: 7, y: 7 }, { x: 7, y: 7 }), 0);
	});

	test('与方向无关', () => {
		const a = { x: 1, y: 2 };
		const b = { x: 4, y: 6 };
		assert.equal(G.distanceP2P(a, b), G.distanceP2P(b, a));
	});

	test('负坐标', () => {
		assert.equal(G.distanceP2P({ x: -3, y: -4 }, { x: 0, y: 0 }), 5);
	});

});

describe('Geo2DUtils.checkPointLineSide', () => {

	// 语义：把线段看作「自下而上」的方向，判断点落在左侧（负）还是右侧（正）。
	// 与裸叉积的区别是本函数对点序不敏感 —— 内部会先把端点按 y 排序。

	test('斜线：左右两侧符号相反', () => {
		const diag = { a: { x: 0, y: 0 }, b: { x: 10, y: 10 } };
		assert.ok(G.checkPointLineSide(diag, { x: 0, y: 10 }) < 0, '左上方应为负');
		assert.ok(G.checkPointLineSide(diag, { x: 10, y: 0 }) > 0, '右下方应为正');
	});

	test('直线上的点返回 0', () => {
		const diag = { a: { x: 0, y: 0 }, b: { x: 10, y: 10 } };
		assert.equal(G.checkPointLineSide(diag, { x: 5, y: 5 }), 0, '线段内');
		assert.equal(G.checkPointLineSide(diag, { x: 20, y: 20 }), 0, '延长线上');
		assert.equal(G.checkPointLineSide(diag, { x: -5, y: -5 }), 0, '反向延长线上');
	});

	test('水平线不再除零', () => {
		// 原实现在 a.y === b.y 时分母为 0，返回 ±Infinity
		const h = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
		const up = G.checkPointLineSide(h, { x: 5, y: 5 });
		const down = G.checkPointLineSide(h, { x: 5, y: -5 });
		assert.ok(Number.isFinite(up), `上方应为有限值，实际 ${up}`);
		assert.ok(Number.isFinite(down), `下方应为有限值，实际 ${down}`);
		assert.ok(up < 0 && down > 0, '两侧符号应相反');
	});

	test('点的 y 与端点 y 相同时不再谎报 0', () => {
		// 原实现三个分支条件是开区间，p.y === a.y 或 p.y === b.y 时全部落空，
		// side 保持初值 0，等于说「点在线上」
		const diag = { a: { x: 0, y: 0 }, b: { x: 10, y: 10 } };
		assert.notEqual(G.checkPointLineSide(diag, { x: -4, y: 0 }), 0,
			'与 a 同高但偏左的点不在线上');
		assert.notEqual(G.checkPointLineSide(diag, { x: 99, y: 10 }), 0,
			'与 b 同高但偏右的点不在线上');
	});

	test('a.x 不为 0 时截距计算正确', () => {
		// 原实现有个分支把截距项写成 `- a.x`（应为 `+ a.x`），
		// a.x === 0 时碰巧看不出来
		const line = { a: { x: 5, y: 0 }, b: { x: 15, y: 10 } };
		// (25, 20) 正在这条直线的延长线上：x = 5 + (20-0) = 25
		assert.equal(G.checkPointLineSide(line, { x: 25, y: 20 }), 0,
			'延长线上的点应判为在线上');
	});

	test('对 a/b 的书写顺序不敏感', () => {
		const p = { x: 0, y: 5 };
		const up = { a: { x: 0, y: 0 }, b: { x: 10, y: 10 } };
		const down = { a: { x: 10, y: 10 }, b: { x: 0, y: 0 } };
		assert.equal(G.checkPointLineSide(up, p), G.checkPointLineSide(down, p));
	});

	test('方向已是自下而上时，等于裸叉积的相反数', () => {
		// 裸叉积用 a→b 的原始方向，符号随点序翻转；
		// checkPointLineSide 固定用「自下而上」方向，并约定左侧为负。
		// 当 a.y < b.y（本就是自下而上）时，两者恰好互为相反数。
		const a = { x: 0, y: 0 }, b = { x: 10, y: 10 }, p = { x: 0, y: 5 };
		const rawCross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
		assert.equal(G.checkPointLineSide({ a, b }, p), -rawCross);
	});

	test('共线时返回 +0 而非 -0', () => {
		// 水平线上向左的共线点会让某一项算出 `0 * 负数 = -0`。
		// `-0 === 0` 虽成立，但 Object.is 与严格断言会区分两者
		const h = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
		const v = G.checkPointLineSide(h, { x: -20, y: 0 });
		assert.ok(Object.is(v, 0), `应为 +0，实际 ${Object.is(v, -0) ? '-0' : v}`);
	});

	test('绝对值与点到直线的距离成正比', () => {
		const line = { a: { x: 0, y: 0 }, b: { x: 0, y: 10 } };  // 垂直线
		const near = Math.abs(G.checkPointLineSide(line, { x: 1, y: 5 }));
		const far = Math.abs(G.checkPointLineSide(line, { x: 3, y: 5 }));
		assert.equal(far, near * 3, '距离 3 倍，值也应是 3 倍');
	});

});

describe('叉积的绝对值与距离的关系', () => {

	/** 点到【直线】的距离（不限制在线段范围内） */
	const distToLine = (a: { x: number, y: number }, b: { x: number, y: number },
		p: { x: number, y: number }) =>
		Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x))
		/ Math.hypot(b.x - a.x, b.y - a.y);

	test('|cross| = |d| × 点到直线的距离', () => {
		const cases: Array<[{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }]> = [
			[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 7 }],
			[{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 3, y: 5 }],
			[{ x: 1, y: 2 }, { x: 7, y: 9 }, { x: -4, y: 11 }],
			[{ x: -3, y: -3 }, { x: 4, y: 1 }, { x: 20, y: -8 }],
		];
		for (const [a, b, p] of cases) {
			const len = Math.hypot(b.x - a.x, b.y - a.y);
			// checkPointLineSide 的方向归一化只翻符号、不改绝对值，
			// 所以取绝对值后就是 |cross|
			const absCross = Math.abs(G.checkPointLineSide({ a, b }, p));
			const expect = len * distToLine(a, b, p);
			assert.ok(Math.abs(absCross - expect) < 1e-9,
				`|cross|=${absCross} 应等于 |d|×距离=${expect}`);
		}
	});

	test('同一条直线上，|cross| 大的点离得远', () => {
		// 这是叉积的实用价值：比较远近不用开方
		const line = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
		const near = Math.abs(G.checkPointLineSide(line, { x: 5, y: 1 }));
		const far = Math.abs(G.checkPointLineSide(line, { x: 5, y: 9 }));
		assert.ok(far > near);
		assert.equal(far, near * 9, '距离 9 倍，叉积也是 9 倍');
	});

});

describe('Geo2DUtils.segmentsIntr', () => {

	test('X 形交叉返回交点', () => {
		const r = G.segmentsIntr(
			new Line2D({ x: 0, y: 0 }, { x: 10, y: 10 }),
			new Line2D({ x: 0, y: 10 }, { x: 10, y: 0 }));
		assert.notEqual(r, false, '应返回交点而不是 false');
		const p = r as { x: number, y: number };
		assert.equal(p.x, 5);
		assert.equal(p.y, 5);
	});

	test('平行线不相交', () => {
		assert.equal(G.segmentsIntr(
			new Line2D({ x: 0, y: 0 }, { x: 10, y: 0 }),
			new Line2D({ x: 0, y: 5 }, { x: 10, y: 5 })), false);
	});

	test('只在延长线上相交时算不相交', () => {
		// 两条短线段，各自延长后会交，但线段本身不交
		assert.equal(G.segmentsIntr(
			new Line2D({ x: 0, y: 0 }, { x: 1, y: 1 }),
			new Line2D({ x: 5, y: 0 }, { x: 6, y: 1 })), false);
	});

	test('T 形端点相接算不相交（当前行为）', () => {
		// 第二条线段的起点正好落在第一条上。实现里判定是严格不等，
		// 所以端点接触不算相交 —— 记录现状，调用方需要时自己处理边界
		assert.equal(G.segmentsIntr(
			new Line2D({ x: 0, y: 0 }, { x: 10, y: 0 }),
			new Line2D({ x: 5, y: 0 }, { x: 5, y: 10 })), false);
	});

});

describe('Geo2DUtils.formatAngle', () => {

	test('正角度原样返回', () => {
		const r = G.formatAngle(Math.PI);
		assert.equal(r.oriAgl, Math.PI);
		assert.equal(r.fmtAgl, Math.PI);
		assert.equal(r.oriDgr, 180);
		assert.equal(r.fmtDgr, 180);
	});

	test('负角度加 2π 转正', () => {
		const r = G.formatAngle(-Math.PI / 2);
		assert.equal(r.oriAgl, -Math.PI / 2);
		assert.equal(r.fmtAgl, Math.PI * 1.5);
		assert.equal(r.oriDgr, -90);
		assert.equal(r.fmtDgr, 270);
	});

	test('超出 ±2π 的输入也折回 [0, 2π)', () => {
		// 原实现只补一次 2π，-3π 补完仍为负、3π 也没折回。现在用取模
		assert.equal(G.formatAngle(-3 * Math.PI).fmtDgr, 180);
		assert.equal(G.formatAngle(3 * Math.PI).fmtDgr, 180);
		assert.equal(G.formatAngle(5 * Math.PI).fmtDgr, 180);
	});

	test('圈数很大时有浮点残差，但仍在容差内', () => {
		// 2π 是无理数的浮点近似，`100π % 2π` 不会精确等于 0。
		// 这是浮点取模的固有误差，不是实现问题 —— 换任何写法都躲不开。
		// 调用方比较角度时应当用容差，不要用 ===
		const v = G.formatAngle(100 * Math.PI).fmtDgr;
		assert.ok(Math.abs(v) < 1e-9, `应约等于 0，实际 ${v}`);
	});

	test('整圈的边界：2π 与 -2π 都归到 0', () => {
		assert.equal(G.formatAngle(G.PI_DOUBLE).fmtAgl, 0);
		assert.equal(G.formatAngle(-G.PI_DOUBLE).fmtAgl, 0);
	});

	test('fmtAgl 恒落在 [0, 2π)，且不是 -0', () => {
		for (let k = -5; k <= 5; k++) {
			for (let f = 0; f < 12; f++) {
				const a = k * G.PI_DOUBLE + f * G.PI_DOUBLE / 12;
				const v = G.formatAngle(a).fmtAgl;
				assert.ok(v >= 0 && v < G.PI_DOUBLE, `${a} -> ${v} 越界`);
				assert.ok(!Object.is(v, -0), `${a} -> -0`);
			}
		}
	});

	test('fmtAgl 与输入相差整数圈', () => {
		for (const a of [-7.3, -3, -0.5, 0, 0.5, 3, 7.3, 50]) {
			const v = G.formatAngle(a).fmtAgl;
			const turns = (a - v) / G.PI_DOUBLE;
			assert.ok(Math.abs(turns - Math.round(turns)) < 1e-9,
				`${a} -> ${v}，相差 ${turns} 圈，不是整数`);
		}
	});

	test('oriAgl / oriDgr 保留原始值，不做归一化', () => {
		const r = G.formatAngle(3 * Math.PI);
		assert.equal(r.oriAgl, 3 * Math.PI, 'oriAgl 应为原值');
		assert.equal(r.oriDgr, 540, 'oriDgr 应为原值对应的度数');
	});

	test('formatAngleStr 四个字段都出现', () => {
		const s = G.formatAngleStr(Math.PI);
		assert.match(s, /^angle: /);
		assert.ok(s.includes('180'), `应含角度值：${s}`);
		assert.equal((s.match(/°/g) || []).length, 2, '应有两个度数符号');
	});

});
