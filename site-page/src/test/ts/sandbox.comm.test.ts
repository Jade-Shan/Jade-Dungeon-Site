/**
 * `components/comm.ts` 的 InputField 一族：构造时应用 cfg、类型、事件绑定
 *
 * 这里盯的是一条真实的运行时回归：`InputField` 的基类构造函数曾在
 * `super()` 里直接调 `UIComponent.initElemt(this.getElem(), cfg)`，
 * 而 `getElem()` 是抽象方法、返回子类字段（`input` / `textArea` …），
 * 子类字段初始化器要等 `super()` 返回后才执行 —— 于是基类构造函数
 * 执行时 `this.getElem()` 是 `undefined`，去点 `classList` 抛
 * "can't access property classList, elem is undefined"。
 *
 * 修复是把初始化下沉到各子类构造函数里，字段就绪后再调。这几个用例
 * 只要 `new` 不抛、cfg 都生效，就说明那条链路是好的。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withDom } from './_jsdom-setup.js';
import {
	UICheckBox, UINumberInput, UIRadioIpt, UISelectList, UITextArea, UITextIpt,
} from '../../main/ts/sandbox/components/comm.js';

const CLS = ['a', 'b'];

test('InputField 各子类构造不抛错，且应用 id / classList', () => {
	withDom('<div></div>', () => {
		const makers = [
			new UITextIpt({ id: 't1', classList: CLS, placeholder: 'p' }),
			new UITextArea({ id: 't2', classList: CLS, rows: 10 }),
			new UICheckBox({ id: 't3', classList: CLS, label: '' }),
			new UINumberInput({ id: 't4', classList: CLS }),
			new UISelectList({ id: 't5', classList: CLS, items: [] }),
			new UIRadioIpt({ id: 't6', classList: CLS, label: '', value: '' }),
		];
		for (let i = 0; i < makers.length; i++) {
			// cfg 的 id / classList 应用在**字段元素**上（`getField()`）；
			// checkbox 的 `getElem()` 是「input + label」的包裹 div，没有 id。
			const el = makers[i].getField();
			assert.equal(el.id, `t${i + 1}`, `第 ${i + 1} 个控件的 id`);
			assert.ok(el.classList.contains('a') && el.classList.contains('b'),
				`第 ${i + 1} 个控件的 classList 要应用上`);
		}
	});
});

test('各子类 input 的 type 正确', () => {
	withDom('<div></div>', () => {
		// `getField()` 才是真正的 input；`getElem()` 对 checkbox 这类是
		// 「input + label」的包裹 div，没有 `.type`。
		assert.equal(new UITextIpt({}).getField().type, 'text');
		assert.equal(new UITextIpt({ needMask: true }).getField().type, 'password');
		assert.equal(new UICheckBox({ label: '' }).getField().type, 'checkbox');
		assert.equal(new UINumberInput({}).getField().type, 'number');
		assert.equal(new UIRadioIpt({ label: '', value: '' }).getField().type, 'radio');
	});
});

test('mouseClick / keyDown 事件绑定生效', () => {
	withDom('<div></div>', (dom) => {
		let clicked = 0;
		let pressed = 0;
		const ipt = new UITextIpt({
			events: {
				mouseClick: () => { clicked++; },
				keyDown: () => { pressed++; },
			},
		});
		const el = ipt.getElem();
		// KeyboardEvent 不在 `withDom` 装配的全局里（Node 的 globalThis 没有），
		// 得从 jsdom 的 window 上取构造器。
		el.dispatchEvent(new dom.window.MouseEvent('click'));
		el.dispatchEvent(new dom.window.KeyboardEvent('keydown'));
		assert.equal(clicked, 1);
		assert.equal(pressed, 1);
	});
});

test('fieldName → data-field、placeholder / readonly / rows 落到元素上', () => {
	withDom('<div></div>', () => {
		const ipt = new UITextIpt({ fieldName: 'placeName', placeholder: '请输入' });
		assert.equal(ipt.getElem().dataset.field, 'placeName');
		assert.equal(ipt.getElem().placeholder, '请输入');

		const area = new UITextArea({ fieldName: 'detailInfo', readonly: true, rows: 8 });
		assert.equal(area.getElem().dataset.field, 'detailInfo');
		assert.equal(area.getElem().readOnly, true);
		assert.equal(area.getElem().rows, 8);
	});
});
