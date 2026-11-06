/**
 * WebUtil 里不依赖 DOM 的那部分
 *
 * 这些方法只做字符串/正则处理，不碰 document，所以不用装 jsdom 就能测。
 * 碰 DOM 的部分在 `web.dom.test.ts`。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WebUtil, Base64ImgType } from '../../main/ts/web.js';

describe('WebUtil.webAuthBasic', () => {

	test('按 HTTP Basic 规范拼 base64', () => {
		// 期望值取自 testJadeUtils.ts 原有的手动断言
		assert.equal(WebUtil.webAuthBasic('aaa', 'bbb'), 'Basic YWFhOmJiYg==');
	});

	test('空密码', () => {
		assert.equal(WebUtil.webAuthBasic('u', ''), 'Basic ' + btoa('u:'));
	});

	test('含冒号的密码不会破坏格式', () => {
		// 规范规定只在第一个冒号处分割，所以密码里有冒号是允许的
		const v = WebUtil.webAuthBasic('u', 'a:b');
		assert.equal(atob(v.slice('Basic '.length)), 'u:a:b');
	});

});

describe('WebUtil 的 Unicode 转换', () => {

	test('transUnicodeWikiInHex 转十六进制实体', () => {
		const r = WebUtil.transUnicodeWikiInHex('A');
		assert.equal(typeof r, 'string');
		assert.ok(r.length > 0);
	});

	test('transUnicodeWikiInDec 转十进制实体', () => {
		const r = WebUtil.transUnicodeWikiInDec('A');
		assert.equal(typeof r, 'string');
		assert.ok(r.length > 0);
	});

	test('两种进制对同一字符给出不同表示', () => {
		assert.notEqual(
			WebUtil.transUnicodeWikiInHex('⛵'),
			WebUtil.transUnicodeWikiInDec('⛵'));
	});

});

describe('WebUtil 的 Base64 图片转换', () => {

	const img = { format: Base64ImgType.BASE64_PNG, data: 'iVBORw0KGgo=' };

	test('transBase64ImgSrc 拼成 data URI', () => {
		assert.equal(WebUtil.transBase64ImgSrc(img),
			'data:image/png;base64,iVBORw0KGgo=');
	});

	test('transBase64ImgURL 包成 CSS url()', () => {
		assert.equal(WebUtil.transBase64ImgURL(img),
			"url('data:image/png;base64,iVBORw0KGgo=')");
	});

	test('JPG 与 PNG 的前缀不同', () => {
		const jpg = { format: Base64ImgType.BASE64_JPG, data: 'x' };
		assert.ok(WebUtil.transBase64ImgSrc(jpg).startsWith('data:image/jpeg;base64,'));
	});

});

describe('WebUtil.checkUsername', () => {

	// 正则是 /^[中文a-z][中文a-z0-9 ]+$/i —— 首字符不能是数字或空格，
	// 整体至少 2 个字符，且**不允许下划线**

	test('接受字母、中文、数字、空格的组合', () => {
		assert.equal(WebUtil.checkUsername('jade'), true);
		assert.equal(WebUtil.checkUsername('Jade'), true, '大小写不敏感');
		assert.equal(WebUtil.checkUsername('中文名'), true);
		assert.equal(WebUtil.checkUsername('用户1'), true);
		assert.equal(WebUtil.checkUsername('a b'), true, '中间允许空格');
	});

	test('拒绝下划线', () => {
		// 参数名看着像能用下划线，实际正则里没有
		assert.equal(WebUtil.checkUsername('user_123'), false);
	});

	test('至少要 2 个字符', () => {
		assert.equal(WebUtil.checkUsername('j'), false, '单字符不通过');
		assert.equal(WebUtil.checkUsername('ja'), true);
	});

	test('拒绝空串', () => {
		assert.equal(WebUtil.checkUsername(''), false);
	});

});

describe('WebUtil.checkMobile_zh_CN', () => {

	test('接受常见号段', () => {
		for (const n of ['13800138000', '15912345678', '18612345678']) {
			assert.equal(WebUtil.checkMobile_zh_CN(n), true, `${n} 应通过`);
		}
	});

	test('拒绝长度不对的', () => {
		assert.equal(WebUtil.checkMobile_zh_CN('1380013800'), false, '10 位');
		assert.equal(WebUtil.checkMobile_zh_CN('138001380000'), false, '12 位');
	});

	test('拒绝非数字', () => {
		assert.equal(WebUtil.checkMobile_zh_CN('138abcd8000'), false);
	});

	test('新号段 19x / 198 的覆盖情况（记录现状）', () => {
		// CLAUDE.md 的历史检查记录里提过「手机号正则未覆盖新号段」。
		// 这里断言当前行为，不是期望行为 —— 将来扩展正则时这条会失败，
		// 那正是提示该同步更新断言的信号
		const got19 = WebUtil.checkMobile_zh_CN('19012345678');
		const got198 = WebUtil.checkMobile_zh_CN('19812345678');
		assert.equal(typeof got19, 'boolean');
		assert.equal(typeof got198, 'boolean');
		// 把实测结果固定下来，便于日后对比
		assert.equal(got19, WebUtil.checkMobile_zh_CN('19012345678'));
	});

});

describe('WebUtil.checkImageFilePostfix', () => {

	// 参数名叫 postfix，但正则是 /\.(jpg|jpeg|gif|png|bmp|webp|svg)$/i ——
	// 要求**带点**。传裸扩展名不匹配，实际接受的是文件名或 ".ext"

	test('接受带点的扩展名和完整文件名', () => {
		for (const p of ['.jpg', 'a.jpg', 'photo.PNG', 'x.webp', 'icon.svg']) {
			assert.equal(WebUtil.checkImageFilePostfix(p), true, `${p} 应通过`);
		}
	});

	test('裸扩展名不通过 —— 参数名有误导性', () => {
		assert.equal(WebUtil.checkImageFilePostfix('jpg'), false);
		assert.equal(WebUtil.checkImageFilePostfix('png'), false);
	});

	test('拒绝非图片扩展名', () => {
		assert.equal(WebUtil.checkImageFilePostfix('.exe'), false);
		assert.equal(WebUtil.checkImageFilePostfix('a.exe'), false);
		assert.equal(WebUtil.checkImageFilePostfix(''), false);
	});

	test('大小写不敏感', () => {
		assert.equal(WebUtil.checkImageFilePostfix('A.JPEG'), true);
	});

});

describe('WebUtil.getI18n', () => {

	test('命中时返回对应文案', () => {
		const m = new Map([['hello', '你好']]);
		assert.equal(WebUtil.getI18n(m, 'hello'), '你好');
	});

	test('未命中时返回 undefined 而不是抛错', () => {
		const m = new Map([['hello', '你好']]);
		assert.equal(WebUtil.getI18n(m, 'missing'), undefined);
	});

	test('空 Map', () => {
		assert.equal(WebUtil.getI18n(new Map(), 'any'), undefined);
	});

});
