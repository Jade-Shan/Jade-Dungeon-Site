/**
 * 拖动预览：Ctrl 移动、Alt 缩放
 *
 * 这是从老应用（`old-sandbox-page`）搬过来的交互 —— 老代码里是三个 Token 类
 * 各自的 `onWantMoveing()` / `onMoveing()` / `onScaleing()`，六份实现、
 * 颜色和线宽还不一致。新版收成 `drawPreviewGhost()` +
 * `drawMovePreview()` / `drawScalePreview()`。
 *
 * 要盯住的三件事：
 *
 * - **预览的几何必须等于提交的几何** —— 预览走 `moveTo()` / `scaleTo()`，
 *   和松手时真正改 Token 的是同一个方法。老代码是预览与提交各算一遍公式，
 *   改一边忘另一边就会「看到的位置」和「落下的位置」不一样，而且不报错
 * - **预览不能改原 Token** —— 拖动过程里每帧都画一次，改了的话位移会累加
 * - **幽灵不认 `visible`** —— 墙壁几乎都是隐形的，编辑器里必须能预览
 *
 * jsdom 没有 2D 上下文（`getContext('2d')` 返回 null），所以这里用一个
 * **记录调用的假上下文**，断言「画了什么形状、在哪、什么颜色」，
 * 不断言像素。像素只能靠浏览器手工验（见 `docs/sandbox-refactor.md` 的验收表）。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	CircleToken, RectangleToken, LineToken, IToken2D,
} from '../../main/ts/trpg/sandtable.js';

/** 一次绘制调用，连同调用时的样式状态 */
interface Call {
	/** 方法名 */
	op: string;
	/** 参数 */
	args: Array<number>;
	/** 调用时的 `fillStyle` */
	fill: string;
	/** 调用时的 `strokeStyle` */
	stroke: string;
	/** 调用时的 `lineWidth` */
	width: number;
}

/**
 * 记录调用的假 2D 上下文
 *
 * 只实现预览用到的那几个方法。样式属性是真的字段 —— 赋值之后下一次
 * `fill()` / `stroke()` 记下来的就是赋过的值，这样才能断言「这条线是红的」。
 */
class FakeCtx {

	readonly calls: Array<Call> = [];
	fillStyle = '';
	strokeStyle = '';
	lineWidth = 0;

	private rec(op: string, ...args: Array<number>): void {
		this.calls.push({
			op, args, fill: this.fillStyle,
			stroke: this.strokeStyle, width: this.lineWidth,
		});
	}

	save(): void { this.rec('save'); }
	restore(): void { this.rec('restore'); }
	beginPath(): void { this.rec('beginPath'); }
	closePath(): void { this.rec('closePath'); }
	moveTo(x: number, y: number): void { this.rec('moveTo', x, y); }
	lineTo(x: number, y: number): void { this.rec('lineTo', x, y); }
	stroke(): void { this.rec('stroke'); }
	fill(): void { this.rec('fill'); }
	clip(): void { this.rec('clip'); }
	setLineDash(_d: Array<number>): void { this.rec('setLineDash'); }
	arc(x: number, y: number, r: number, _s: number, _e: number, _c?: boolean): void {
		this.rec('arc', x, y, r);
	}
	fillRect(x: number, y: number, w: number, h: number): void {
		this.rec('fillRect', x, y, w, h);
	}
	strokeRect(x: number, y: number, w: number, h: number): void {
		this.rec('strokeRect', x, y, w, h);
	}
	drawImage(): void { this.rec('drawImage'); }

	/** 取某个方法的全部调用 */
	of(op: string): Array<Call> { return this.calls.filter(c => c.op === op); }

	/** 当成真上下文传给被测方法 */
	asCtx(): CanvasRenderingContext2D {
		return this as unknown as CanvasRenderingContext2D;
	}

}

/** 一个最小的图片裁剪 */
const clip = () => ({ imgKey: 'icons', sx: 0, sy: 0, width: 50, height: 50 });

const circle = () => new CircleToken('c1', 100, 100, 25, 0, '#000', '#000',
	true, true, '#0000FF', clip());
const rect = () => new RectangleToken('r1', 100, 200, 40, 20, 0, '#000', '#000',
	true, true, '#0000FF', clip());
const line = () => new LineToken('l1', 10, 20, 110, 20, 6, '', '#00FF00',
	false, true);

/** 预览里那条「原位置 → 目标位置」的连线颜色 */
const LINK_COLOR = 'rgba(255, 0, 0, 0.7)';
/** 幽灵的填充色 */
const GHOST_FILL = 'rgba(0, 0, 255, 0.7)';
/** 幽灵的描边色 */
const GHOST_STROKE = 'rgba(0, 255, 0, 0.7)';

describe('移动预览画「连线 + 目标位置的幽灵」', () => {

	test('圆形：幽灵落在中心加位移处，半径不变', () => {
		const ctx = new FakeCtx();
		circle().drawMovePreview(ctx.asCtx(), 30, -40);
		const arcs = ctx.of('arc');
		assert.equal(arcs.length, 1, '幽灵只画一个圆');
		assert.deepEqual(arcs[0].args, [130, 60, 25]);
	});

	test('圆形：连线是从原中心到目标中心的红线', () => {
		const ctx = new FakeCtx();
		circle().drawMovePreview(ctx.asCtx(), 30, -40);
		const from = ctx.of('moveTo')[0];
		const to = ctx.of('lineTo')[0];
		assert.deepEqual(from.args, [100, 100], '从原中心出发');
		assert.deepEqual(to.args, [130, 60], '连到目标中心');
		assert.equal(to.stroke, LINK_COLOR, '连线是红的');
	});

	test('矩形：幽灵落在左上角加位移处，宽高不变', () => {
		const ctx = new FakeCtx();
		rect().drawMovePreview(ctx.asCtx(), 10, 10);
		assert.deepEqual(ctx.of('fillRect')[0].args, [110, 210, 40, 20]);
		assert.deepEqual(ctx.of('strokeRect')[0].args, [110, 210, 40, 20]);
	});

	test('矩形：连线连的是中心，不是左上角', () => {
		const ctx = new FakeCtx();
		rect().drawMovePreview(ctx.asCtx(), 10, 10);
		// 40×20 的矩形，左上角 (100,200) → 中心 (120,210)
		assert.deepEqual(ctx.of('moveTo')[0].args, [120, 210]);
		assert.deepEqual(ctx.of('lineTo')[0].args, [130, 220]);
	});

	test('线段：两端一起移', () => {
		const ctx = new FakeCtx();
		line().drawMovePreview(ctx.asCtx(), 5, 5);
		// 第一个 moveTo/lineTo 是连线，之后两组是幽灵描两遍
		const moves = ctx.of('moveTo');
		const tos = ctx.of('lineTo');
		assert.deepEqual(moves[1].args, [15, 25], '起点移了');
		assert.deepEqual(tos[1].args, [115, 25], '终点也移了');
	});

});

describe('缩放预览原地画缩放后的尺寸', () => {

	test('圆形：半径加 dx，dy 不参与', () => {
		const ctx = new FakeCtx();
		circle().drawScalePreview(ctx.asCtx(), 15, 999);
		assert.deepEqual(ctx.of('arc')[0].args, [100, 100, 40],
			'圆心不动、半径 25+15=40，dy 被忽略');
	});

	test('圆形：半径缩到 0 以下时停在 1，不是负数', () => {
		const ctx = new FakeCtx();
		// 负半径画不出来，而且 isHit 永远 false —— 会变成选不中、删不掉的幽灵
		circle().drawScalePreview(ctx.asCtx(), -100, 0);
		assert.deepEqual(ctx.of('arc')[0].args, [100, 100, 1]);
	});

	test('矩形：改宽高，左上角不动', () => {
		const ctx = new FakeCtx();
		rect().drawScalePreview(ctx.asCtx(), 10, 30);
		assert.deepEqual(ctx.of('fillRect')[0].args, [100, 200, 50, 50]);
	});

	test('线段：只动终点，起点不动', () => {
		const ctx = new FakeCtx();
		line().drawScalePreview(ctx.asCtx(), 20, 20);
		const moves = ctx.of('moveTo');
		const tos = ctx.of('lineTo');
		assert.deepEqual(moves[0].args, [10, 20], '起点原地');
		assert.deepEqual(tos[0].args, [130, 40], '终点加了 (20,20)');
	});

	test('缩放预览不画「原位置 → 目标位置」的连线', () => {
		const ctx = new FakeCtx();
		circle().drawScalePreview(ctx.asCtx(), 15, 0);
		// 缩放不改位置，画出来是一条零长度的线
		assert.equal(ctx.of('moveTo').length, 0);
		assert.equal(ctx.of('lineTo').length, 0);
	});

});

describe('预览不改原 Token', () => {

	/** 每帧都画一次预览，改了原 Token 的话位移会累加 */
	test('移动预览连画三帧，原 Token 的坐标不变', () => {
		const tk = circle();
		const ctx = new FakeCtx();
		for (let i = 0; i < 3; i++) { tk.drawMovePreview(ctx.asCtx(), 10, 10); }
		assert.equal(tk.c.x, 100);
		assert.equal(tk.c.y, 100);
		// 三帧画的幽灵都在同一处 —— 位移没累加
		for (const a of ctx.of('arc')) { assert.deepEqual(a.args, [110, 110, 25]); }
	});

	test('缩放预览连画三帧，原 Token 的半径不变', () => {
		const tk = circle();
		const ctx = new FakeCtx();
		for (let i = 0; i < 3; i++) { tk.drawScalePreview(ctx.asCtx(), 5, 0); }
		assert.equal(tk.radius, 25);
		for (const a of ctx.of('arc')) { assert.deepEqual(a.args, [100, 100, 30]); }
	});

	test('矩形与线段同样不被改', () => {
		const r = rect();
		const l = line();
		const ctx = new FakeCtx();
		r.drawMovePreview(ctx.asCtx(), 7, 7);
		r.drawScalePreview(ctx.asCtx(), 7, 7);
		l.drawMovePreview(ctx.asCtx(), 7, 7);
		l.drawScalePreview(ctx.asCtx(), 7, 7);
		assert.deepEqual([r.x, r.y, r.width, r.height], [100, 200, 40, 20]);
		assert.deepEqual([l.a.x, l.a.y, l.b.x, l.b.y], [10, 20, 110, 20]);
	});

});

describe('预览的几何等于提交的几何', () => {

	/**
	 * 这是这组用例里最要紧的一条。
	 *
	 * 编辑器松手时调 `moveTo()` / `scaleTo()` 把 Token 换掉，
	 * 预览也走这两个方法 —— 所以「看到的」必然等于「得到的」。
	 * 哪天有人把预览改成自己算一遍公式，这条就会失败。
	 */
	test('移动预览的幽灵位置 = moveTo 的结果', () => {
		const tk = circle();
		const ctx = new FakeCtx();
		tk.drawMovePreview(ctx.asCtx(), 33, -17);
		const committed = tk.moveTo(33, -17).getCenter();
		assert.deepEqual(ctx.of('arc')[0].args.slice(0, 2),
			[committed.x, committed.y]);
	});

	test('缩放预览的幽灵尺寸 = scaleTo 的结果', () => {
		const tk = rect();
		const ctx = new FakeCtx();
		tk.drawScalePreview(ctx.asCtx(), 13, 7);
		const committed = tk.scaleTo(13, 7);
		assert.deepEqual(ctx.of('fillRect')[0].args,
			[committed.x, committed.y, committed.width, committed.height]);
	});

});

describe('幽灵的画法', () => {

	test('三种形状的幽灵都用那组蓝 + 绿', () => {
		const cases: Array<[string, IToken2D]> = [
			['圆形', circle()], ['矩形', rect()], ['线段', line()],
		];
		for (const [name, tk] of cases) {
			const ctx = new FakeCtx();
			tk.drawScalePreview(ctx.asCtx(), 5, 5);
			// ⚠️ **线段把蓝色描上去，不是填上去的** —— 它没有面积，
			// 「填充 + 描边」落到线段身上就是描两遍（见 LineToken.drawPreviewGhost）。
			// 所以这里查「这个颜色出现过」，不查「出现在 fillStyle 还是 strokeStyle」
			const used = new Set(ctx.calls.flatMap(c => [c.fill, c.stroke]));
			assert.ok(used.has(GHOST_FILL), `${name}：没有用幽灵的蓝色`);
			assert.ok(used.has(GHOST_STROKE), `${name}：没有用幽灵的绿色`);
		}
	});

	test('幽灵不贴图片 —— 预览要看清边界，不是看棋子长什么样', () => {
		const ctx = new FakeCtx();
		circle().drawMovePreview(ctx.asCtx(), 10, 10);
		rect().drawMovePreview(ctx.asCtx(), 10, 10);
		assert.equal(ctx.of('drawImage').length, 0);
	});

	test('隐形的 Token 也画预览 —— 墙壁几乎都是隐形的', () => {
		// line() 的 visible 是 false。编辑器里必须能预览，
		// 不然拖墙的时候什么都看不见
		const tk = line();
		assert.equal(tk.visible, false, '前提：这个 Token 是隐形的');
		const ctx = new FakeCtx();
		tk.drawMovePreview(ctx.asCtx(), 10, 10);
		assert.ok(ctx.of('stroke').length > 0, '隐形也要画出来');
	});

	test('save / restore 配对 —— 不然样式会漏到后面的绘制', () => {
		const ctx = new FakeCtx();
		circle().drawMovePreview(ctx.asCtx(), 10, 10);
		assert.equal(ctx.of('save').length, ctx.of('restore').length);
		assert.ok(ctx.of('save').length > 0);
	});

});
