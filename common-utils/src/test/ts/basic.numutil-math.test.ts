/**
 * NumUtil 的四则精确运算
 *
 * 这几个方法存在的理由就是绕开浮点误差，所以每条断言都对照原生运算写，
 * 让「为什么需要这个方法」在测试里看得见。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NumUtil } from '../../main/ts/basic.js';

describe('NumUtil 精确四则运算', () => {

	test('add 修正浮点误差', () => {
		// 原生 0.1 + 0.2 === 0.30000000000000004
		assert.notEqual(0.1 + 0.2, 0.3);
		assert.equal(NumUtil.add(0.1, 0.2), 0.3);
	});

	test('sub 修正浮点误差', () => {
		assert.notEqual(0.3 - 0.1, 0.2);
		assert.equal(NumUtil.sub(0.3, 0.1), 0.2);
	});

	test('mul 修正浮点误差', () => {
		// 原生 1.005 * 100 === 100.49999999999999
		assert.notEqual(1.005 * 100, 100.5);
		assert.equal(NumUtil.mul(1.005, 100), 100.5);
		assert.equal(NumUtil.mul(0.1, 0.2), 0.02);
	});

	test('div 修正浮点误差', () => {
		assert.equal(NumUtil.div(0.3, 0.1), 3);
		assert.equal(NumUtil.div(1, 4), 0.25);
	});

	test('整数运算不受影响', () => {
		assert.equal(NumUtil.add(1, 2), 3);
		assert.equal(NumUtil.sub(5, 3), 2);
		assert.equal(NumUtil.mul(3, 4), 12);
		assert.equal(NumUtil.div(12, 4), 3);
	});

	test('负数', () => {
		assert.equal(NumUtil.add(-0.1, -0.2), -0.3);
		assert.equal(NumUtil.sub(-0.3, -0.1), -0.2);
		assert.equal(NumUtil.mul(-0.1, 0.2), -0.02);
	});

	test('除零返回 Infinity 而不是抛错', () => {
		// 这是 div() 里显式写的分支，不是 JS 的默认行为
		assert.equal(NumUtil.div(1, 0), Infinity);
		assert.equal(NumUtil.div(-1, 0), -Infinity);
		// 注意 0/0 也返回 Infinity（因为判定走的是 n1 >= 0），而非 NaN
		assert.equal(NumUtil.div(0, 0), Infinity);
	});

});

describe('NumUtil 曲线函数', () => {

	test('baseCurve 在 [0,1] 外返回 0', () => {
		assert.equal(NumUtil.baseCurve(-0.1), 0);
		assert.equal(NumUtil.baseCurve(1.1), 0);
	});

	test('baseCurve 在区间内为正弦半波', () => {
		assert.equal(NumUtil.baseCurve(0), 0);
		// 半波峰值在 x=0.5 处
		const peak = NumUtil.baseCurve(0.5);
		assert.ok(peak > NumUtil.baseCurve(0.25), 'x=0.5 应高于 x=0.25');
		assert.ok(peak > NumUtil.baseCurve(0.75), 'x=0.5 应高于 x=0.75');
	});

	test('createCurve 返回的函数在给定区间内取值有界', () => {
		const curve = NumUtil.createCurve(100, 50, 10, 20);
		assert.equal(typeof curve, 'function');
		for (const x of [0, 25, 50, 75, 100]) {
			const y = curve(x);
			assert.ok(Number.isFinite(y), `curve(${x}) 应为有限数，实际 ${y}`);
		}
	});

});
