/**
 * 健身动作肌肉图的渲染
 *
 * 把肌肉数据渲染成 SVG：正面图、背面图、动作姿势图各一张。
 *
 * 这个文件原来是 512 行，其中 348 行是写死的 SVG 路径和动作清单。
 * 按 `docs/refactor-20261101.md` 第 4.5 节「数据与渲染分离」，数据已挪到
 * [workoutData.ts](workoutData.ts)（肌肉图路径 + 动作清单）和
 * [workoutPoseData.ts](workoutPoseData.ts)（姿势图路径），本文件只留渲染逻辑。
 *
 * 数据是可注入的 —— {@link initWorkItems} 和 {@link loadWorkoutMuscleSvg}
 * 都收一个 {@link WorkoutData} 形参，默认用内置的那套：
 *
 * ```typescript
 * initWorkItems();                       // 内置数据
 * initWorkItems({ workouts: myList });   // 换掉动作清单，其余仍用内置的
 * ```
 */
import {
	fontMuscleImgs, backMuscleimgs, strenghtWorkoutArr, StrenghtWorkout,
} from "./workoutData.js";
import {
	strengthPoseSvgArr, IStrengthPose, IStrengthPoseSvg,
} from "./workoutPoseData.js";

/** SVG 的命名空间，`createElementNS` 要用 */
const SVG_NS = "http://www.w3.org/2000/svg";

/** 肌肉图的一条路径。`muscle` 是肌肉 id，渲染时会当 class 用 */
export interface IMuscleCsvPath {
	readonly id: string;
	readonly muscle: string;
	readonly style: string;
	readonly d: string;
}

// 类型从数据模块转出一次，使用方不用同时 import 两个文件
export type { StrenghtWorkout, IStrengthPose, IStrengthPoseSvg };

/**
 * 渲染一套肌肉图需要的全部数据
 *
 * 全部字段可选，缺的项走 {@link DEFAULT_WORKOUT_DATA}。
 */
export interface WorkoutData {
	/** 正面肌肉图的路径 */
	front?: Array<IMuscleCsvPath>;
	/** 背面肌肉图的路径 */
	back?: Array<IMuscleCsvPath>;
	/** 各动作的姿势图路径 */
	poses?: Array<IStrengthPose>;
	/** 动作清单 */
	workouts?: Array<StrenghtWorkout>;
}

/** 内置数据，来自 `workoutData.ts` 与 `workoutPoseData.ts` */
export const DEFAULT_WORKOUT_DATA: Required<WorkoutData> = {
	front:    fontMuscleImgs,
	back:     backMuscleimgs,
	poses:    strengthPoseSvgArr,
	workouts: strenghtWorkoutArr,
};

/**
 * 把调用方传的数据与内置数据合并
 *
 * @param data - 调用方传的数据，可以只传一部分
 * @returns {Required<WorkoutData>} 每一项都有值的数据集
 */
export function workoutData(data: WorkoutData = {}): Required<WorkoutData> {
	return { ...DEFAULT_WORKOUT_DATA, ...data };
}

/**
 * 一个动作的渲染结果：动作信息 + 三张 SVG
 */
export interface WorkoutItem {
	/** 动作信息 */
	info: StrenghtWorkout;
	/** 姿势图 */
	pose: SVGSVGElement;
	/** 正面肌肉图 */
	font: SVGSVGElement;
	/** 背面肌肉图 */
	back: SVGSVGElement;
}

/**
 * 把一组路径渲染成肌肉图 SVG
 *
 * 每条路径的 class 是 `${style} ${muscle}` —— 前者是发力档位
 * （`muscle-primary` / `muscle-minor` / `muscle-extra`），后者是肌肉 id，
 * 配色在 `src/themes/workout/styles/muscle.less` 里。
 *
 * @param imgId - SVG 元素的 id
 * @param width - 宽度属性
 * @param height - 高度属性
 * @param scale - `<g>` 的 transform，如 `scale(0.5)`
 * @param pathArr - 路径列表，空列表产出一张空 SVG
 * @returns {SVGSVGElement} 渲染好的 SVG 元素
 */
export function loadMuscleSvg(imgId: string, width: string, height: string,
	scale: string, pathArr: Array<IMuscleCsvPath>): SVGSVGElement //
{
	const svg: SVGSVGElement = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("id", imgId);
	svg.setAttribute("width", width);
	svg.setAttribute("height", height);
	const g: SVGGElement = document.createElementNS(SVG_NS, "g");
	g.setAttribute("transform", scale);
	svg.appendChild(g);
	if (pathArr && pathArr.length) {
		for (const rec of pathArr) {
			const path: SVGPathElement = document.createElementNS(SVG_NS, "path");
			path.setAttribute("id", rec.id);
			path.setAttribute("muscle", rec.muscle);
			path.setAttribute("d", rec.d);
			path.setAttribute("class", `${rec.style} ${rec.muscle}`);
			g.appendChild(path);
		}
	}
	return svg;
}

/**
 * 给指定肌肉换一档样式，其余路径原样保留
 *
 * 纯函数，不改入参 —— 调用方要连着套三档（主要/次要/辅助），
 * 每次拿上一次的结果继续套。
 *
 * @param oldArr - 原路径列表
 * @param style - 要套上的 class
 * @param muscleArr - 命中的肌肉 id 列表，空列表则原样返回一份副本
 * @returns {Array<IMuscleCsvPath>} 新的路径列表
 */
export function mergePathWithStyle(oldArr: Array<IMuscleCsvPath>, style: string,
	muscleArr: Array<string>): Array<IMuscleCsvPath> //
{
	const newArr: Array<IMuscleCsvPath> = [];
	for (const rec of oldArr) {
		const newStyle = muscleArr && muscleArr.indexOf(rec.muscle) >= 0 ?
			style : rec.style;
		newArr.push({ id: rec.id, muscle: rec.muscle, style: newStyle, d: rec.d });
	}
	return newArr;
}

/**
 * 把一个动作的姿势图渲染成 SVG
 *
 * 在 `poses` 里按 id 找这个动作的路径。找不到就产出一张空 SVG ——
 * 动作清单里有而姿势数据里没有是允许的（有氧动作就没有姿势图）。
 *
 * @param workoutId - 动作 id
 * @param poses - 姿势数据
 * @returns {SVGSVGElement} 姿势图
 */
export function loadPoseSvg(workoutId: string,
	poses: Array<IStrengthPose>): SVGSVGElement //
{
	const pose: SVGSVGElement = document.createElementNS(SVG_NS, "svg");
	pose.setAttribute("id", workoutId);
	pose.setAttribute("width", "650");
	pose.setAttribute("height", "270");
	for (const rec of poses) {
		if (rec.id !== workoutId || !rec.path) { continue; }
		for (const p of rec.path) {
			const path: SVGPathElement = document.createElementNS(SVG_NS, "path");
			path.setAttribute("id", p.id);
			path.setAttribute("d", p.d);
			path.setAttribute("class", p.style);
			pose.appendChild(path);
		}
	}
	return pose;
}

/**
 * 渲染一个动作的三张图
 *
 * 发力档位按「主要 → 次要 → 辅助」的顺序连着套，所以同一块肌肉同时出现在
 * `pim` 和 `min` 里时，**后套的 `muscle-minor` 会盖掉前面的 `muscle-primary`**。
 * 这是现状，不是期望 —— 数据里本来就不该有重复。
 *
 * @param workout - 动作信息
 * @param imgId - 肌肉图 SVG 的 id
 * @param width - 宽度属性
 * @param height - 高度属性
 * @param scale - `<g>` 的 transform
 * @param data - 数据集，缺省项走内置数据
 * @returns {WorkoutItem} 动作信息 + 三张 SVG
 */
export function loadWorkoutMuscleSvg(workout: StrenghtWorkout, imgId: string,
	width: string, height: string, scale: string,
	data: WorkoutData = {}): WorkoutItem //
{
	const d = workoutData(data);

	/** 给一面肌肉图连着套三档发力样式 */
	const applyStyles = (base: Array<IMuscleCsvPath>): Array<IMuscleCsvPath> => {
		let arr = mergePathWithStyle(base, "muscle-primary", workout.pim);
		arr = mergePathWithStyle(arr, "muscle-minor", workout.min);
		return mergePathWithStyle(arr, "muscle-extra", workout.ext);
	};

	return {
		info: workout,
		pose: loadPoseSvg(workout.id, d.poses),
		font: loadMuscleSvg(imgId, width, height, scale, applyStyles(d.front)),
		back: loadMuscleSvg(imgId, width, height, scale, applyStyles(d.back)),
	};
}

/**
 * 所有力量训练动作的肌肉图
 *
 * 初始为空，需先调用 {@link initWorkItems} 填充
 */
export let workItems: Array<WorkoutItem> = [];

/**
 * 构建所有动作的肌肉图，填充 {@link workItems}
 *
 * 构建过程要调 `document.createElementNS()`，所以放在函数里按需调用，
 * 避免模块加载期求值 `document` 导致无 DOM 的环境（Node / SSR）import 即抛
 * `ReferenceError`
 *
 * 可重复调用：已填充过时直接返回。**所以换数据要在第一次调用时就传** ——
 * 已经填过再传新数据不会重建，先 `workItems.length = 0` 清掉。
 *
 * @param data - 数据集，缺省项走内置数据
 * @returns {void}
 */
export function initWorkItems(data: WorkoutData = {}): void {
	// 已经构建过就不再重复构建
	if (workItems.length > 0) { return; }
	const d = workoutData(data);
	for (const rec of d.workouts) {
		workItems.push(loadWorkoutMuscleSvg(rec, rec.id, '270', '500',
			'scale(0.5)', d));
	}
}
