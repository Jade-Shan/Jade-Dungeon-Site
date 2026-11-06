/**
 * 切分边界的架构约束（跨 common-utils/ 与 site-page/）
 *
 * 阶段 2 把代码切成 `common-utils/`（公用库）和 `site-page/`（站点）两块，
 * 见 `docs/refactor-20261101.md` 第 18 节的 16 条决定。
 *
 * **目录切开之后，大部分约束由类型系统自己保证了** ——
 * `common-utils/tsconfig.json` 的 `include` 只有 `src`，库侧根本看不见 `site-page/`。
 * 这个文件盯的是类型系统**看不出来**的那几条：
 *
 * - 库侧有没有用相对路径偷偷引用 `../web/`（能绕过包名解析）
 * - 库侧有没有出现全局脚本变量（配了 `declare` 就能编过）
 * - site-page 侧引用库是不是统一走包名，没有混用相对路径
 * - 库的 `exports` 和实际文件对不对得上
 *
 * **20 条**（2026-11-03 从 22 条减到 20）——
 * 删掉的两条都是关于「页面指向 docs/ 的链接」的，
 * `index.html` 改用写死的绝对 URL 之后一条空转、一条假通过，
 * 见 `docs/refactor-20261101.md` 27.2 节。
 *
 * 这是本仓库唯一一个**测源码而不测编译产物**的测试文件
 * （其余都测各自 `.test-build/` 下的产物，见 12.2 节）——
 * 因为约束本身是关于源码结构和配置的。
 *
 * 跑法：`npm run test:arch`（根上），它有独立的 `tsconfig.arch.json`。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 仓库根
 *
 * 用 `process.cwd()` 而不是 `import.meta.dirname` —— 本项目的 `module`
 * 是 `ES6`，TS 不允许 `import.meta`（TS1343）。`npm run test:arch`
 * 从仓库根跑，所以 cwd 就是仓库根。
 */
const ROOT = process.cwd();
const LIB_SRC = path.join(ROOT, 'common-utils/src/main/ts');
const WEB_SRC = path.join(ROOT, 'site-page/src/main/ts');

/** 库的包名 */
const PKG = '@jade-dungeon/jade-utils';

/** 全局脚本变量。库侧不该出现 */
const GLOBAL_LIBS = ['SyntaxHighlighter', 'MathJax', 'showdown'];

/** 递归列出某目录下的 `.ts`（不含 `.d.ts`），路径相对该目录、用 `/` 分隔 */
function listTs(base: string, dir: string = base): Array<string> {
	if (!fs.existsSync(dir)) { return []; }
	const out: Array<string> = [];
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) { out.push(...listTs(base, p)); }
		else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
			out.push(path.relative(base, p).split(path.sep).join('/'));
		}
	}
	return out;
}

/** 读文件，顺便去掉整行注释（避免注释里提到类名被误判成依赖） */
function codeOf(base: string, rel: string): string {
	const txt = fs.readFileSync(path.join(base, rel), 'utf8');
	return txt.split('\n')
		.filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l))
		.join('\n');
}

/** 取一个文件里所有 import 的来源字符串（含相对路径和包名） */
function importSpecs(base: string, rel: string): Array<string> {
	const txt = fs.readFileSync(path.join(base, rel), 'utf8');
	return [...txt.matchAll(/^\s*import\s[^;]*?from\s*['"]([^'"]+)['"]/gm)]
		.map(m => m[1]);
}

describe('库侧（common-utils/）的边界', () => {

	test('不用相对路径引用 site-page/', () => {
		// 类型系统拦不住这个：`../../site-page/src/xxx.js` 是合法的相对路径，
		// 只要文件存在就能编过。而它会让库依赖站点代码
		const bad: Array<string> = [];
		for (const f of listTs(LIB_SRC)) {
			for (const s of importSpecs(LIB_SRC, f)) {
				if (s.startsWith('.') && s.includes('site-page/')) {
					bad.push(`${f} → ${s}`);
				}
			}
		}
		assert.deepEqual(bad, [],
			`库侧出现了指向 web 的相对 import：\n  ${bad.join('\n  ')}`);
	});

	test('不 import 库自己的包名（应该用相对路径）', () => {
		// 库内部引用自己要用相对路径。写包名会绕一圈 node_modules 符号链接
		// 回到自己，产生一份重复的模块实例 —— 注册表那种模块级单例会失效
		const bad: Array<string> = [];
		for (const f of listTs(LIB_SRC)) {
			for (const s of importSpecs(LIB_SRC, f)) {
				if (s.startsWith(PKG)) { bad.push(`${f} → ${s}`); }
			}
		}
		assert.deepEqual(bad, [],
			`库内部应该用相对路径，不该走包名：\n  ${bad.join('\n  ')}`);
	});

	test('不依赖任何全局脚本变量', () => {
		// 决定 6 把 3rdLibTool 拆两半就是为了这一条。
		// 配了 declare 之后类型系统查不出来，所以要测
		const bad: Array<string> = [];
		for (const f of listTs(LIB_SRC)) {
			const code = codeOf(LIB_SRC, f);
			for (const g of GLOBAL_LIBS) {
				if (code.includes(g)) { bad.push(`${f} 用了 ${g}`); }
			}
			if (/[^\w$]\$\(/.test(code)) { bad.push(`${f} 用了 jQuery 的 $()`); }
		}
		assert.deepEqual(bad, [],
			`库侧出现了全局脚本依赖：\n  ${bad.join('\n  ')}`);
	});

	test('没有 test*.ts（demo 脚本都归了 site-page）', () => {
		// 决定 8：库是纯 TypeScript 库，零 HTML、零 demo 脚本
		const t = listTs(LIB_SRC).filter(f => path.basename(f).startsWith('test'));
		assert.deepEqual(t, [], `这些该在 site-page 侧：${t.join(', ')}`);
	});

});

describe('site-page 侧（site-page/）引用库的方式', () => {

	test('引用库统一走包名，不用相对路径', () => {
		// 混用的话有两份库代码进产物，模块级单例（如资源注册表）会失效
		const bad: Array<string> = [];
		for (const f of listTs(WEB_SRC)) {
			for (const s of importSpecs(WEB_SRC, f)) {
				if (s.startsWith('.') && s.includes('common-utils/')) {
					bad.push(`${f} → ${s}`);
				}
			}
		}
		assert.deepEqual(bad, [],
			`site-page 侧应该用包名引用库：\n  ${bad.join('\n  ')}`);
	});

	test('用到的包名子路径都在库的 exports 里', () => {
		// 写错子路径名的话浏览器端要到运行时才报 404，
		// 而 tsc 走的是 node_modules 符号链接，本地能过
		const pkg = JSON.parse(
			fs.readFileSync(path.join(ROOT, 'common-utils/package.json'), 'utf8'));
		const valid = new Set(
			Object.keys(pkg.exports).map((s: string) =>
				s === '.' ? PKG : PKG + s.slice(1)));
		const bad: Array<string> = [];
		for (const f of listTs(WEB_SRC)) {
			for (const s of importSpecs(WEB_SRC, f)) {
				if (s.startsWith(PKG) && !valid.has(s)) {
					bad.push(`${f} → ${s}`);
				}
			}
		}
		assert.deepEqual(bad, [],
			`这些子路径不在库的 exports 里：\n  ${bad.join('\n  ')}`);
	});

	test('确实在用库（自检：方向判断没写反）', () => {
		let n = 0;
		for (const f of listTs(WEB_SRC)) {
			n += importSpecs(WEB_SRC, f).filter(s => s.startsWith(PKG)).length;
		}
		assert.ok(n > 20,
			`web 应该有很多处引用库，实际只有 ${n} 处，解析逻辑可能坏了`);
	});

});

describe('页面引用资源时用对了 root', () => {

	/**
	 * 两边的产物部署到不同路径（第 18 节决定 12），页面侧对应两个变量：
	 *
	 *   `@@libRoot`     → 库的产物（themes/window-ui 的样式）
	 *   `@@staticRoot`  → site-page 的产物（blog/workout/trpg/site 主题）
	 *
	 * **用错了的话 dev 环境可能看不出来** —— 两个变量填同一个值时
	 * 哪个都能解析到。只有真的分开部署（如 jadeutils.v5 / jadesites.v5）
	 * 才会 404。这正是实际踩到的：18.13 节写了那 3 处要改成 `@@libRoot`，
	 * 但当时没改，而验证脚本把两个 webroot 合成一棵树查「文件在不在」，
	 * 所以查不出来。
	 *
	 * 这里直接查源码模板里的 `@@xxxRoot`，不依赖构建产物。
	 */

	/** 库侧 themes 下有哪些子目录 —— 这些必须走 libRoot */
	function libThemeDirs(): Array<string> {
		const d = path.join(ROOT, 'common-utils/src/main/themes');
		return fs.existsSync(d)
			? fs.readdirSync(d, { withFileTypes: true })
				.filter(e => e.isDirectory()).map(e => e.name)
			: [];
	}

	/** site-page 侧 themes 下有哪些子目录 —— 这些必须走 staticRoot */
	function siteThemeDirs(): Array<string> {
		const d = path.join(ROOT, 'site-page/src/main/themes');
		return fs.existsSync(d)
			? fs.readdirSync(d, { withFileTypes: true })
				.filter(e => e.isDirectory()).map(e => e.name)
			: [];
	}

	/** 列出 html 模板里所有 `@@<root>/themes/<dir>` 引用 */
	function themeRefs(): Array<{ file: string, root: string, dir: string }> {
		const out: Array<{ file: string, root: string, dir: string }> = [];
		const base = path.join(ROOT, 'site-page/src/main/html');
		const walk = (d: string) => {
			for (const e of fs.readdirSync(d, { withFileTypes: true })) {
				const p = path.join(d, e.name);
				if (e.isDirectory()) { walk(p); continue; }
				if (!e.name.endsWith('.html')) { continue; }
				const txt = fs.readFileSync(p, 'utf8');
				for (const m of txt.matchAll(/@@(\w+Root)\/themes\/([\w.-]+)/g)) {
					out.push({ file: e.name, root: m[1], dir: m[2] });
				}
			}
		};
		walk(base);
		return out;
	}

	test('库的主题走 @@libRoot', () => {
		const lib = new Set(libThemeDirs());
		const bad = themeRefs()
			.filter(r => lib.has(r.dir) && r.root !== 'libRoot')
			.map(r => `${r.file}: @@${r.root}/themes/${r.dir}`);
		assert.deepEqual(bad, [],
			`这些引用的是库的主题，必须走 @@libRoot：\n  ${bad.join('\n  ')}`);
	});

	test('site-page 的主题走 @@staticRoot', () => {
		const site = new Set(siteThemeDirs());
		const lib = new Set(libThemeDirs());
		const bad = themeRefs()
			// 两边同名的目录不判（目前没有）
			.filter(r => site.has(r.dir) && !lib.has(r.dir)
				&& r.root !== 'staticRoot')
			.map(r => `${r.file}: @@${r.root}/themes/${r.dir}`);
		assert.deepEqual(bad, [],
			`这些引用的是 site-page 的主题，必须走 @@staticRoot：\n  ${bad.join('\n  ')}`);
	});

	test('两边的 themes 子目录没有同名的', () => {
		// 有同名的话上面两条判不了，得先解决命名冲突
		const dup = libThemeDirs().filter(d => siteThemeDirs().includes(d));
		assert.deepEqual(dup, [],
			`两边有同名主题目录，页面引用无法按名字判断该走哪个 root：${dup.join(', ')}`);
	});

	test('site-page/envs.js 的两个 root 都有定义', () => {
		// 缺 libRoot 的话 @@libRoot 会被原样留在产物里，变成坏链。
		// 配置在 site-page/ 下 —— 只有它的 gulpfile require envs（21.4 选项 1）
		const p = path.join(ROOT, 'site-page/envs.js');
		if (!fs.existsSync(p)) { return; }   // 它在 .gitignore 里，CI 上可能没有
        const txt = fs.readFileSync(p, 'utf8');
		for (const k of ['staticRoot', 'libRoot', 'importMapRoot',
			'libImportMapRoot']) {
			assert.ok(new RegExp('\\b' + k + '\\s*:').test(txt),
				`envs.js 缺 ${k} —— 页面里的 @@${k} 会原样留在产物里`);
		}
	});

	/**
	 * 只查 `dev` 段。
	 *
	 * **`rls` 段不查,也不维护** —— 生产环境的配置永远不进本仓库,
	 * 生产的工作流与项目源码无关（它自己注入 `envs.js`）。
	 * 所以 `rls` 里是什么值都不影响本项目的检查与编译,
	 * 别给它加约束、也别因为它「看起来没填」去补。
	 * 见 docs/refactor-20261101.md 24 节。
	 *
	 * 按文本解析而不是 `require` —— 测试产物是 ESM，没有 `require`。
	 */
	test('envs.js 的 dev 段齐全，没有 TODO 占位', () => {
		const p = path.join(ROOT, 'site-page/envs.js');
		if (!fs.existsSync(p)) { return; }   // 在 .gitignore 里，CI 上可能没有
		const txt = fs.readFileSync(p, 'utf8');
		const KEYS = ['buildversion', 'webRoot', 'staticRoot', 'libRoot',
			'importMapRoot', 'libImportMapRoot', 'apiRoot', 'cdnRoot', 'cdn3rd'];

		// 取 `dev: {` 到配平的 `}` 之间那一段
		const start = txt.search(/\bdev\s*:\s*\{/);
		assert.ok(start >= 0, 'site-page/envs.js 缺 dev 段');
		let depth = 0, end = start;
		for (let i = txt.indexOf('{', start); i < txt.length; i++) {
			if (txt[i] === '{') { depth++; }
			else if (txt[i] === '}') { depth--; if (!depth) { end = i; break; } }
		}
		const body = txt.slice(start, end);

		const miss = KEYS.filter(k =>
			!new RegExp('\\b' + k + '\\s*:\\s*["\']').test(body));
		assert.deepEqual(miss, [],
			`envs.js 的 dev 段缺这些键：${miss.join(', ')}`
			+ ` —— 页面里对应的 @@xxx 会原样留在产物里`);

		const todo = KEYS.filter(k => new RegExp(
			'\\b' + k + '\\s*:\\s*["\'][^"\']*TODO').test(body));
		assert.deepEqual(todo, [],
			`envs.js 的 dev 段这些键还是 TODO 占位：${todo.join(', ')}`);
	});

});

describe('window-ui 对 98.css 的依赖', () => {

	/**
	 * `desktop.less` 直接用 98.css 的 CSS 变量，而 98.css 是**可选**的
	 * peer 依赖 —— 少一个变量不会让构建失败，`var()` 只是静默回退到继承值。
	 *
	 * 实际踩到的（20.8 节）：`color: var(--text-color)` 没写兜底，
	 * 而 `--text-color` 是 0.1.19 才加的。按当时以为的「CDN 上是 0.1.18」
	 * 去把 `peerDependencies` 放到 `^0.1.18`，就会把下界放到一个
	 * **二级菜单白底白字**的版本上。
	 *
	 * **这条用例查的是「本地装的那版有没有」**，查不出
	 * 「`peerDependencies` 的下界那版有没有」—— 本地装的（^0.1.21）
	 * 比声明的下界（^0.1.19）新。要查下界得真去装那一版，
	 * 代价不值。加新变量时请手动确认它是哪版引入的。
	 */

	test('desktop.less 用到的 CSS 变量，98.css 里都有', () => {
		const less = path.join(ROOT,
			'common-utils/src/main/themes/window-ui/styles/desktop.less');
		const css = path.join(ROOT, 'node_modules/98.css/style.css');
		// 98.css 是可选 peer 依赖，没装就跳过
		if (!fs.existsSync(css)) { return; }

		const txt = fs.readFileSync(less, 'utf8');
		// desktop.less 自己定义的不算外部依赖
		const own = new Set(Array.from(txt.matchAll(/(--[\w-]+)\s*:/g),
			m => m[1]));
		const used = new Set(Array.from(txt.matchAll(/var\((--[\w-]+)/g),
			m => m[1]));

		const theirs = new Set(Array.from(
			fs.readFileSync(css, 'utf8').matchAll(/(--[\w-]+)\s*:/g),
			m => m[1]));

		const missing = Array.from(used)
			.filter(v => !own.has(v) && !theirs.has(v));
		assert.deepEqual(missing, [],
			`desktop.less 用了 98.css 里没有的变量：${missing.join(', ')}\n`
			+ `  —— var() 不会报错，只会静默回退成继承值。`
			+ `要么写兜底值 var(${missing[0]}, xxx)，`
			+ `要么提高 peerDependencies 的下界`);
	});

});

describe('HTML 页面用片段而不是手写', () => {

	/**
	 * 6.3 把 `head.html` 拆成片段，目的是让那 9 个「各写一套 head」的
	 * demo 页按需组合。但片段建好之后**页面没跟着改** ——
	 * 只有 1 个页面在用，其余 8 个照旧手写，33 处重复。
	 * 片段存在 ≠ 有人用它，这条用例盯的是后半句。
	 *
	 * 查源码模板里有没有「本该用片段却手写」的行。
	 */

	/** 片段名 → 它负责的内容特征（出现在页面里就说明是手写的） */
	const OWNED: Array<[string, RegExp]> = [
		['meta-charset',            /<meta\s+charset=/],
		['favicon',                 /rel="icon"/],
		['vendor-jquery',           /@@v-jquery/],
		['vendor-bootstrap',        /@@v-bootstrap\/css\/bootstrap\.min\.css/],
		['vendor-bootstrap-theme',  /bootstrap-theme\.min\.css/],
		['vendor-datatable',        /@@v-datatable/],
		['vendor-syntaxhighlighter', /@@v-syntaxhighlighter/],
		['vendor-showdown',         /@@v-showdown/],
		['vendor-mathjax',          /@@v-mathjax/],
		['vendor-98css',            /@@v-98css/],
		['theme-window-ui',         /themes\/window-ui\/styles/],
		['theme-workout',           /themes\/workout\/styles/],
		['theme-blog',              /themes\/blog\/[\w-]+\/styles/],
	];

	/** head.html 会间接带进来的片段 */
	const VIA_HEAD = new Set(['meta-charset', 'meta-page', 'favicon',
		'importmap', 'vendor-jquery', 'vendor-bootstrap', 'vendor-datatable',
		'vendor-syntaxhighlighter', 'vendor-showdown', 'vendor-mathjax',
		'vendor-98css', 'theme-blog', 'theme-window-ui', 'theme-workout']);

	test('没有页面手写片段已经管了的东西', () => {
		const base = path.join(ROOT, 'site-page/src/main/html');
		const bad: Array<string> = [];
		const walk = (d: string) => {
			for (const e of fs.readdirSync(d, { withFileTypes: true })) {
				const p = path.join(d, e.name);
				if (e.isDirectory()) {
					if (e.name !== 'parts') { walk(p); }   // 片段自己不算页面
					continue;
				}
				if (!e.name.endsWith('.html')) { continue; }
				const txt = fs.readFileSync(p, 'utf8');
				const inc = new Set(Array.from(
					txt.matchAll(/parts\/([\w.-]+)\.html/g), m => m[1]));
				if (inc.has('head')) {
					for (const f of VIA_HEAD) { inc.add(f); }
				}
				// 把 include 那几行摘掉再查，免得 include 自己被当成手写
				const body = txt.replace(/@@include\([^)]*\)/g, '');
				for (const [frag, pat] of OWNED) {
					if (inc.has(frag)) { continue; }
					if (pat.test(body)) {
						bad.push(`${e.name}: 手写了 ${frag} 管的内容`);
					}
				}
			}
		};
		walk(base);
		assert.deepEqual(bad, [],
			`这些页面该用 parts/ 下的片段，不要手写：\n  ${bad.join('\n  ')}\n`
			+ `  —— 手写的那份不会跟着 envs.js 的版本号走，升级库时会漏`);
	});

});

describe('部署模型：两个 CDN 各自独立', () => {

	/**
	 * 这一组原来有 3 条，**2026-11-03 删掉了两条关于文档链接的**
	 * （见 docs/refactor-20261101.md 27.2 节）：
	 *
	 * - ~~链接指向的文档文件存在~~ —— `index.html` 那 5 条文档链接改成了
	 *   写死的绝对 URL（`http://...:8081/jadesites.v5/docs/xxx.md`），
	 *   而这条用例是按**相对路径**解析的（正则 `[^"#:]*` 排除了含 `:` 的串），
	 *   改完之后它一个链接都匹配不到，等于空转
	 * - ~~`site-page/build.sh` 把库的文档拷进自己的产物~~ ——
	 *   它的正则**没排注释行**，所以那行 `cp` 被注释掉时照样「通过」。
	 *   是个假通过，不如没有
	 *
	 * 留下的这条查的是部署模型本身（根上不该恢复合并树），和文档链接无关。
	 */

	test('build.sample.sh 不再合并两边的产物', () => {
		// 两边发到不同的 CDN（第 22 节），根上那棵合并树已经删掉。
		// 恢复合并会让「@@libRoot / @@staticRoot 用错了」重新变成
		// 不可观测的问题 —— 合并之后哪个 root 都能解析到（19.8 节踩过）
		const txt = fs.readFileSync(path.join(ROOT, 'build.sample.sh'), 'utf8');
		const live = txt.split('\n')
			.filter(l => !/^\s*#/.test(l))        // 注释不算
			.join('\n');
		const bad = [
			/cp\s+-r\s+common-utils\/webroot\/\*\s+webroot\//,
			/cp\s+-r\s+site-page\/webroot\/\*\s+webroot\//,
			/^\s*mkdir\s+-p\s+webroot\s*$/m,
		].filter(re => re.test(live));
		assert.deepEqual(bad.map(String), [],
			'build.sample.sh 又在往根 webroot/ 合并产物了 ——'
			+ ' 两边现在各自发到不同的 CDN，根上不该有合并树');
	});

});

describe('构建顺序：库先 build:pkg', () => {

	/**
	 * site-page 用包名 import 库，解析链四环：
	 *
	 *   node_modules/@jade-dungeon/jade-utils   ← npm install 建的符号链接
	 *     → common-utils/package.json 的 exports（types 字段）
	 *       → common-utils/dist/*.d.ts          ← **build:pkg 生成的**
	 *         → tsc 拿到类型
	 *
	 * 前两环现成，只有 `dist/` 是产物 —— 所以**编译 site-page 之前
	 * 库必须先 `build:pkg`**。顺序反了报 185 个错，其中只有 31 个
	 * TS2307 指向真正的原因，131 个 TS2339 会把人带去查业务代码。
	 *
	 * 这条用例查的是**脚本里的顺序声明**，不实际跑构建。
	 */

	test('根上的 build 脚本把 build:pkg 排在 site-page 之前', () => {
		const pkg = JSON.parse(
			fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
		const build = pkg.scripts?.build as string | undefined;
		assert.ok(build, '根 package.json 缺 build script');
		const iLib = build.indexOf('common-utils');
		const iWeb = build.indexOf('site-page');
		assert.ok(iLib >= 0 && iWeb >= 0,
			`build script 没有同时构建两边：${build}`);
		assert.ok(iLib < iWeb,
			`build script 把 site-page 排在了 common-utils 之前：${build}`
			+ ' —— site-page 编译要用库的 dist/*.d.ts');
	});

	test('build.sample.sh 先 build:pkg 再构建 site-page', () => {
		const txt = fs.readFileSync(path.join(ROOT, 'build.sample.sh'), 'utf8');
		const live = txt.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
		const iPkg = live.search(/npm\s+run\s+build:pkg/);
		const iWeb = live.search(/bash\s+site-page\/build\.sh/);
		assert.ok(iPkg >= 0, 'build.sample.sh 里没有 build:pkg');
		assert.ok(iWeb >= 0, 'build.sample.sh 里没有跑 site-page/build.sh');
		assert.ok(iPkg < iWeb,
			'build.sample.sh 把 site-page/build.sh 排在了 build:pkg 之前'
			+ ' —— 站点编译要用库的 dist/*.d.ts');
	});

	test('exports 的 types 字段都指向 dist 下的 .d.ts', () => {
		// 这是解析链的第 ② 环。types 写错或只写 default，
		// tsc 拿不到类型，site-page 会报一片 TS2307 + TS2339
		const pkg = JSON.parse(
			fs.readFileSync(path.join(ROOT, 'common-utils/package.json'), 'utf8'));
		const bad: Array<string> = [];
		for (const [sub, v] of Object.entries(pkg.exports ?? {})) {
			const e = v as Record<string, string>;
			if (typeof e !== 'object' || !e.types) {
				bad.push(`${sub}: 缺 types 字段`);
			} else if (!/^\.\/dist\/.*\.d\.ts$/.test(e.types)) {
				bad.push(`${sub}: types 不是 ./dist/*.d.ts（是 ${e.types}）`);
			}
		}
		assert.deepEqual(bad, [],
			`这些 exports 的 types 字段有问题：\n  ${bad.join('\n  ')}`);
	});

});

describe('库的 exports 与实际文件', () => {

	test('每条 exports 都指向真实存在的源文件', () => {
		// exports 指的是 dist/ 下的产物，这里回推到 src/ 看源文件在不在。
		// 漏建文件或改名忘了同步时，npm 消费方会拿到解析失败的子路径
		const pkg = JSON.parse(
			fs.readFileSync(path.join(ROOT, 'common-utils/package.json'), 'utf8'));
		const bad: Array<string> = [];
		for (const [sub, cond] of Object.entries(pkg.exports)) {
			const file = typeof cond === 'string'
				? cond : (cond as { default: string }).default;
			const m = /^\.\/dist\/(.+)\.js$/.exec(file);
			if (!m) { bad.push(`${sub} 的路径格式不对: ${file}`); continue; }
			const src = path.join(LIB_SRC, m[1] + '.ts');
			if (!fs.existsSync(src)) {
				bad.push(`${sub} → 源文件不存在: common-utils/src/${m[1]}.ts`);
			}
		}
		assert.deepEqual(bad, [], `exports 与实际文件不符：\n  ${bad.join('\n  ')}`);
	});

	test('库侧每个源文件都有对应的 exports 子路径', () => {
		// 反向检查：新增模块忘了加 exports 的话，CDN 的 import map
		// 里就没有它（映射表从 exports 派生，见 9.2 节），页面 import 会失败
		const pkg = JSON.parse(
			fs.readFileSync(path.join(ROOT, 'common-utils/package.json'), 'utf8'));
		const exported = new Set<string>();
		for (const cond of Object.values(pkg.exports)) {
			const file = typeof cond === 'string'
				? cond : (cond as { default: string }).default;
			const m = /^\.\/dist\/(.+)\.js$/.exec(file);
			if (m) { exported.add(m[1]); }
		}
		// env.demo.ts 刻意不在 exports 里（demo 专用，见第 11 节）
		const SKIP = new Set(['env.demo']);
		const missing = listTs(LIB_SRC)
			.map(f => f.slice(0, -3))
			.filter(m => !exported.has(m) && !SKIP.has(m));
		assert.deepEqual(missing, [],
			`这些库模块没有 exports 子路径，CDN 的 import map 里会缺：${missing.join(', ')}`);
	});

});
