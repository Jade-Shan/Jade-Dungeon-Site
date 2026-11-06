/**
 * 库的汇总入口
 *
 * 供 `import { ... } from '@jade-dungeon/jade-utils'` 这种不带子路径的写法使用。
 *
 * **只汇总库自己的模块。** 原来这里还 `export *` 了 `trpg/sandtable`、
 * `blog/blog`、`blog/wiki`、`workout/*` 这 6 个，那会让库依赖 site-page 项目
 * —— 切 workspaces 之后两边编译不开。按 `docs/refactor-20261101.md`
 * 第 18 节的决定 2，那 6 个搬到 site-page 项目自己的汇总入口里。
 *
 * 这是 breaking change：`import { BlogPage } from '@jade-dungeon/jade-utils'`
 * 不再可用，要改成 `from '@jade-dungeon/jade-utils/blog'`。
 * 按 8.2 节和已累积的那批一起发 4.0.0。
 *
 * 注意：按子路径导入（如 `@jade-dungeon/jade-utils/geo2d`）只加载用到的模块，
 * 而从本入口导入会把所有模块一起加载。没有打包器做 tree-shaking 时，
 * 建议优先用子路径导入。
 *
 * 模块顺序 = 依赖顺序
 */

// 基础层（无内部依赖）
export * from './basic.js';
export * from './dataStructure.js';

// 资源与 Web 基础
export * from './web.js';
// 窗口 UI 的资源注册表（只有接口，无图片数据）
export * from './ui/uiResource.js';
// 内置图标与背景（310 行 base64）。从本入口导入会把它一起拉进来，
// 介意体积的话用子路径 `/ui-resource` 只拿注册表，不碰这个文件
export * from './resource.js';

// Bootstrap 3 的导航栏模板（纯字符串拼接，零全局变量依赖）
export * from './ui/bootstrapTemplate.js';

// 几何与图形层
export * from './ui/geo2d.js';
export * from './ui/canvas.js';

// Web 页面层
export * from './ui/webHtmlPage.js';

// 窗口 UI
export * from './ui/UIWindow.js';

// 以下模块**不在**本入口里，各有原因：
//
//   3rdLibTool.ts          依赖全局脚本变量（$ / MathJax / ...），
//                          按 3.4 节不该发包，切 workspaces 时归 site-page 项目。
//                          仍可通过子路径 `/3rd-lib-tool` 导入
//   site.config.ts         本站配置，不在 exports 里（15.1 节）
//   env.demo.ts            demo 专用，不在 exports 里（第 11 节）
//   trpg/sandtable.ts      归 site-page 项目（第 18 节决定 5）
//   blog/*、workout/*      归 site-page 项目（第 18 节决定 2）
