/**
 * Geo2DUtils.revolveRay 的单元测试
 *
 * `diff` 的用途：`CanvasUtils.drawFanByRays()` 用它的符号决定 `arc()` 的
 * anticlockwise 参数，用它的大小决定扇形张角。所以语义是「短弧的有向角」——
 * 两条射线之间不超过半圈的那个转法。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Geo2DUtils as G } from '../../main/ts/ui/geo2d.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** 以 c 为圆心、按角度取一个点 */
const at = (c: { x: number, y: number }, deg: number, r = 10) =>
	({ x: c.x + Math.cos(deg * DEG) * r, y: c.y + Math.sin(deg * DEG) * r });

const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;

describe('revolveRay 基本语义', () => {

	const c = { x: 0, y: 0 };

	test('start / end 就是两点相对圆心的 atan2 角度', () => {
		const r = G.revolveRay(c, { x: 10, y: 0 }, { x: 0, y: 10 });
		assert.ok(near(r.start, 0), `start 应为 0，实际 ${r.start}`);
		assert.ok(near(r.end, Math.PI / 2), `end 应为 π/2，实际 ${r.end}`);
	});

	test('逆时针小角度：diff 为正', () => {
		const r = G.revolveRay(c, at(c, 0), at(c, 30));
		assert.ok(near(r.diff, 30 * DEG), `应为 +30°，实际 ${r.diff / DEG}°`);
	});

	test('顺时针小角度：diff 为负', () => {
		const r = G.revolveRay(c, at(c, 30), at(c, 0));
		assert.ok(near(r.diff, -30 * DEG), `应为 -30°，实际 ${r.diff / DEG}°`);
	});

	test('同一点：diff 为 0', () => {
		const p = at(c, 42);
		assert.ok(near(G.revolveRay(c, p, p).diff, 0));
	});

});

describe('revolveRay 取短弧，不取长弧', () => {

	const c = { x: 0, y: 0 };

	test('跨 ±180° 边界时走短的那边', () => {
		// 从 170° 到 -170°（即 190°）：短弧是 +20°，长弧是 -340°
		const r = G.revolveRay(c, at(c, 170), at(c, -170));
		assert.ok(near(r.diff, 20 * DEG), `应为 +20°，实际 ${(r.diff / DEG).toFixed(2)}°`);
	});

	test('反方向跨边界同样走短弧', () => {
		const r = G.revolveRay(c, at(c, -170), at(c, 170));
		assert.ok(near(r.diff, -20 * DEG), `应为 -20°，实际 ${(r.diff / DEG).toFixed(2)}°`);
	});

	test('diff 的绝对值恒不超过 π', () => {
		for (let s = 0; s < 360; s += 7) {
			for (let e = 0; e < 360; e += 11) {
				const d = G.revolveRay(c, at(c, s), at(c, e)).diff;
				assert.ok(Math.abs(d) <= Math.PI + 1e-9,
					`${s}°→${e}° 的 diff=${(d / DEG).toFixed(1)}° 超过了半圈`);
			}
		}
	});

	test('diff 与 end-start 相差恰好 0 或 ±2π', () => {
		for (let s = 0; s < 360; s += 13) {
			for (let e = 0; e < 360; e += 17) {
				const r = G.revolveRay(c, at(c, s), at(c, e));
				const raw = r.end - r.start;
				const delta = Math.abs(raw - r.diff);
				assert.ok(near(delta, 0) || near(delta, TAU),
					`${s}°→${e}°：diff 与原始差值相差 ${delta}，既不是 0 也不是 2π`);
			}
		}
	});

});

describe('revolveRay 的反对称性', () => {

	test('交换两点，diff 取反（正对 180° 除外）', () => {
		const c = { x: 3, y: -7 };
		for (let s = 0; s < 360; s += 9) {
			for (let e = 0; e < 360; e += 23) {
				const fwd = G.revolveRay(c, at(c, s), at(c, e)).diff;
				const bwd = G.revolveRay(c, at(c, e), at(c, s)).diff;
				// 正对时两条弧都是半圈，±π 等价，符号不要求互反
				if (near(Math.abs(fwd), Math.PI, 1e-6)) { continue; }
				assert.ok(near(fwd, -bwd),
					`${s}°→${e}°：正向 ${fwd}，反向 ${bwd}，应互为相反数`);
			}
		}
	});

});

describe('revolveRay 不再依赖 checkPointLineSide', () => {

	test('圆心在任意位置都给出正确结果', () => {
		// 原实现按象限分支，并用 checkPointLineSide 判定跨三象限的情形。
		// 那个函数遇水平线会除零，所以圆心与两点构成水平线时结果曾经不可靠。
		const centers = [
			{ x: 0, y: 0 }, { x: 37, y: -19 }, { x: -5, y: 5 }, { x: 100, y: 100 },
		];
		for (const c of centers) {
			for (let s = 0; s < 360; s += 15) {
				for (let e = 0; e < 360; e += 25) {
					const d = G.revolveRay(c, at(c, s), at(c, e)).diff;
					assert.ok(Number.isFinite(d),
						`圆心(${c.x},${c.y}) ${s}°→${e}°：diff=${d} 不是有限数`);
					assert.ok(Math.abs(d) <= Math.PI + 1e-9,
						`圆心(${c.x},${c.y}) ${s}°→${e}°：diff 超过半圈`);
				}
			}
		}
	});

	test('圆心与两点共线（水平）时也正常', () => {
		// 这是原实现最容易出错的输入：三点共线且水平
		const c = { x: 5, y: 0 };
		const r1 = G.revolveRay(c, { x: 0, y: 0 }, { x: 10, y: 0 });
		assert.ok(Number.isFinite(r1.diff));
		// 两点在圆心两侧，正好相差半圈
		assert.ok(near(Math.abs(r1.diff), Math.PI),
			`应为 ±π，实际 ${r1.diff}`);
	});

});
