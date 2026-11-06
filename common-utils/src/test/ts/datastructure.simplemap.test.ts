/**
 * SimpleMap 的单元测试
 *
 * 它存在的理由是「保留插入顺序」，所以顺序相关的行为测得最细。
 * 原生 Map 其实也保序，但本类还额外提供了按下标取元素的能力。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SimpleMap } from '../../main/ts/dataStructure.js';

describe('SimpleMap 构造与基本查询', () => {

	test('空构造', () => {
		const m = new SimpleMap<string, number>();
		assert.equal(m.size(), 0);
		assert.equal(m.isEmpty(), true);
		assert.deepEqual(m.keys(), []);
		assert.deepEqual(m.values(), []);
	});

	test('从数组构造并保留给定顺序', () => {
		const m = new SimpleMap<string, number>([['b', 2], ['a', 1], ['c', 3]]);
		assert.equal(m.size(), 3);
		assert.equal(m.isEmpty(), false);
		// 不是 ['a','b','c'] —— 按插入顺序而非字典序
		assert.deepEqual(m.keys(), ['b', 'a', 'c']);
		assert.deepEqual(m.values(), [2, 1, 3]);
	});

	test('get 取值，不存在的键返回 null', () => {
		const m = new SimpleMap<string, number>([['a', 1]]);
		assert.equal(m.get('a'), 1);
		assert.equal(m.get('zz'), null);
	});

	test('containsKey / containsValue', () => {
		const m = new SimpleMap<string, number>([['a', 1]]);
		assert.equal(m.containsKey('a'), true);
		assert.equal(m.containsKey('b'), false);
		assert.equal(m.containsValue(1), true);
		assert.equal(m.containsValue(99), false);
	});

});

describe('SimpleMap.put 的覆盖语义', () => {

	test('新键追加到末尾', () => {
		const m = new SimpleMap<string, number>([['a', 1]]);
		m.put('b', 2);
		assert.deepEqual(m.keys(), ['a', 'b']);
		assert.equal(m.size(), 2);
	});

	test('已有键只改值，不移动位置、不增加长度', () => {
		const m = new SimpleMap<string, number>([['b', 2], ['a', 1], ['c', 3]]);
		m.put('b', 22);
		assert.equal(m.size(), 3, 'size 不应变化');
		assert.deepEqual(m.keys(), ['b', 'a', 'c'], '位置不应改变');
		assert.equal(m.get('b'), 22);
	});

});

describe('SimpleMap.remove', () => {

	test('删掉中间的键，其余顺序不变', () => {
		const m = new SimpleMap<string, number>([['a', 1], ['b', 2], ['c', 3]]);
		m.remove('b');
		assert.deepEqual(m.keys(), ['a', 'c']);
		assert.equal(m.size(), 2);
		assert.equal(m.get('b'), null);
	});

	test('删不存在的键是安全的空操作', () => {
		const m = new SimpleMap<string, number>([['a', 1]]);
		m.remove('zz');
		assert.equal(m.size(), 1);
	});

	test('removeAll 清空', () => {
		const m = new SimpleMap<string, number>([['a', 1], ['b', 2]]);
		m.removeAll();
		assert.equal(m.size(), 0);
		assert.equal(m.isEmpty(), true);
	});

});

describe('SimpleMap.getElementByIndex', () => {

	test('按下标取出键值对', () => {
		const m = new SimpleMap<string, number>([['b', 2], ['a', 1]]);
		assert.deepEqual(m.getElementByIndex(0), ['b', 2]);
		assert.deepEqual(m.getElementByIndex(1), ['a', 1]);
	});

	test('越界返回 null 而不是抛错', () => {
		const m = new SimpleMap<string, number>([['a', 1]]);
		assert.equal(m.getElementByIndex(99), null);
		assert.equal(m.getElementByIndex(-1), null);
	});

	test('遍历用法：配合 size() 走完一圈', () => {
		// web.ts 的 doHttp() 就是这样遍历 headers 的
		const m = new SimpleMap<string, string>([['A', '1'], ['B', '2']]);
		const seen: Array<string> = [];
		for (let i = 0; i < m.size(); i++) {
			const kv = m.getElementByIndex(i);
			if (kv) { seen.push(`${kv[0]}=${kv[1]}`); }
		}
		assert.deepEqual(seen, ['A=1', 'B=2']);
	});

});
