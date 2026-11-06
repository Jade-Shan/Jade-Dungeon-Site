/**
 * 属性窗口的单选字段（「可见」「遮挡」）渲染与读写
 *
 * 这两个字段带 `options`，原来渲染成 `<select>` 下拉框，2026-11-06 改成
 * 98.css 的 OptionButton（radio）。这里钉住几条行为：
 *
 * - options 字段渲染成 radio，不再有 select
 * - `fieldValue` / `setFieldValue` / `bindChange` 都认得 radio 组
 *
 * `renderFields` 只拼 DOM，不碰 `getContext('2d')` 也不碰 desktop，
 * 所以能在 jsdom 里直接实例化 `SandboxPropsWindow`（desktop 传占位对象）。
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installDomForFile } from './_jsdom-setup.js';
import { SandboxPropsWindow } from '../../main/ts/sandbox/sandboxWindows.js';

const dom = installDomForFile('<div></div>');
before(dom.setup);
after(dom.teardown);

/** 两个带 options 的典型字段：可见 + 遮挡（都要 `widget: 'radio'`） */
function booleanFields(): Array<{
	key: string, label: string, value: string, options: Array<[string, string]>, widget?: 'radio',
}> {
	return [
		{ key: 'visible', label: '可见', value: 'true', options: [['true', '可见'], ['false', '隐形']], widget: 'radio' },
		{ key: 'blockView', label: '遮挡', value: 'false', options: [['true', '遮挡视线'], ['false', '后方可见']], widget: 'radio' },
	];
}

function makeWin(): SandboxPropsWindow {
	// renderFields 不碰 desktop，传占位对象即可
	return new SandboxPropsWindow({} as never, 'props', '属性');
}

describe('SandboxPropsWindow 单选字段（可见/遮挡）', () => {

	test('options 字段渲染成 98.css 的 radio，不再是 select', () => {
		const win = makeWin();
		win.renderFields(booleanFields());

		const radios = win.form.querySelectorAll('input[type=radio]');
		const selects = win.form.querySelectorAll('select');
		assert.equal(radios.length, 4, '可见 + 遮挡各两个选项');
		assert.equal(selects.length, 0, '不该再有下拉框');

		// 两个字段的 radio 各自共享 name，互不干扰
		assert.equal(win.form.querySelectorAll('input[name=visible]').length, 2);
		assert.equal(win.form.querySelectorAll('input[name=blockView]').length, 2);
	});

	test('radio 后面紧跟 label（98.css 靠相邻选择器画圆点）', () => {
		const win = makeWin();
		win.renderFields(booleanFields());
		// 每个 radio 的 nextElementSibling 都应是 label，且 htmlFor 指回 radio
		for (const radio of Array.from(win.form.querySelectorAll('input[type=radio]'))) {
			const lbl = radio.nextElementSibling;
			assert.ok(lbl && lbl.tagName === 'LABEL',
				'radio 后必须紧跟 label，否则 98.css 的圆点画不出来');
			assert.equal((lbl as HTMLLabelElement).htmlFor, radio.id, 'label 要 for 指回 radio');
		}
	});

	test('fieldValue 读的是选中的 radio', () => {
		const win = makeWin();
		win.renderFields(booleanFields());
		assert.equal(win.fieldValue('visible'), 'true', '初始选中 true');
		assert.equal(win.fieldValue('blockView'), 'false', '初始选中 false');
	});

	test('setFieldValue 切换选中项', () => {
		const win = makeWin();
		win.renderFields(booleanFields());
		win.setFieldValue('visible', 'false');
		assert.equal(win.fieldValue('visible'), 'false');
		win.setFieldValue('blockView', 'true');
		assert.equal(win.fieldValue('blockView'), 'true');
	});

	test('bindChange 给每个 radio 都绑 change', () => {
		const win = makeWin();
		win.renderFields(booleanFields());
		let calls = 0;
		win.bindChange(() => { calls++; });

		const invisible = win.form
			.querySelector('input[name=visible][value=false]') as HTMLInputElement;
		invisible.checked = true;
		invisible.dispatchEvent(new Event('change'));

		assert.equal(calls, 1, '切换 radio 要触发 change 回调');
	});

	test('不带 widget 的 options 字段仍是下拉框（如「图片」）', () => {
		const win = makeWin();
		win.renderFields([{
			key: 'imgKey', label: '图片', value: 'icons',
			options: [['map', 'map'], ['icons', 'icons']] as Array<[string, string]>,
		}]);

		assert.equal(win.form.querySelectorAll('select').length, 1, '「图片」要恢复成下拉框');
		assert.equal(win.form.querySelectorAll('input[type=radio]').length, 0, '不带 widget 就不该出 radio');
		assert.equal(win.fieldValue('imgKey'), 'icons', '下拉框照常读值');
	});

});
