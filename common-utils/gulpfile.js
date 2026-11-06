// 库的 CDN 构建
//
// 库只需要两条链：TypeScript 编译 + window-ui 主题的 Less 编译。
// 没有 HTML 模板展开、没有 import map —— 页面全在 site-page 项目侧
// （见 docs/refactor-20261101.md 第 18 节的决定 8 / 15）。
//
// 任务：
//   process-typescript    编译 TS → webroot/scripts/ts/
//   compress-typescript   上面 + 生成 .min.js
//   process-style-window-ui   desktop.less → webroot/themes/window-ui/styles/
//   default               全部并行

const gulp       = require('gulp');
const less       = require('gulp-less');
const minifycss  = require('gulp-minify-css');
const ts         = require('gulp-typescript');
const sourcemaps = require('gulp-sourcemaps');
const uglify     = require('gulp-uglify-es').default;
const rename     = require('gulp-rename');
const concat     = require('gulp-concat');
const clean      = require('gulp-clean');

const tsProject = ts.createProject('tsconfig.json');

// =======================
// window-ui 主题
//
// 注意这个目录下**只有 styles/**，没有 images/ —— 原来那个 favicon.ico
// 已挪到 site-page 项目的 themes/site/（第 18 节决定 13），所以不再有拷图片的步骤
// =======================

gulp.task('process-style-window-ui', gulp.series(
	() => gulp.src(['webroot/themes/window-ui/styles/**/*'],
		{ read: false, allowEmpty: true }).pipe(clean()),
	() => gulp.src(['src/main/themes/window-ui/styles/**/*.less'])
		.pipe(concat('all.less'))
		.pipe(less({ compress: false })).on('error', (e) => { console.log(e); })
		.pipe(gulp.dest('webroot/themes/window-ui/styles/'))
		.pipe(minifycss()).pipe(rename({ suffix: '.min' }))
		.pipe(gulp.dest('webroot/themes/window-ui/styles/'))
));

// =======================
// TypeScript
// =======================

const scriptTsTag = 'webroot/scripts/ts/';

gulp.task('clean-typescript', () =>
	gulp.src([scriptTsTag + '*'], { read: false, allowEmpty: true })
		.pipe(clean()));

// 源文件由 tsconfig.json 的 include 决定，自动包含子目录。
// 不筛 result.js —— 整个流走下去才能同时产出 .js / .d.ts / .js.map
gulp.task('process-typescript', gulp.series('clean-typescript', () =>
	tsProject.src()
		.pipe(sourcemaps.init())
		.pipe(tsProject())
		.pipe(sourcemaps.write('.'))
		.pipe(gulp.dest(scriptTsTag))
));

// rename 在 uglify 之前 —— 和切分之前的顺序一致，保证产物一致
gulp.task('compress-typescript', gulp.series('process-typescript', () =>
	gulp.src([scriptTsTag + '**/*.js', '!' + scriptTsTag + '**/*.min.js'])
		.pipe(rename({ suffix: '.min' }))
		.pipe(uglify())
		.pipe(gulp.dest(scriptTsTag))
));

gulp.task('default', gulp.parallel(
	'process-style-window-ui', 'compress-typescript'));
