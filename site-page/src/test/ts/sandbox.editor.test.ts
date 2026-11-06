/**
 * 编辑器「资源文件」标签页：点选资源 → 属性窗口联动
 *
 * 老界面有六个标签（五个 Token 分组 + 资源文件），迁移时漏了资源文件，
 * 补回后用户反馈「点了资源条目没反应」—— 原来只有 id 列绑了点击，
 * url 列点不动。这里把两条行为钉住：
 *
 * - **selectImage 会把资源的 id/url 渲染进属性窗口**
 * - **整行都可点**（不只 id 列），点了就联动选中
 *
 * 完整的窗口 / Canvas 渲染要真实布局和 `getContext('2d')`，jsdom 里
 * `getContext` 返回 null —— 所以这里不跑 `start()` 的完整初始化，
 * 只 mock 掉 `SandboxEditor` 依赖的窗口字段，直接调 `selectImage` /
 * `renderImageList`。`paintScene` 在 `getContext` 返回 null 时提前 return，
 * 所以 mock 一个真 canvas 就够，不会去 `requireMapImage`。
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installDomForFile } from './_jsdom-setup.js';
import { SandboxScene } from '../../main/ts/sandbox/sandboxScene.js';
import { SandboxEditor, SandboxEditorConfig } from '../../main/ts/sandbox/sandboxEditor.js';

const dom = installDomForFile('<div></div>', { stubImages: true });
before(dom.setup);
after(dom.teardown);

const cfg: SandboxEditorConfig = {
	apiRoot: '//localhost:8089',
	assetRoot: '//cdn.x/themes/trpg/images',
	desktopId: 'desktop',
	scene: { campaignId: 'c1', placeId: 'p1', sceneId: 's1' },
	username: 'gm',
	loginToken: 'tk',
};

/** 记录 renderFields 收到的字段，供断言「属性窗口加载了 id/url」 */
function mockPropsWin() {
	const captured: Array<Array<{ key: string, label: string, value: string }>> = [];
	return {
		renderFields(defs: Array<{ key: string, label: string, value: string }>) {
			captured.push(defs);
		},
		bindChange(_cb: () => void): void { /* 不触发 */ },
		fieldValue(_key: string): string { return ''; },
		clear(): void { /* clear 不记录字段，见各断言 */ },
		clipCanvas: document.createElement('canvas'),
		get lastDefs() { return captured[captured.length - 1] ?? []; },
	};
}

/** 构造一个预填好两张图片资源的编辑器，并 mock 掉窗口字段 */
function makeEditor(): { editor: SandboxEditor, props: ReturnType<typeof mockPropsWin> } {
	const editor = new SandboxEditor(cfg);
	// scene 是 `private readonly`，但运行时是普通属性，测试直接往实例上填数据
	const scene = (editor as unknown as { scene: SandboxScene }).scene;
	scene.putImage({ type: 'Image', id: 'map', url: '//cdn.x/map.jpg' });
	scene.putImage({ type: 'Image', id: 'icons', url: 'http://img.host/icons.jpg' });

	const props = mockPropsWin();
	const any = editor as any;
	any.propsWin = props;
	any.listWin = {
		listBody: document.createElement('tbody'),
		createBar: document.createElement('div'),
		groupBar: document.createElement('ul'),
	};
	any.mapWin = {
		finalCanvas: document.createElement('canvas'),
		setStatus(_t: string): void { /* 状态栏提示不在这里断言 */ },
	};
	any.sceneWin = { autoView: { checked: false } };
	return { editor, props };
}

describe('SandboxEditor 资源文件联动', () => {

	test('selectImage 把资源的 id/url 渲染进属性窗口', () => {
		const { editor, props } = makeEditor();
		(editor as any).selectImage('icons');

		const defs = props.lastDefs;
		assert.equal(defs.length, 2, '资源属性只有 id / url 两个字段');
		assert.deepEqual(defs.map((d: { key: string }) => d.key), ['id', 'url']);
		assert.equal(defs[0].value, 'icons');
		assert.equal(defs[1].value, 'http://img.host/icons.jpg');
	});

	test('选中不存在的资源不渲染（属性窗口保持原样）', () => {
		const { editor, props } = makeEditor();
		(editor as any).selectImage('ghost');

		assert.equal(props.lastDefs.length, 0, '没选中就不该渲染字段');
	});

	test('点击资源列表的 url 列（整行）也能联动选中', () => {
		const { editor, props } = makeEditor();
		const any = editor as any;
		any.currTab = 'images';
		any.renderImageList();

		// 点 icons 那一行的 url 列 —— 修复前只有 id 列绑了点击，点这里没反应
		const rows = Array.from(any.listWin.listBody.querySelectorAll('tr')) as HTMLTableRowElement[];
		const iconsRow = rows.find((r) => r.textContent!.includes('icons'))!;
		assert.ok(iconsRow, '列表里要有 icons 这一行');

		// 第二列是 url 列，dispatch 一个 click，冒泡到整行 tr
		iconsRow.children[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));

		const defs = props.lastDefs;
		assert.equal(defs.length, 2, '点 url 列也要触发选中');
		assert.equal(defs[0].value, 'icons');
		assert.equal(defs[1].value, 'http://img.host/icons.jpg');
	});

	test('点删除按钮不冒泡触发整行选中（stopPropagation 拦住）', () => {
		const { editor, props } = makeEditor();
		const any = editor as any;
		// 屏蔽真实删除，聚焦「点击删除按钮本身会不会误触整行选中」
		any.deleteImage = () => { /* no-op */ };
		any.currTab = 'images';
		any.renderImageList();

		const rows = Array.from(any.listWin.listBody.querySelectorAll('tr')) as HTMLTableRowElement[];
		const iconsRow = rows.find((r) => r.textContent!.includes('icons'))!;
		const delBtn = iconsRow.children[2].querySelector('button')!;
		delBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		assert.equal(props.lastDefs.length, 0, '删除按钮的点击不该冒泡成整行选中');
	});

	test('删除选中的资源会清空选中态', async () => {
		const { editor, props } = makeEditor();
		const any = editor as any;
		(editor as any).selectImage('icons');
		assert.equal(props.lastDefs.length, 2, '先选中，属性窗口有内容');

		await any.deleteImage('icons');

		assert.equal(any.selectedImage, undefined, '删掉选中的资源后 selectedImage 要清空');
	});

	test('选中资源会把其图片画进预览画布（和 Token 同一块 canvas）', () => {
		const { editor, props } = makeEditor();
		const any = editor as any;
		// 模拟 loadFrom 加载完的状态：icons 的 imgElem 已带上尺寸
		const img = { width: 120, height: 60 };
		any.scene.images.get('icons').imgElem = img;

		// 换成能记录 drawImage 的假画布（jsdom 的 canvas 没有 2d 上下文）
		const drawn: Array<unknown> = [];
		const fakeCanvas = {
			width: 0, height: 0,
			getContext() {
				return {
					clearRect() { /* no-op */ },
					drawImage(pic: unknown) { drawn.push(pic); },
				};
			},
		};
		(props as any).clipCanvas = fakeCanvas;

		(editor as any).selectImage('icons');

		assert.equal(drawn.length, 1, '选中资源要画一次整图');
		assert.equal(drawn[0], img, '画的是选中的那张图');
		assert.equal(fakeCanvas.width, 120, '画布尺寸要跟着图走');
		assert.equal(fakeCanvas.height, 60);
	});

});
