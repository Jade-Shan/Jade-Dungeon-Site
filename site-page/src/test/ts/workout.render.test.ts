/**
 * workout 的渲染逻辑
 *
 * 这几个函数是 P2 第二项的产物：原来它们和 348 行 SVG 路径数据混在一个
 * 512 行的文件里，没法单独测。拆开之后 `mergePathWithStyle` 是纯函数，
 * `loadMuscleSvg` / `loadPoseSvg` 只要一个 document 就能测。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { withDom } from './_jsdom-setup.js';
import {
	loadMuscleSvg, mergePathWithStyle, loadPoseSvg, loadWorkoutMuscleSvg,
	workoutData, DEFAULT_WORKOUT_DATA, IMuscleCsvPath, StrenghtWorkout,
	IStrengthPose,
} from '../../main/ts/workout/workout.js';

/** 三条路径，分属三块肌肉 */
const paths: Array<IMuscleCsvPath> = [
	{ id: 'p1', muscle: '2-1', style: 'body', d: 'M0,0 L1,1' },
	{ id: 'p2', muscle: '3-1', style: 'body', d: 'M1,1 L2,2' },
	{ id: 'p3', muscle: '4-1', style: 'body', d: 'M2,2 L3,3' },
];

describe('mergePathWithStyle', () => {

	test('命中的肌肉换样式，其余保持原样', () => {
		const out = mergePathWithStyle(paths, 'muscle-primary', ['3-1']);
		assert.deepEqual(out.map(p => p.style),
			['body', 'muscle-primary', 'body']);
	});

	test('不改入参', () => {
		mergePathWithStyle(paths, 'muscle-primary', ['3-1']);
		assert.deepEqual(paths.map(p => p.style), ['body', 'body', 'body'],
			'原数组应保持原样');
	});

	test('空的肌肉列表原样返回副本', () => {
		const out = mergePathWithStyle(paths, 'muscle-primary', []);
		assert.deepEqual(out, paths);
		assert.notEqual(out, paths, '应是新数组');
	});

	test('一次命中多块肌肉', () => {
		const out = mergePathWithStyle(paths, 'muscle-extra', ['2-1', '4-1']);
		assert.deepEqual(out.map(p => p.style),
			['muscle-extra', 'body', 'muscle-extra']);
	});

	test('连着套三档时后套的盖掉先套的', () => {
		// 这是现状，不是期望：同一块肌肉同时在 pim 和 min 里时，
		// min 会盖掉 primary。数据里本来就不该有重复
		let out = mergePathWithStyle(paths, 'muscle-primary', ['2-1']);
		out = mergePathWithStyle(out, 'muscle-minor', ['2-1']);
		assert.equal(out[0].style, 'muscle-minor');
	});

	test('id / muscle / d 三个字段原样带过去', () => {
		const out = mergePathWithStyle(paths, 'x', ['2-1']);
		assert.equal(out[0].id, 'p1');
		assert.equal(out[0].muscle, '2-1');
		assert.equal(out[0].d, 'M0,0 L1,1');
	});

});

describe('loadMuscleSvg', () => {

	test('产出带 id / width / height 的 svg，路径挂在 g 下', () => {
		withDom('', () => {
			const svg = loadMuscleSvg('my-img', '500', '270', 'scale(0.5)', paths);
			assert.equal(svg.getAttribute('id'), 'my-img');
			assert.equal(svg.getAttribute('width'), '500');
			assert.equal(svg.getAttribute('height'), '270');
			const g = svg.querySelector('g')!;
			assert.equal(g.getAttribute('transform'), 'scale(0.5)');
			assert.equal(g.querySelectorAll('path').length, 3);
		});
	});

	test('每条 path 的 class 是 `style muscle`', () => {
		withDom('', () => {
			const svg = loadMuscleSvg('i', '1', '1', '', paths);
			const p = svg.querySelector('#p1')!;
			// 配色靠这两个 class：前者是发力档位，后者是肌肉 id
			assert.equal(p.getAttribute('class'), 'body 2-1');
			assert.equal(p.getAttribute('muscle'), '2-1');
			assert.equal(p.getAttribute('d'), 'M0,0 L1,1');
		});
	});

	test('空路径列表产出只有 g 的空 svg', () => {
		withDom('', () => {
			const svg = loadMuscleSvg('i', '1', '1', '', []);
			assert.equal(svg.querySelectorAll('path').length, 0);
			assert.ok(svg.querySelector('g'), 'g 还是要有');
		});
	});

	test('元素建在 SVG 命名空间下', () => {
		withDom('', () => {
			const svg = loadMuscleSvg('i', '1', '1', '', paths);
			// 用 createElement 而不是 createElementNS 的话浏览器不认这是 SVG
			assert.equal(svg.namespaceURI, 'http://www.w3.org/2000/svg');
			assert.equal(svg.querySelector('path')!.namespaceURI,
				'http://www.w3.org/2000/svg');
		});
	});

});

describe('loadPoseSvg', () => {

	const poses: Array<IStrengthPose> = [
		{ id: 'sth-1-1', path: [{ id: 'a', style: 'body', d: 'M0,0' }] },
		{ id: 'sth-1-2', path: [{ id: 'b', style: 'equipment', d: 'M1,1' },
			{ id: 'c', style: 'body', d: 'M2,2' }] },
	];

	test('按 id 找到对应动作的路径', () => {
		withDom('', () => {
			const svg = loadPoseSvg('sth-1-2', poses);
			assert.equal(svg.getAttribute('id'), 'sth-1-2');
			assert.equal(svg.querySelectorAll('path').length, 2);
			assert.equal(svg.querySelector('#b')!.getAttribute('class'), 'equipment');
		});
	});

	test('id 不存在时产出空 svg，不抛错', () => {
		withDom('', () => {
			// 动作清单里有而姿势数据里没有是允许的
			const svg = loadPoseSvg('not-exist', poses);
			assert.equal(svg.querySelectorAll('path').length, 0);
			assert.equal(svg.getAttribute('id'), 'not-exist');
		});
	});

	test('姿势图尺寸是写死的 650x270', () => {
		withDom('', () => {
			const svg = loadPoseSvg('sth-1-1', poses);
			assert.equal(svg.getAttribute('width'), '650');
			assert.equal(svg.getAttribute('height'), '270');
		});
	});

	test('姿势路径不带 muscle 属性', () => {
		withDom('', () => {
			// 与肌肉图不同：姿势图的 class 只有 style 一项
			const svg = loadPoseSvg('sth-1-1', poses);
			assert.equal(svg.querySelector('#a')!.getAttribute('muscle'), null);
		});
	});

});

describe('workoutData 合并内置数据', () => {

	test('不传时四项都有内置值', () => {
		const d = workoutData();
		for (const k of ['front', 'back', 'poses', 'workouts'] as const) {
			assert.ok(d[k].length > 0, `${k} 应有内置数据`);
		}
	});

	test('只覆盖传了的项', () => {
		const mine: Array<StrenghtWorkout> = [];
		const d = workoutData({ workouts: mine });
		assert.equal(d.workouts, mine);
		assert.equal(d.front, DEFAULT_WORKOUT_DATA.front, 'front 仍是内置的');
	});

});

describe('loadWorkoutMuscleSvg', () => {

	const workout: StrenghtWorkout = {
		part: '胸', epart: 'Chest', type: 'free', id: 'w1',
		name: '卧推', ename: 'Bench Press',
		pim: ['2-1'], min: ['3-1'], ext: ['4-1'],
	};

	test('三档发力各套到对应肌肉上', () => {
		withDom('', () => {
			const item = loadWorkoutMuscleSvg(workout, 'img', '1', '1', '',
				{ front: paths, back: paths, poses: [], workouts: [] });
			const cls = (id: string) =>
				item.font.querySelector(`#${id}`)!.getAttribute('class');
			assert.equal(cls('p1'), 'muscle-primary 2-1');
			assert.equal(cls('p2'), 'muscle-minor 3-1');
			assert.equal(cls('p3'), 'muscle-extra 4-1');
		});
	});

	test('正面和背面各渲染一张，info 原样带回', () => {
		withDom('', () => {
			const item = loadWorkoutMuscleSvg(workout, 'img', '1', '1', '',
				{ front: paths, back: [paths[0]], poses: [], workouts: [] });
			assert.equal(item.font.querySelectorAll('path').length, 3);
			assert.equal(item.back.querySelectorAll('path').length, 1);
			assert.equal(item.info, workout);
		});
	});

	test('正面与背面图共用同一个 imgId', () => {
		withDom('', () => {
			// 这是现状，不是期望：两张图的 id 相同，同时插进一个文档会撞 id。
			// 调用方（testWorkout.ts）把它们放在不同容器里，所以一直没出问题
			const item = loadWorkoutMuscleSvg(workout, 'same-id', '1', '1', '',
				{ front: paths, back: paths, poses: [], workouts: [] });
			assert.equal(item.font.getAttribute('id'), 'same-id');
			assert.equal(item.back.getAttribute('id'), 'same-id');
		});
	});

});
