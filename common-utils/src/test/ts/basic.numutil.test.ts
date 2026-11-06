/**
 * NumUtil 的单元测试
 *
 * 期望值大部分取自 `testJadeUtils.ts` 里原有的手动测试断言 ——
 * 那些值是人工核对过的，可以直接当基线用。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NumUtil } from '../../main/ts/basic.js';

describe('NumUtil.toFixed', () => {

	test('正数按位数四舍五入', () => {
		assert.equal(NumUtil.toFixed(1.1234567, 0), 1);
		assert.equal(NumUtil.toFixed(1.1234567, 1), 1.1);
		assert.equal(NumUtil.toFixed(1.1234567, 2), 1.12);
		assert.equal(NumUtil.toFixed(1.1234567, 3), 1.123);
		assert.equal(NumUtil.toFixed(1.1234567, 4), 1.1235);
		assert.equal(NumUtil.toFixed(1.1234567, 5), 1.12346);
		assert.equal(NumUtil.toFixed(1.1234567, 6), 1.123457);
	});

	test('位数超过实际小数位时原值返回', () => {
		assert.equal(NumUtil.toFixed(1.1234567, 7), 1.1234567);
		assert.equal(NumUtil.toFixed(1.1234567, 8), 1.1234567);
	});

	test('负位数向整数位取整', () => {
		assert.equal(NumUtil.toFixed(1234567.1, -1), 1234570);
		assert.equal(NumUtil.toFixed(1234567.1, -2), 1234600);
		assert.equal(NumUtil.toFixed(1234567.1, -3), 1235000);
		assert.equal(NumUtil.toFixed(1234567.1, -4), 1230000);
		assert.equal(NumUtil.toFixed(1234567.1, -5), 1200000);
		assert.equal(NumUtil.toFixed(1234567.1, -6), 1000000);
		assert.equal(NumUtil.toFixed(1234567.1, -7), 0);
	});

	test('负数保持符号，按绝对值取整', () => {
		assert.equal(NumUtil.toFixed(-1.1234567, 0), -1);
		assert.equal(NumUtil.toFixed(-1.1234567, 2), -1.12);
		assert.equal(NumUtil.toFixed(-1.1234567, 4), -1.1235);
		assert.equal(NumUtil.toFixed(-1234567.1, -3), -1235000);
	});

	test('0 与整数', () => {
		assert.equal(NumUtil.toFixed(0, 2), 0);
		assert.equal(NumUtil.toFixed(5, 2), 5);
		assert.equal(NumUtil.toFixed(5, 0), 5);
	});

});

describe('NumUtil.unformat', () => {

	test('去掉千分位分隔符', () => {
		assert.equal(NumUtil.unformat('123,456'), 123456);
	});

	test('小数部分的分隔符也会被去掉', () => {
		// format() 会把小数部分也按 3 位分组，unformat() 要能还原
		assert.equal(NumUtil.unformat('123,456.123,456'), 123456.123456);
		assert.equal(NumUtil.unformat('-123,456.123,456'), -123456.123456);
	});

	test('非数字字符一律剔除', () => {
		// 连字符出现在中间时也会被保留下来，结果未必符合直觉，
		// 这里记录当前行为而不是「应该的」行为
		assert.equal(NumUtil.unformat('123-456.123,456'), 123);
	});

	test('无小数点时走 parseInt', () => {
		assert.equal(NumUtil.unformat('1,000'), 1000);
		assert.equal(NumUtil.unformat('¥ 42'), 42);
	});

});
