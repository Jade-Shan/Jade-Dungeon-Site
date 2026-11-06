/**
 * 窗口 UI 的资源注册表
 *
 * 这张表是 P2 第一项的产物：`UIWindow.ts` 原来直接 import `resource.ts`
 * 那 310 行 base64，现在改成向注册表要。测试要盯住三件事 ——
 * 没注册时不兜底成任何图片数据、注册后能取到、注册表与内置数据解耦。
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
	registerUIResourceProvider, hasUIResourceProvider, getIconGroup,
	getDesktopBackground, pickIconSize, IconGroup, IUIResourceProvider,
} from '../../main/ts/ui/uiResource.js';
import { IconSize, Base64ImgType, IBase64Img } from '../../main/ts/web.js';
import {
	registerDefaultUIResource, JadeUIResource, DefaultIconGroup,
} from '../../main/ts/resource.js';

/** 造一个图标组，五种尺寸的 data 用尺寸名标记，便于断言取对了哪一张 */
function fakeIconGroup(tag: string): IconGroup {
	const img = (size: string): IBase64Img =>
		({ format: Base64ImgType.BASE64_PNG, data: `${tag}-${size}` });
	return {
		x12: img('x12'), x16: img('x16'), x24: img('x24'),
		x32: img('x32'), x48: img('x48'),
	};
}

const fakeBg: IBase64Img = { format: Base64ImgType.BASE64_JPG, data: 'bg-data' };

/** 只认 "known" 这个名字的 provider */
const fakeProvider: IUIResourceProvider = {
	getIconGroup(name?: string): IconGroup | undefined {
		if (name === undefined) { return fakeIconGroup('default'); }
		return name === 'known' ? fakeIconGroup('known') : undefined;
	},
	getDesktopBackground(): IBase64Img | undefined { return fakeBg; },
};

// 注册表是模块级的单例，用例之间必须清掉，否则顺序一变结果就变
afterEach(() => { registerUIResourceProvider(undefined); });

describe('没注册 provider 时', () => {

	test('getIconGroup 返回 undefined，不兜底成任何图片', () => {
		// 这是本模块存在的意义：兜底成某张内置图片就等于没拆
		assert.equal(getIconGroup(), undefined);
		assert.equal(getIconGroup('ELEC_FACE'), undefined);
	});

	test('getDesktopBackground 返回 undefined', () => {
		assert.equal(getDesktopBackground(), undefined);
	});

	test('hasUIResourceProvider 为 false', () => {
		assert.equal(hasUIResourceProvider(), false);
	});

});

describe('注册 provider 之后', () => {

	test('省略 name 时取 provider 的默认图标', () => {
		registerUIResourceProvider(fakeProvider);
		assert.equal(getIconGroup()?.x12.data, 'default-x12');
	});

	test('按名字取到对应图标组', () => {
		registerUIResourceProvider(fakeProvider);
		assert.equal(getIconGroup('known')?.x32.data, 'known-x32');
	});

	test('名字不存在时返回 undefined，不退化成默认图标', () => {
		registerUIResourceProvider(fakeProvider);
		assert.equal(getIconGroup('nope'), undefined);
	});

	test('取到桌面背景', () => {
		registerUIResourceProvider(fakeProvider);
		assert.equal(getDesktopBackground(), fakeBg);
	});

	test('后注册的覆盖先注册的', () => {
		registerUIResourceProvider(fakeProvider);
		registerUIResourceProvider({
			getIconGroup: () => fakeIconGroup('second'),
			getDesktopBackground: () => undefined,
		});
		assert.equal(getIconGroup()?.x12.data, 'second-x12');
		assert.equal(getDesktopBackground(), undefined);
	});

	test('传 undefined 可以注销', () => {
		registerUIResourceProvider(fakeProvider);
		assert.equal(hasUIResourceProvider(), true);
		registerUIResourceProvider(undefined);
		assert.equal(hasUIResourceProvider(), false);
		assert.equal(getIconGroup(), undefined);
	});

});

describe('registerDefaultUIResource（内置资源的 opt-in 注册）', () => {

	test('注册前后的差别：从取不到变成取得到', () => {
		assert.equal(getIconGroup(), undefined, '前提：还没注册');
		registerDefaultUIResource();
		assert.ok(getIconGroup(), '注册后应取得到默认图标');
		assert.ok(getDesktopBackground(), '注册后应取得到桌面背景');
	});

	test('按枚举名取到三组内置图标', () => {
		registerDefaultUIResource();
		for (const name of ['ELEC_FACE', 'ELEC_BUG', 'CAMERA']) {
			const grp = getIconGroup(name);
			assert.ok(grp, `${name} 应存在`);
			// 五种尺寸都得有真实数据
			for (const size of [IconSize.x12, IconSize.x16, IconSize.x24,
				IconSize.x32, IconSize.x48]) {
				assert.ok(pickIconSize(grp, size)!.data.length > 0,
					`${name} 的 ${IconSize[size]} 应有数据`);
			}
		}
	});

	test('未知图标名返回 undefined，不兜底到 ELEC_FACE', () => {
		// 与 JadeUIResource.getDefaultIcon() 的行为不同，后者会 warn 并兜底。
		// 注册表的契约是「没有就是没有」，由调用方决定怎么退化
		registerDefaultUIResource();
		assert.equal(getIconGroup('NOT_EXIST'), undefined);
	});

	test('省略 name 时给 ELEC_FACE', () => {
		registerDefaultUIResource();
		assert.deepEqual(getIconGroup(),
			JadeUIResource.getDefaultIcon(DefaultIconGroup.ELEC_FACE));
	});

	test('getDefaultIconBase64 产出可用的 data URI', () => {
		const uri = JadeUIResource.getDefaultIconBase64(
			DefaultIconGroup.CAMERA, IconSize.x16);
		assert.ok(uri.startsWith('data:image/png;base64,'), `实际: ${uri.slice(0, 40)}`);
	});

	test('getDefaultIcon 对未知值 warn 并兜底到 ELEC_FACE', () => {
		// 这是现状，不是期望 —— 保留是因为它是老的公开 API，改签名是 breaking change
		assert.deepEqual(JadeUIResource.getDefaultIcon(999 as DefaultIconGroup),
			JadeUIResource.getDefaultIcon(DefaultIconGroup.ELEC_FACE));
	});

});

describe('pickIconSize', () => {

	test('五种尺寸各取对一张', () => {
		const grp = fakeIconGroup('t');
		const cases: Array<[IconSize, string]> = [
			[IconSize.x12, 't-x12'], [IconSize.x16, 't-x16'],
			[IconSize.x24, 't-x24'], [IconSize.x32, 't-x32'],
			[IconSize.x48, 't-x48'],
		];
		for (const [size, want] of cases) {
			assert.equal(pickIconSize(grp, size)?.data, want);
		}
	});

	test('图标组是 undefined 时返回 undefined，不抛错', () => {
		assert.equal(pickIconSize(undefined, IconSize.x12), undefined);
	});

});
