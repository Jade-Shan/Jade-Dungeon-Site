import { GeoShape2D, GeoPolygon2D, Geo2DUtils, Point2D, Line2D, IRay2D, 
	IPoint2D, ILine2D, IRectangle2D, Rectangle2D, Ray2D, IGeo2D, GeoCurve2D, 
	IRevolveOption, ICircle2D, Circle2D } from './geo2d.js';
import { WebUtil } from '../web.js';

/**
 * 从图片中截取一部分
 */
export interface ImageClip {
	/** 对应的图片 ID */
	imgKey    : string;
	/** 左上角 X 坐标 */
	sx        : number;
	/** 左上角 Y 坐标 */
	sy        : number;
	/** 裁剪宽度 */
	width     : number;
	/** 裁剪高度 */
	height    : number;
	/** 缓存的图片元素 */
	imageElem?: HTMLImageElement;
}

/**
 * Canvas 绘制样式
 */
export interface ICanvasStyle {
	/** 线宽 */
	lineWidth  ?: number;
	/** 描边颜色 */
	strokeStyle?: string;
	/** 填充颜色 */
	fillStyle  ?: string;
	/** 图片裁剪区域 */
	imgClip    ?: ImageClip;
}

/**
 * Canvas 2D 绘图工具集
 *
 * 提供线段、射线、点、矩形、圆、扇形等常用图形的绘制封装。
 */
export namespace CanvasUtils {


	/**
	 * 下载canvas所转的图片
	 * @param cvsElem canvas element
	 * @param type image type
	 * @param filename file name
	 */
	export let downloadCanvasImage = (cvsElem: HTMLCanvasElement, type?: string, filename?: string) => {
		const fileType = type && type.length > 2 ? type.toLowerCase() : 'png';
		const mimeType = `image/${fileType}`;
		const fileName = filename ? filename : `download-${(new Date()).getTime()}.${fileType}`;
		cvsElem.toBlob((blob) => {
			if (blob) { WebUtil.downloadBlob(blob, fileName); }
		}, mimeType);
	}


	/**
	 * 内部通用绘制函数：应用样式、执行绘制、处理裁剪/填充
	 */
	let drawWithCanvas = (cvsCtx: CanvasRenderingContext2D, // 
		func: (cvs: CanvasRenderingContext2D) => void, style?: ICanvasStyle //
	): void => {
		cvsCtx.save();
		if (style?.lineWidth  ) { cvsCtx.lineWidth   = style.lineWidth  ; }
		if (style?.strokeStyle) { cvsCtx.strokeStyle = style.strokeStyle; }
		if (style?.fillStyle  ) { cvsCtx.fillStyle   = style.fillStyle  ; }
		cvsCtx.beginPath();
		func(cvsCtx);
		if (style?.imgClip?.imageElem) {
			if (style?.lineWidth && style.lineWidth > 0) { cvsCtx.stroke(); }
			cvsCtx.clip();
			cvsCtx.drawImage(style.imgClip.imageElem,
				style.imgClip.sx, style.imgClip.sy, //
				style.imgClip.width, style.imgClip.height, //
				style.imgClip.sx, style.imgClip.sy, //
				style.imgClip.width, style.imgClip.height);
		} else {
			if (style?.lineWidth && style.lineWidth > 0) { cvsCtx.stroke(); }
			if (style?.fillStyle) { cvsCtx.fill(); }
		}
		cvsCtx.restore();
	}

	/**
	 * 绘制弧线
	 *
	 * @param cvsCtx - Canvas 2D 上下文
	 * @param center - 圆心
	 * @param radius - 半径
	 * @param revole - 旋转参数（起始角、结束角、角度差）
	 * @param style - 绘制样式
	 * @returns {void}
	 */
	export let drawArc = (cvsCtx: CanvasRenderingContext2D, //
		center: IPoint2D, radius: number, revole: IRevolveOption, style?: ICanvasStyle //
	): void => {
		drawWithCanvas(cvsCtx, (cvsCtx) => {
			cvsCtx.arc(center.x, center.y, radius, revole.start, revole.end, revole.diff < 0);
		}, style);
	}

	/**
	 * 画一条线段
	 *
	 * @param cvsCtx - Canvas 2D 上下文
	 * @param line - Canvas 线段对象
	 * @returns {void}
	 */
	export let drawLine = (cvsCtx: CanvasRenderingContext2D, line: ICanvasLine2D): void => {
		cvsCtx.save();
		cvsCtx.strokeStyle = line.strokeStyle;
		cvsCtx.lineWidth = line.lineWidth;
		if (line.lineCap ) { cvsCtx.lineCap  = line.lineCap ; }
		if (line.lineJoin) { cvsCtx.lineJoin = line.lineJoin; }
		cvsCtx.beginPath();
		cvsCtx.moveTo(line.a.x, line.a.y);
		cvsCtx.lineTo(line.b.x, line.b.y);
		cvsCtx.stroke();
		cvsCtx.restore();
	}

	/**
	 * 绘制多条线段
	 *
	 * @param cvsCtx - Canvas 2D 上下文
	 * @param lines - Canvas 线段数组
	 * @returns {void}
	 */
	export let drawLines = (cvsCtx: CanvasRenderingContext2D, lines: Array<ICanvasLine2D>): void => {
		if (lines && lines.length > 0) {
			for (let i = 0; i < lines.length; i++) {
				drawLine(cvsCtx, lines[i]);
			}
		}
	}

	/**
	 * 绘制一条射线
	 *
	 * @param cvsCtx - Canvas 2D 上下文
	 * @param ray - Canvas 射线对象
	 * @returns {void}
	 */
	export let drawRay = (cvsCtx: CanvasRenderingContext2D, ray: ICanvasRay2D): void => {
		drawLine(cvsCtx, {
			a: ray.start, b: ray.mid, //
			lineWidth: ray.lineWidth, strokeStyle: ray.strokeStyle, //
			lineCap: ray.lineCap, lineJoin: ray.lineJoin
		})
	}

	/**
	 * 绘制多条射线
	 *
	 * @param cvsCtx - Canvas 2D 上下文
	 * @param rays - Canvas 射线数组
	 * @returns {void}
	 */
	export let drawRays = (cvsCtx: CanvasRenderingContext2D, rays: Array<ICanvasRay2D>): void => {
		if (rays && rays.length > 0) {
			for (let i = 0; i < rays.length; i++) {
				drawRay(cvsCtx, rays[i]);
			}
		}
	}

	/**
	 * 绘制一个点（实心圆）
	 *
	 * @param cvsCtx - Canvas 2D 上下文
	 * @param point - Canvas 点对象
	 * @returns {void}
	 */
	export let drawPoint = (cvsCtx: CanvasRenderingContext2D, point: ICanvasPoint2D): void => {
		cvsCtx.save();
		cvsCtx.fillStyle = point.fillStyle;
		cvsCtx.beginPath();
		cvsCtx.arc(point.x, point.y, point.radius, 0, Geo2DUtils.PI_DOUBLE, true);
		cvsCtx.fill();
		cvsCtx.restore();
	}

	/**
	 * 绘制多个点
	 *
	 * @param cvsCtx - Canvas 2D 上下文
	 * @param points - Canvas 点数组
	 * @returns {void}
	 */
	export let drawPoints = (cvsCtx: CanvasRenderingContext2D, points: Array<ICanvasPoint2D>): void => {
		if (points && points.length > 0) {
			for (let i = 0; i < points.length; i++) {
				drawPoint(cvsCtx, points[i]);
			}
		}
	}

	/**
	 * 绘制矩形
	 *
	 * @param cvsCtx - Canvas 2D 上下文
	 * @param rect - Canvas 矩形对象
	 * @returns {void}
	 */
	export let drawRectangle = (cvsCtx: CanvasRenderingContext2D, rect: ICanvasRectangle2D): void => {
		cvsCtx.save();
		if (rect.fillStyle && rect.fillStyle.length > 0) {
			cvsCtx.fillStyle = rect.fillStyle;
			cvsCtx.fillRect(rect.x, rect.y, rect.width, rect.height);
		}
		if (rect.lineWidth > 0) {
			cvsCtx.strokeStyle = rect.strokeStyle;
			cvsCtx.strokeRect(rect.x, rect.y, rect.width, rect.height);
		}
		cvsCtx.restore();
	}

	/**
	 * 绘制圆形
	 *
	 * @param cvsCtx - Canvas 2D 上下文
	 * @param circle - Canvas 圆形对象
	 * @returns {void}
	 */
	export let drawCircle = (cvsCtx: CanvasRenderingContext2D, circle: ICanvasCircle2D): void => {
		cvsCtx.save();
		cvsCtx.beginPath();
		cvsCtx.arc(circle.c.x, circle.c.y, circle.radius, 0, Geo2DUtils.PI_DOUBLE, false);
		if (circle.fillStyle && circle.fillStyle.length > 0) {
			cvsCtx.fillStyle = circle.fillStyle;
			cvsCtx.fill();
		}
		if (circle.lineWidth > 0) {
			cvsCtx.strokeStyle = circle.strokeStyle;
			cvsCtx.stroke();
		}
		cvsCtx.restore();
	}

	/**
	 * 从多边形生成 Canvas 点数组（用于绘制顶点）
	 *
	 * @param shape - 多边形对象
	 * @param radius - 点的半径
	 * @param fillStyle - 点的填充颜色
	 * @returns {Array<CanvasPoint2D>} 顶点对应的 Canvas 点数组
	 */
	export let genVertexes = (shape: CanvasPolygon2D, radius: number, fillStyle: string): //
		Array<CanvasPoint2D> => //
	{
		let result: Array<CanvasPoint2D> = [];
		let vtxs = shape.getVertex();
		if (vtxs && vtxs.length > 0) {
			for (let i = 0; i < vtxs.length; i++) {
				let vtx = vtxs[i];
				result.push(new CanvasPoint2D(vtx.x, vtx.y, radius, fillStyle));
			}
		}
		return result;
	}

	/**
	 * 绘制几何图形的所有顶点
	 *
	 * @param cvsCtx - Canvas 2D 上下文
	 * @param shape - 多边形对象
	 * @param radius - 顶点半径
	 * @param fillStyle - 填充颜色
	 * @returns {void}
	 */
	export let drawShapeVertexes = (cvsCtx: CanvasRenderingContext2D, //
		shape: CanvasPolygon2D, radius: number, fillStyle: string): void => //
	{
		let vtxs: Array<CanvasPoint2D> = genVertexes(shape, radius, fillStyle);
		drawPoints(cvsCtx, vtxs);
	}

	/**
	 * 绘制从外部点到图形各顶点的射线
	 *
	 * @param cvsCtx - Canvas 2D 上下文
	 * @param x - 外部点的 X 坐标
	 * @param y - 外部点的 Y 坐标
	 * @param shape - 目标几何图形
	 * @param length - 射线长度
	 * @param lineWidth - 线宽
	 * @param strokeStyle - 描边颜色
	 * @returns {void}
	 */
	export let drawVertexRaysFrom = (cvsCtx: CanvasRenderingContext2D, x: number, y: number, shape: GeoShape2D, //
		length: number, lineWidth: number, strokeStyle: string) => //
	{
		let vtxRays: Array<{ vertex: Point2D, ray: Ray2D }> = Geo2DUtils.genVertexRaysFrom(x, y, shape, length);
		if (vtxRays && vtxRays.length > 0) {
			for (let i = 0; i < vtxRays.length; i++) {
				let ray = vtxRays[i].ray;
				drawLine(cvsCtx, {
					a: ray.start, b: ray.mid,
					lineWidth, strokeStyle
				});
			}
		}
	}

	/**
	 * 绘制从外部点到图形的阴影扇形区域
	 *
	 * @param cvsCtx - Canvas 2D 上下文
	 * @param x - 外部点的 X 坐标
	 * @param y - 外部点的 Y 坐标
	 * @param shape - 目标几何图形
	 * @param length - 射线长度
	 * @param style - 绘制样式
	 * @returns {void}
	 */
	export let drawVertexShadowFrom = (cvsCtx: CanvasRenderingContext2D, x: number, y: number, shape: GeoShape2D, //
		length: number, style: ICanvasStyle) => //
	{
		let vtxRays: Array<{ vertex: Point2D, ray: Ray2D }> = Geo2DUtils.genVertexRaysFrom(x, y, shape, length);
		if (vtxRays && vtxRays.length < 2) {
			return;
		}
		for (let i = 0; i < vtxRays.length - 1; i++) {
			drawFanByRays(cvsCtx, vtxRays[i], vtxRays[i + 1], style);
		}
		drawFanByRays(cvsCtx, vtxRays[vtxRays.length - 1], vtxRays[0], style);
	}

	/**
	 * 以两条射线为边界绘制扇形
	 *
	 * @param cvsCtx - Canvas 2D 上下文
	 * @param start - 起始射线
	 * @param end - 结束射线
	 * @param style - 绘制样式
	 * @returns {void}
	 */
	export let drawFanByRays = (cvsCtx: CanvasRenderingContext2D, //
		start: { vertex: Point2D, ray: Ray2D }, end: { vertex: Point2D, ray: Ray2D }, style?: ICanvasStyle) => //
	{
		let revole = Geo2DUtils.revolveRay(start.ray.start, start.ray.mid, end.ray.mid);

		drawWithCanvas(cvsCtx, (cvsCtx) => {
			// 因为Canvas的原点坐标是在左上角，所以顺时钟和逆时钟的方向和笛卡尔坐标系是反的
			cvsCtx.arc(start.ray.start.x, start.ray.start.y, start.ray.length, revole.start, revole.end, revole.diff < 0);
			cvsCtx.lineTo(end.vertex.x, end.vertex.y);
			cvsCtx.lineTo(start.vertex.x, start.vertex.y);
		}, style);
	}

}


/** 2D Canvas 图形基础接口 */
export interface ICanvas2D extends IGeo2D { }

/** 2D Canvas 形状接口 */
export interface CanvasShape2D extends GeoShape2D { }

/** 2D Canvas 曲线接口 */
export interface CanvasCurve2D extends CanvasShape2D, GeoCurve2D { }

/** 2D Canvas 多边形接口 */
export interface CanvasPolygon2D extends CanvasShape2D, GeoPolygon2D { }

/**
 * 2D Canvas 点的只读类型
 */
export interface ICanvasPoint2D extends ICanvas2D, IPoint2D {
	/** 点的绘制半径 */
	readonly radius   : number;
	/** 填充颜色 */
	readonly fillStyle: string;
}
/**
 * 2D Canvas 点
 *
 * 继承 Point2D，添加绘制时所需的半径和填充颜色。
 */
export class CanvasPoint2D extends Point2D //
	implements CanvasCurve2D, ICanvasPoint2D // 
{
	readonly radius   : number;
	readonly fillStyle: string;

	/**
	 * @param x - X 坐标
	 * @param y - Y 坐标
	 * @param radius - 绘制半径
	 * @param fillStyle - 填充颜色
	 */
	constructor(x: number, y: number, radius: number, fillStyle: string) {
		super(x, y);
		this.radius    = radius;
		this.fillStyle = fillStyle;
	}

	/**
	 * 从接口类型构造 CanvasPoint2D 实例
	 * @param point - 点的只读接口
	 * @returns {CanvasPoint2D}
	 */
	static from(point: ICanvasPoint2D): CanvasPoint2D {
		return new CanvasPoint2D(point.x, point.y, point.radius, point.fillStyle);
	}
}

/**
 * 2D Canvas 线段的只读类型
 */
export interface ICanvasLine2D extends ICanvas2D, ILine2D {
	/** 线宽 */
	readonly lineWidth : number;
	/** 线端样式 */
	readonly lineCap   ?: "butt"  | "round" | "square";
	/** 线连接样式 */
	readonly lineJoin  ?: "miter" | "round" | "bevel" ;
	/** 描边颜色 */
	readonly strokeStyle: string;
}
/**
 * 2D Canvas 线段
 *
 * 继承 Line2D，添加绘制时所需的线宽和描边颜色。
 */
export class CanvasLine2D extends Line2D implements CanvasPolygon2D, ICanvasLine2D {
	readonly lineWidth: number;
	readonly strokeStyle: string;

	/**
	 * @param a - 端点 A
	 * @param b - 端点 B
	 * @param lineWidth - 线宽
	 * @param strokeStyle - 描边颜色
	 */
	constructor(a: IPoint2D, b: IPoint2D, lineWidth: number, strokeStyle: string) //
	{
		super(a, b);
		this.strokeStyle = strokeStyle;
		this.lineWidth = lineWidth;
	}

	/**
	 * 从接口类型构造 CanvasLine2D 实例
	 * @param line - 线段的只读接口
	 * @returns {CanvasLine2D}
	 */
	static from(line: ICanvasLine2D): CanvasLine2D {
		return new CanvasLine2D(line.a, line.b, line.lineWidth, line.strokeStyle);
	}

}

/**
 * 2D Canvas 射线的只读类型
 */
export interface ICanvasRay2D extends IRay2D {
	/** 线宽 */
	readonly lineWidth  : number;
	/** 线端样式 */
	readonly lineCap   ?: "butt"  | "round" | "square";
	/** 线连接样式 */
	readonly lineJoin  ?: "miter" | "round" | "bevel" ;
	/** 描边颜色 */
	readonly strokeStyle: string;
}
/**
 * 2D Canvas 射线
 *
 * 继承 Ray2D，添加绘制时所需的线宽和描边颜色。
 */
export class CanvasRay2D extends Ray2D implements CanvasPolygon2D, ICanvasRay2D {
	readonly lineWidth  : number;
	readonly strokeStyle: string;

	/**
	 * @param start - 射线起点
	 * @param mid - 射线经过的点
	 * @param lineWidth - 线宽
	 * @param strokeStyle - 描边颜色
	 */
	constructor(start: IPoint2D, mid: IPoint2D, lineWidth: number, strokeStyle: string) {
		super(start, mid);
		this.strokeStyle = strokeStyle;
		this.lineWidth   = lineWidth  ;
	}

}

/**
 * 2D Canvas 矩形的只读类型
 */
export interface ICanvasRectangle2D extends IRectangle2D {
	/** 线宽 */
	readonly lineWidth  : number;
	/** 描边颜色 */
	readonly strokeStyle: string;
	/** 填充颜色 */
	readonly fillStyle  : string;
}
/**
 * 2D Canvas 矩形
 *
 * 继承 Rectangle2D，添加绘制时所需的线宽、描边和填充颜色。
 */
export class CanvasRectangle2D extends Rectangle2D //
	implements CanvasPolygon2D, ICanvasRectangle2D //
{
	readonly lineWidth  : number;
	readonly strokeStyle: string;
	readonly fillStyle  : string;

	/**
	 * @param x - 左上角 X 坐标
	 * @param y - 左上角 Y 坐标
	 * @param width - 宽度
	 * @param height - 高度
	 * @param lineWidth - 线宽
	 * @param strokeStyle - 描边颜色
	 * @param fillStyle - 填充颜色
	 */
	constructor(x: number, y: number, width: number, height: number, //
		lineWidth: number, strokeStyle: string, fillStyle: string) {
		super(x, y, width, height);
		this.lineWidth = lineWidth;
		this.strokeStyle = strokeStyle;
		this.fillStyle = fillStyle;
	}

	/**
	 * 从接口类型构造 CanvasRectangle2D 实例
	 * @param rect - 矩形的只读接口
	 * @returns {CanvasRectangle2D}
	 */
	static from(rect: ICanvasRectangle2D): CanvasRectangle2D {
		return new CanvasRectangle2D(rect.x, rect.y, rect.width, rect.height, //
			rect.lineWidth, rect.strokeStyle, rect.fillStyle);
	}

}


/**
 * 2D Canvas 圆形的只读类型
 */
export interface ICanvasCircle2D extends ICanvas2D, ICircle2D {
	/** 线宽 */
	readonly lineWidth  : number;
	/** 描边颜色 */
	readonly strokeStyle: string;
	/** 填充颜色 */
	readonly fillStyle  : string;

}
/**
 * 2D Canvas 圆形
 *
 * 继承 Circle2D，添加绘制时所需的线宽、描边和填充颜色。
 */
export class CanvasCircle2D extends Circle2D // 
	implements CanvasCurve2D, ICanvasCircle2D // 
{
	readonly lineWidth  : number;
	readonly strokeStyle: string;
	readonly fillStyle  : string;

	/**
	 * @param x - 圆心 X 坐标
	 * @param y - 圆心 Y 坐标
	 * @param radius - 半径
	 * @param lineWidth - 线宽
	 * @param strokeStyle - 描边颜色
	 * @param fillStyle - 填充颜色
	 */
	constructor(x: number, y: number, radius: number, lineWidth: number, strokeStyle: string, fillStyle: string) {
		super(x, y, radius);
		this.lineWidth = lineWidth;
		this.strokeStyle = strokeStyle;
		this.fillStyle = fillStyle;
	}

}
