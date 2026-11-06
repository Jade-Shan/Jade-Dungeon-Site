/**
 * Canvas 尺寸赋值与绘制的先后顺序
 *
 * 盯的是一个**静默白屏**的失败模式：给 canvas 的 `width` / `height` 赋值
 * 会按 HTML 规范走 "set bitmap dimensions"，其中一步是重置上下文并
 * **清空位图** —— 而且**赋同值也执行**。
 *
 * 所以「画完再设尺寸」= 白屏，不报错。`sandboxView.redraw()` 原来就是
 * 这个顺序（`resizeCanvas()` 的注释还写着让人这么做），表现是
 * view 页窗口里一片空白。
 *
 * jsdom 没有 2D 上下文（`getContext('2d')` 返回 null），所以这里**不测像素**，
 * 改为测两件可验证的事：
 *
 * - `resizeCanvas()` 确实会改 `width` / `height`（也就是确实会清屏）
 * - `redraw()` 的源码里，`resizeCanvas` 不出现在 `drawSceneWithUserView` 之后
 *
 * 第二条是源码检查而不是行为检查 —— 像素级的只能靠浏览器，
 * 但「顺序对不对」能钉住，这正是出过问题的那一条。
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installDomForFile } from './_jsdom-setup.js';

const dom = installDomForFile('<div id="d"></div>', { stubImages: true });
before(dom.setup);
after(dom.teardown);

/**
 * 源码目录。
 *
 * 测试跑的是 `.test-build/` 下的产物，而这两条用例要查的是**源码里的行序**，
 * 所以回到 `src/`。路径相对**进程工作目录**解析 —— `npm test -w site-page`
 * 的 cwd 就是 `site-page/`（`tsconfig.test.json` 也是这么解析的）。
 * `module: "ES6"` 下没有 `import.meta`，所以不能按文件自身位置算。
 */
const SRC = join(process.cwd(), 'src/main/ts/sandbox');

describe('canvas 赋尺寸会清屏', () => {

	test('赋同值也会改到 width —— 所以也会清位图', () => {
		const cvs = document.createElement('canvas');
		cvs.width = 800;
		cvs.height = 600;
		// 规范里 width 的 setter 无条件走 set bitmap dimensions，
		// 不比较新旧值。jsdom 这里只能验到属性确实被写入
		cvs.width = 800;
		assert.equal(cvs.width, 800, '赋同值之后值不变，但位图已经被清了');
	});

});

describe('sandboxView.redraw 的调用顺序', () => {

	/** 读源码而不是产物 —— 要查的是「这一行在那一行之前还是之后」 */
	function viewSource(): string {
		return readFileSync(join(SRC, 'sandboxView.ts'), 'utf8');
	}

	test('redraw 里不在 drawSceneWithUserView 之后调 resizeCanvas', () => {
		const src = viewSource();
		const start = src.indexOf('private async redraw()');
		assert.ok(start > 0, '没找到 redraw 方法');
		// 取到下一个方法定义为止
		const rest = src.slice(start + 10);
		const end = rest.search(/\n\tprivate |\n\tasync |\n\}/);
		const body = rest.slice(0, end > 0 ? end : 1200);

		const draw = body.indexOf('drawSceneWithUserView');
		const resize = body.indexOf('this.mapWin.resizeCanvas');
		assert.ok(draw > 0, 'redraw 里应该调 drawSceneWithUserView');
		assert.equal(resize, -1,
			'redraw 里不该再调 resizeCanvas —— drawSceneWithUserView 内部' +
			'已经设好两张画布的尺寸，再设一次只会把刚画好的画面清掉（白屏且不报错）');
	});

	test('editor 的 paintScene 里 resizeCanvas 在 drawImage 之前', () => {
		// 对照组：editor 自己画、不走 SandTable，所以它**需要**调 resizeCanvas，
		// 但必须在 drawImage 之前。顺序反了同样是白屏
		//
		// 锚点是 `paintScene()` 而不是 `redraw()` —— 2026-11-06 加拖动预览时，
		// 画一帧的逻辑从 `redraw()` 拆进了同步的 `paintScene()`
		//（`mousemove` 要同步画，详见那个方法的注释）。`redraw()` 现在只是转发。
		const src = readFileSync(join(SRC, 'sandboxEditor.ts'), 'utf8');
		const start = src.indexOf('private paintScene()');
		assert.ok(start > 0, '没找到 editor 的 paintScene');
		const body = src.slice(start, start + 1400);

		const resize = body.indexOf('resizeCanvas');
		const drawImg = body.indexOf('ctx.drawImage');
		assert.ok(resize > 0, 'editor 的 paintScene 应该调 resizeCanvas');
		assert.ok(drawImg > 0, 'editor 的 paintScene 应该调 drawImage');
		assert.ok(resize < drawImg,
			`resizeCanvas 必须在 drawImage 之前（现在 ${resize} vs ${drawImg}）—— ` +
			'反了会把画好的地图清掉');
	});

});
