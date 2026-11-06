// site-page 项目的 CDN 构建
//
// 三条链都要：blog/workout 主题的 Less、trpg/site 图片拷贝、TypeScript 编译、
// HTML 模板展开 + import map 生成。
// 库只需要 TS + window-ui 主题，在 common-utils/gulpfile.js 里
// （见 docs/refactor-20261101.md 第 18 节的决定 15）。

const gulp        = require('gulp');
const less        = require('gulp-less');
const minifycss   = require('gulp-minify-css');
const ts          = require('gulp-typescript');
const sourcemaps  = require('gulp-sourcemaps');
const uglify      = require('gulp-uglify-es').default;
const rename      = require('gulp-rename');
const concat      = require('gulp-concat');
const clean       = require('gulp-clean');
const fileinclude = require('gulp-file-include');
const processhtml = require('gulp-processhtml');
const envs        = require('./envs');
const fs          = require('fs');

const themes = ['hobbit', 'lo-fi', 'paper-print'];
const themeTasks = [];

/* 三套内容主题和它们共用的 theme-core/ 都在 themes/blog/ 下，产物同构。
 * 目录分组见第 17 节，theme-core 的两层拆分见第 19 节。
 */
/* 源和产物的路径前缀不同,所以分两个常量 ——
 * 源码在 src/main/themes/ 下（Maven 风格的目录,见第 23 节）,
 * 而产物里不带 src/main 这一层,仍是 webroot/themes/。
 * 合成一个常量会让产物变成 webroot/src/main/themes/。
 */
const blogThemeSrc = 'src/main/themes/blog/';
const blogThemeDst = 'webroot/themes/blog/';

// =======================
// 内容主题（blog）
// =======================

themes.forEach((theme) => {

	const imageTsk = 'process-images-' + theme;
	const imageSrc = blogThemeSrc + theme + '/images/';
	const imageDst = blogThemeDst + theme + '/images/';
	gulp.task(imageTsk, gulp.series(
		() => gulp.src([imageDst + '*'], { read: false, allowEmpty: true })
			.pipe(clean()),
		() => gulp.src([imageSrc + '**/*']).pipe(gulp.dest(imageDst))
	));
	themeTasks.push(imageTsk);

	const styleTsk = 'process-style-' + theme;
	const styleThemesSrc = blogThemeSrc + theme;
	const styleThemesDst = blogThemeDst + theme;
	gulp.task(styleTsk, gulp.series(
		() => gulp.src([styleThemesDst + '/styles/*'],
			{ read: false, allowEmpty: true }).pipe(clean()),
		() => gulp.src([styleThemesSrc + '/images/**/*'])
			.pipe(gulp.dest(styleThemesDst + '/images/')),
		() => {
			/* 只编译 index.less 一个入口，**不再用 concat**。
			 *
			 * 加载顺序写在 index.less 里的显式 @import 中：
			 *   theme-core/variables.less（默认值）
			 *   → 本主题的 part.1.less（覆盖）
			 *   → theme-core/structure.less（应用结构）
			 *
			 * 切分前这里是 concat 两个 glob，顺序靠文件名排序凑出来 ——
			 * 一旦 comm.less 开始定义默认值，Less 的「最后赋值生效」
			 * 就会让默认值盖掉主题的覆盖值（2.4 节记的坑）。
			 * 换成 @import 之后顺序由文件内容决定，不再依赖排序。
			 * 落地记录见 docs/refactor-20261101.md 第 19 节。
			 *
			 * 产出仍叫 all.css / all.min.css，页面引用不用改。
			 */
			return gulp.src([styleThemesSrc + '/styles/index.less'])
				.pipe(less({ compress: false })).on('error', (e) => { console.log(e); })
				.pipe(rename('all.css'))
				.pipe(gulp.dest(styleThemesDst + '/styles/'))
				.pipe(minifycss()).pipe(rename({ suffix: '.min' }))
				.pipe(gulp.dest(styleThemesDst + '/styles/'));
		}
	));
	themeTasks.push(styleTsk);

});

// =======================
// workout 主题
// =======================

gulp.task('process-style-workout', gulp.series(
	() => gulp.src(['webroot/themes/workout/images/*'],
		{ read: false, allowEmpty: true }).pipe(clean()),
	() => gulp.src(['src/main/themes/workout/images/**/*'])
		.pipe(gulp.dest('webroot/themes/workout/images/')),
	() => gulp.src(['webroot/themes/workout/styles/**/*.less'],
		{ read: false, allowEmpty: true }).pipe(clean()),
	/* workout 只有一个 muscle.less，不走 theme-core 的变量体系
	 * （它只有 7 行配色，没有可复用的结构层）。
	 * 原来这里也 concat 过一道，但单文件 concat 等于改个名 ——
	 * 和 blog 主题一样改用 rename，少一个 pipe。产物不变。
	 */
	() => gulp.src(['src/main/themes/workout/styles/muscle.less'])
		.pipe(less({ compress: false })).on('error', (e) => { console.log(e); })
		.pipe(rename('all.css'))
		.pipe(gulp.dest('webroot/themes/workout/styles/'))
		.pipe(minifycss()).pipe(rename({ suffix: '.min' }))
		.pipe(gulp.dest('webroot/themes/workout/styles/'))
));
themeTasks.push('process-style-workout');

// =======================
// trpg 与 site（纯图片，无 Less）
//
// site/ 是站点级资源分组，目前只有 favicon.ico ——
// 它原来在库的 themes/window-ui/images/ 下，第 18 节决定 13 挪过来的
// =======================

gulp.task('process-style-trpg', gulp.series(
	() => gulp.src(['webroot/themes/trpg/images/*'],
		{ read: false, allowEmpty: true }).pipe(clean()),
	() => gulp.src(['src/main/themes/trpg/images/*'])
		.pipe(gulp.dest('webroot/themes/trpg/images/'))
));
themeTasks.push('process-style-trpg');

gulp.task('process-style-site', gulp.series(
	() => gulp.src(['webroot/themes/site/images/*'],
		{ read: false, allowEmpty: true }).pipe(clean()),
	() => gulp.src(['src/main/themes/site/images/*'])
		.pipe(gulp.dest('webroot/themes/site/images/'))
));
themeTasks.push('process-style-site');

// =======================
// TypeScript
// =======================

const tsProject = ts.createProject('tsconfig.json');
const scriptTsTag = 'webroot/scripts/ts/';

gulp.task('clean-typescript', () =>
	gulp.src([scriptTsTag + '*'], { read: false, allowEmpty: true })
		.pipe(clean()));

gulp.task('process-typescript', gulp.series('clean-typescript', () =>
	tsProject.src()
		.pipe(sourcemaps.init())
		.pipe(tsProject())
		.pipe(sourcemaps.write('.'))
		.pipe(gulp.dest(scriptTsTag))
));

gulp.task('compress-typescript', gulp.series('process-typescript', () =>
	gulp.src([scriptTsTag + '**/*.js', '!' + scriptTsTag + '**/*.min.js'])
		.pipe(rename({ suffix: '.min' }))
		.pipe(uglify())
		.pipe(gulp.dest(scriptTsTag))
));

/* themeTasks 里**只放 compress-typescript，不放 process-typescript**。
 *
 * 后者是前者的 series 前置步骤，两个都放进 gulp.parallel 的话
 * process-typescript 会并发跑两次，而 ts.createProject 的实例不能同时用于
 * 两次编译 —— 报 "A project cannot be used in two compilations at the same time"，
 * 而且 clean-typescript 会在另一个编译写文件时删目录。
 *
 * 切分之前两个都在 themeTasks 里，所以 `npx gulp` 是坏的，CLAUDE.md 里
 * 记着「要稳定产出 TS 产物时单独跑 compress-typescript」当绕法。
 * 趁这次重写 gulpfile 一并修掉。
 */
themeTasks.push('compress-typescript');

// ==================
// html
// ==================

/* 生成 import map 的 imports 对象。
 *
 * **要合并两个包的 exports** —— 库的（11 条）和 site-page 自己的（14 条）。
 * 切 workspaces 之前只有一个 package.json，现在页面同时 import 两边：
 *   import { WebUtil  } from '@jade-dungeon/jade-utils/web';   ← 库
 *   import { BlogPage } from '@jade-dungeon/site-page/blog';    ← web
 *
 * 键直接复用各自 exports 的子路径，所以页面里写的 import 路径和
 * npm 消费方完全一致。值把 "./dist/" 前缀换成对应的产物根：
 *   库的模块   → env.libRoot
 *   web 的模块 → env.importMapRoot
 * 两个 root 填同一个值就是「合并部署」，填不同值就是「分开部署」
 * （见第 18 节的决定 12 与 18.13 节）。
 *
 * 各自末尾加一条带尾斜杠的前缀映射，兜住 exports 里没列的模块。
 * import map 的解析规则是精确键优先于前缀键。
 */
let buildImportMap = (env) => {
	const imports = {};
	const add = (pkgPath, root) => {
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
		for (const [subpath, cond] of Object.entries(pkg.exports || {})) {
			const file = typeof cond === 'string' ? cond : cond.default;
			if (!file) { continue; }
			// "." → 包名本身；"./basic" → "包名/basic"
			const key = subpath === '.' ? pkg.name : pkg.name + subpath.slice(1);
			imports[key] = file.replace(/^\.\/dist\//, root + '/');
		}
		imports[pkg.name + '/'] = root + '/';
	};
	add('../common-utils/package.json', env.libImportMapRoot || env.importMapRoot);
	add('./package.json', env.importMapRoot);
	return imports;
};

let initCurrEnv = (env) => {
	env.buildversion = env.buildversion + (new Date()).getTime();
	// 注入到 fileinclude 的 context，供 parts/importmap.html 使用。
	// gulp-file-include 原样插入不转义，所以可以直接塞 JSON 文本
	env.importmap = JSON.stringify({ imports: buildImportMap(env) }, null, 1);
	/* 第三方库的版本号（envs.js 的 exports.vendors）并进 context，
	 * 页面侧就能写 `@@cdn3rd/jquery/@@v-jquery/jquery.min.js`。
	 *
	 * 原来 36 处版本号写死在 7 个页面里，升级要逐个改、容易漏。
	 *
	 * 注意 `v-98css` 的值是 **CDN 上的目录名**（"0.1.18"），
	 * 而那个目录里放的其实是 0.1.21 之后的源码版 ——
	 * 别为了「和 package.json 一致」去改它，改了会 404。
	 * 见 docs/refactor-20261101.md 20.8 节。
	 *
	 * 键名带 `v-` 前缀，避免和 envs.js 的别的键撞名。
	 */
	Object.assign(env, envs.vendors || {});
	console.log("buildversion  : " + env.buildversion );
	console.log("webRoot       : " + env.webRoot      );
	console.log("staticRoot    : " + env.staticRoot   );
	console.log("libRoot       : " + (env.libRoot || '(同 staticRoot)'));
	console.log("importMapRoot : " + env.importMapRoot);
	console.log("apiRoot       : " + env.apiRoot      );
	console.log("cdnRoot       : " + env.cdnRoot      );
	console.log("cdn3rd        : " + env.cdn3rd       );
	console.log("vendors       : " + Object.entries(envs.vendors || {})
		.map(([k, v]) => k.replace(/^v-/, '') + '@' + v).join(' '));
};

const htmlSrc = "src/main/html/";
const htmlDst = "webroot/html/";
const devEnv = envs.deployEnvs.dev;
const rlsEnv = envs.deployEnvs.rls;

gulp.task('clean-html-dev', () => {
	initCurrEnv(devEnv);
	return gulp.src([htmlDst + '**/*.html'], { read: false, allowEmpty: true })
		.pipe(clean());
});
gulp.task('include-html-dev', gulp.series('clean-html-dev', async () =>
	gulp.src([htmlSrc + "**/*.html"])
		.pipe(fileinclude({ prefix: '@@', basepath: '@root', context: devEnv }))
		.pipe(gulp.dest(htmlDst))
));

gulp.task('clean-html-rls', () => {
	initCurrEnv(rlsEnv);
	return gulp.src([htmlDst + '**/*.html'], { read: false, allowEmpty: true })
		.pipe(clean());
});
gulp.task('process-html-rls', gulp.series('clean-html-rls', async () =>
	gulp.src([htmlSrc + "**/*.html"])
		.pipe(fileinclude({ prefix: '@@', basepath: '@root', context: rlsEnv }))
		.pipe(processhtml())
		.pipe(gulp.dest(htmlDst))
));

gulp.task('default', gulp.parallel(themeTasks));
