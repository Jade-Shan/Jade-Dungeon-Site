/**
 * StrUtil 的单元测试
 *
 * `escapeHtml` 是这里最要紧的一个 —— blog 层渲染文章时靠它防 XSS，
 * 所以单独多测几个字符。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { StrUtil } from '../../main/ts/basic.js';

describe('StrUtil.trim', () => {

	test('去掉首尾空白，保留中间', () => {
		assert.equal(StrUtil.trim('  a b  '), 'a b');
	});

	test('全空白与空串', () => {
		assert.equal(StrUtil.trim('   '), '');
		assert.equal(StrUtil.trim(''), '');
	});

});

describe('StrUtil.escapeHtml', () => {

	test('转义 script 标签', () => {
		assert.equal(
			StrUtil.escapeHtml('<script>alert(1)</script>'),
			'&lt;script&gt;alert(1)&lt;/script&gt;');
	});

	test('五个基本字符都转义', () => {
		assert.equal(StrUtil.escapeHtml('<'), '&lt;');
		assert.equal(StrUtil.escapeHtml('>'), '&gt;');
		assert.equal(StrUtil.escapeHtml('&'), '&amp;');
		assert.equal(StrUtil.escapeHtml('"'), '&quot;');
		assert.equal(StrUtil.escapeHtml("'"), '&#39;');
	});

	test('& 不会被二次转义成 &amp;amp;', () => {
		// 如果实现里 & 的替换放在最后，就会出现双重转义
		assert.equal(StrUtil.escapeHtml('a&b'), 'a&amp;b');
		assert.equal(StrUtil.escapeHtml('&lt;'), '&amp;lt;');
	});

	test('混合内容', () => {
		assert.equal(
			StrUtil.escapeHtml('he said "hi" & it\'s'),
			'he said &quot;hi&quot; &amp; it&#39;s');
	});

	test('无需转义的内容原样返回', () => {
		assert.equal(StrUtil.escapeHtml('abc 123 中文'), 'abc 123 中文');
		assert.equal(StrUtil.escapeHtml(''), '');
	});

	test('属性注入场景：引号必须被转义', () => {
		// 渲染 <img alt="${escapeHtml(x)}"> 时，x 里的引号若不转义就能逃出属性
		const evil = '" onerror="alert(1)';
		const escaped = StrUtil.escapeHtml(evil);
		assert.ok(!escaped.includes('"'), `转义后不应再有裸引号：${escaped}`);
	});

});

describe('StrUtil 补位', () => {

	test('leftPad 在左侧补到指定长度', () => {
		assert.equal(StrUtil.leftPad('5', 3, '0'), '005');
	});

	test('rightPad 在右侧补', () => {
		assert.equal(StrUtil.rightPad('5', 3, '0'), '500');
	});

	test('默认用空格补', () => {
		assert.equal(StrUtil.leftPad('5', 3), '  5');
		assert.equal(StrUtil.rightPad('5', 3), '5  ');
	});

	test('已超过目标长度时原样返回，不截断', () => {
		assert.equal(StrUtil.leftPad('12345', 3, '0'), '12345');
		assert.equal(StrUtil.rightPad('12345', 3, '0'), '12345');
	});

	test('长度刚好时不补', () => {
		assert.equal(StrUtil.leftPad('123', 3, '0'), '123');
	});

});

describe('StrUtil.format 与 replaceByRegex', () => {

	test('format 按名字替换占位符', () => {
		assert.equal(
			StrUtil.format('Hi {name}, you are {age}', { name: 'Jade', age: 3 }),
			'Hi Jade, you are 3');
	});

	test('format 数字参数会转成字符串', () => {
		assert.equal(StrUtil.format('{n}', { n: 42 }), '42');
	});

	test('replaceByRegex 全局替换', () => {
		assert.equal(StrUtil.replaceByRegex('a1b2c3', '[0-9]', '#'), 'a#b#c#');
	});

	test('replaceByRegex 无匹配时原样返回', () => {
		assert.equal(StrUtil.replaceByRegex('abc', '[0-9]', '#'), 'abc');
	});

});
