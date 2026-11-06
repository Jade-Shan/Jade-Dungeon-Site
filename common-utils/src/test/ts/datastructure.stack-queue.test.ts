/**
 * SimpleStack / SimpleQueue 的单元测试
 *
 * 两者的 API 几乎一样，差别只在 pop() 从哪头取 —— 这正是最该测的地方。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SimpleStack, SimpleQueue } from '../../main/ts/dataStructure.js';

describe('SimpleStack 后进先出', () => {

	test('空栈', () => {
		const s = new SimpleStack<number>();
		assert.equal(s.size(), 0);
		assert.equal(s.isEmpty(), true);
		assert.equal(s.pop(), null, '空栈 pop 应返回 null 而不是抛错');
		assert.equal(s.getTop(), null);
	});

	test('pop 从尾部取（LIFO）', () => {
		const s = new SimpleStack<number>([1, 2, 3]);
		assert.equal(s.pop(), 3);
		assert.equal(s.pop(), 2);
		assert.equal(s.pop(), 1);
		assert.equal(s.isEmpty(), true);
	});

	test('getTop 只看不取', () => {
		const s = new SimpleStack<number>([1, 2, 3]);
		assert.equal(s.getTop(), 3);
		assert.equal(s.size(), 3, 'getTop 不应改变长度');
	});

	test('push 支持一次放多个', () => {
		const s = new SimpleStack<number>();
		s.push(1, 2, 3);
		assert.equal(s.size(), 3);
		assert.equal(s.pop(), 3, '多参数 push 后最后一个在栈顶');
	});

	test('removeAll 清空', () => {
		const s = new SimpleStack<number>([1, 2]);
		s.removeAll();
		assert.equal(s.isEmpty(), true);
	});

	test('push / pop 交替', () => {
		const s = new SimpleStack<number>();
		s.push(1);
		s.push(2);
		assert.equal(s.pop(), 2);
		s.push(3);
		assert.equal(s.pop(), 3);
		assert.equal(s.pop(), 1);
		assert.equal(s.pop(), null);
	});

});

describe('SimpleQueue 先进先出', () => {

	test('空队列', () => {
		const q = new SimpleQueue<number>();
		assert.equal(q.size(), 0);
		assert.equal(q.isEmpty(), true);
		assert.equal(q.pop(), null);
		assert.equal(q.getHead(), null);
		assert.equal(q.getTail(), null);
	});

	test('pop 从头部取（FIFO）—— 与 Stack 的关键差别', () => {
		const q = new SimpleQueue<number>([1, 2, 3]);
		assert.equal(q.pop(), 1);
		assert.equal(q.pop(), 2);
		assert.equal(q.pop(), 3);
		assert.equal(q.isEmpty(), true);
	});

	test('getHead / getTail 只看不取', () => {
		const q = new SimpleQueue<number>([1, 2, 3]);
		assert.equal(q.getHead(), 1);
		assert.equal(q.getTail(), 3);
		assert.equal(q.size(), 3);
	});

	test('单元素时 head 与 tail 相同', () => {
		const q = new SimpleQueue<number>([7]);
		assert.equal(q.getHead(), 7);
		assert.equal(q.getTail(), 7);
	});

	test('push 追加到尾部', () => {
		const q = new SimpleQueue<number>([1]);
		q.push(2, 3);
		assert.equal(q.getTail(), 3);
		assert.equal(q.pop(), 1, 'push 不应影响出队顺序');
	});

	test('removeAll 清空', () => {
		const q = new SimpleQueue<number>([1, 2]);
		q.removeAll();
		assert.equal(q.isEmpty(), true);
	});

});

describe('Stack 与 Queue 的行为对比', () => {

	test('同样的输入，pop 出来的顺序正好相反', () => {
		const input = [1, 2, 3, 4];
		const s = new SimpleStack<number>([...input]);
		const q = new SimpleQueue<number>([...input]);

		const fromStack: Array<number> = [];
		const fromQueue: Array<number> = [];
		for (let i = 0; i < input.length; i++) {
			const sv = s.pop();
			const qv = q.pop();
			if (sv !== null) { fromStack.push(sv); }
			if (qv !== null) { fromQueue.push(qv); }
		}

		assert.deepEqual(fromQueue, [1, 2, 3, 4]);
		assert.deepEqual(fromStack, [4, 3, 2, 1]);
		assert.deepEqual(fromStack, [...fromQueue].reverse());
	});

});
