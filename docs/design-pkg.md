# 打包为 npm 包的可行性分析

分析日期：2026-10-29。评估 jadeutils.v3 能否打包成 npm 包、安装到本地其他项目使用。
本文结论均经过实测，复现脚本见[附录 A](#附录-a复现脚本)。

## 1. 结论

**可行，核心库部分质量良好**，但有 1 个阻塞项需先修复（见[第 3 节](#3-阻塞项顶层-dom-求值)）。

实测走通了全链路：`tsc` 编译 → `npm pack` → 消费方 `npm install` → `import` 运行 → TS 类型解析。

打包方式**不需要改动现有 CDN 构建流程**：npm 打包直接用 `tsc -p tsconfig.build.json`，
绕过 gulp，`build.sh` / `deploy-test.sh` 保持原样。

## 2. 实测验证结果

验证环境：node v22.22.2（`.nvmrc` 指定版本）+ typescript 5.8.3（`npx -y -p typescript@5.8.3`，未写入 `node_modules`）。

| 验证项 | 结果 | 备注 |
|--------|------|------|
| `tsc --noEmit` 全量类型检查 | ✅ 0 错误 | 现有源码类型完备 |
| 生成 `.js` + `.d.ts` | ✅ 14 个模块 | 已排除 4 个 `test*.ts` |
| `npm pack` | ✅ 117 KB | tarball 体积合理 |
| 消费方 `npm install` + 运行 | ⚠️ 部分可用 | 纯逻辑层 OK，DOM 层崩溃 |
| TS 类型解析 `moduleResolution: bundler` | ✅ 成功 | |
| TS 类型解析 `moduleResolution: nodenext` | ✅ 成功 | |
| 第三方全局声明是否泄漏到 `.d.ts` | ✅ 不泄漏 | 见[第 4.6 节](#46-3rdlibtoolts-的全局声明不泄漏) |

纯逻辑层在 Node 中直接运行通过：

```
[basic]  NumUtil: toFixed,format,unformat,getDecimalPlaces,add
[data]   SimpleMap size: 2 keys: ["a","b"]
[data]   SimpleStack pop: 2
[geo2d]  Point2D(3,4): 3 4
RESULT: 纯逻辑层在 Node 中可用 ✓
```

### 2.1 两个天然优势

- **import 已带 `.js` 扩展名** — 源码里 `import { NumUtil } from './basic.js'` 的写法
  本是为浏览器原生 ESM 加载设计的，正好符合 NodeNext 规范，打包时不用改。
- **严格单向分层，无循环依赖** — 依赖方向为
  `basic` / `dataStructure` → `web` → `resource` / `canvas` / `UIWindow` → `sandtable`。

## 3. 阻塞项：顶层 DOM 求值

[web.ts:6](../src/scripts/ts/web.ts#L6) 的 `EscapeUnicode` 类写在模块顶层：

```typescript
export class EscapeUnicode extends HTMLElement {
	constructor() { ... }
}
```

ES 模块的 `extends` 子句在**模块加载时**求值，而非实例化时。
所以在没有 `HTMLElement` 的环境（Node / SSR / Vitest）里，只要 import 就立即抛错：

```
[web]    import 失败: ReferenceError - HTMLElement is not defined
[ui-win] import 失败: ReferenceError - HTMLElement is not defined
[canvas] import 失败: ReferenceError - HTMLElement is not defined
```

### 3.1 影响范围会扩散

[canvas.ts](../src/scripts/ts/ui/canvas.ts) 本身零 DOM 依赖（纯 Canvas 绘图抽象），
但因为 `import { WebUtil } from '../web.js'` 被连带污染。
[UIWindow.ts](../src/scripts/ts/ui/UIWindow.ts) 同理。

纯浏览器环境使用不受影响，当前 CDN 部署方式也完全正常。
但作为 npm 包，使用方一旦有 SSR（Next.js / Nuxt）、单元测试或 Node 脚本就会崩。

### 3.2 建议改法

[web.ts:228](../src/scripts/ts/web.ts#L228) 的 `initCustomElements()` 本来就是需要显式调用的方法，
把类定义挪进去，顶层只保留类型声明：

```typescript
// 顶层只留类型，不求值
export type IEscapeUnicode = HTMLElement;

static initCustomElements(): void {
	// 进入此方法时已确定在浏览器环境，HTMLElement 可用
	class EscapeUnicode extends HTMLElement {
		constructor() {
			super();
			let oldHtml = this.innerHTML;
			this.innerHTML = oldHtml.replace(
				/(&amp;#x?[0-9a-fA-F]{1,6};)/, (e => e.replace('&amp;', '&')));
		}
	}
	customElements.define('esp-unicode', EscapeUnicode);
}
```

注意这会改变 `EscapeUnicode` 的导出形态，属于 breaking change，需检查现有引用处。

## 4. 其他需要处理的问题

### 4.1 package.json 缺少发布字段

现有 [package.json](../package.json) 只有 `dependencies` / `devDependencies`，
是纯构建清单，缺 `name`、`version`、`type`、`exports`、`files`，无法发布。

### 4.2 测试文件会被打进产物

`tsconfig.json` 的 `include: ["src/scripts/ts"]` 会把以下浏览器手动测试脚本一起编译：

| 文件 | 行数 |
|------|------|
| `testJadeUtils.ts` | 953 |
| `trpg/testJadeTRPG.ts` | 501 |
| `ui/testJadeUI.ts` | 410 |
| `workout/testWorkout.ts` | 28 |

解决办法是新增 `tsconfig.build.json` 继承主配置并排除它们，
产物从 18 个模块降到 14 个。**不要改 `tsconfig.json` 本身** ——
这些测试页面需要随 CDN 构建一起编译，是现有工作流的一部分。

### 4.3 硬编码站点配置

[webHtmlPage.ts:47-70](../src/scripts/ts/ui/webHtmlPage.ts#L47-L70) 的 `SITE_NAV_ITEMS`
和 `SITE_THEMES` 含写死的 IP（`118.178.197.156`）与个人 GitHub 链接。
作为库的公开导出值不合适，建议改为使用方传入参数，或移到示例代码中。

### 4.4 webroot/ 被 gitignore

产物目录不入版本控制，因此必须配 `prepublishOnly` 脚本在发布前编译，
不能依赖仓库里已有的产物。

### 4.5 gulpfile 依赖 gitignored 的 envs.js

[gulpfile.js:20](../gulpfile.js#L20) 顶层 `require("./envs")`，
而 `envs.js` 在 `.gitignore` 中（仅有 `envs.sample.js` 模板）。
缺该文件时所有 gulp 任务都会挂。

npm 打包路径直接调 `tsc`，不经过 gulp，所以不受影响。
但新环境克隆仓库后若要跑 CDN 构建，需先 `cp envs.sample.js envs.js`。

### 4.6 3rdLibTool.ts 的全局声明不泄漏

[3rdLibTool.ts](../src/scripts/ts/3rdLibTool.ts) 用 `declare namespace SyntaxHighlighter`
等方式声明 jQuery / MathJax / SyntaxHighlighter / showdown 全局变量。
实测这些声明**不会**泄漏进生成的 `.d.ts`（因为该文件是模块而非全局脚本），
不会污染使用方的全局类型空间，这点是安全的。

## 5. 分包建议

按 DOM 依赖程度分三档：

| 档位 | 模块 | 说明 |
|------|------|------|
| **强烈推荐** | `basic`（1019 行）<br>`dataStructure`（359 行）<br>`ui/geo2d`（717 行） | 零 DOM 依赖，纯逻辑，通用性最好。`geo2d` 的碰撞检测 / 最近点计算可复用价值最高 |
| **推荐（标记仅浏览器）** | `ui/canvas`、`ui/UIWindow`<br>`trpg/sandtable`、`resource` | 功能完整、接口清晰，但强依赖 DOM / Canvas API |
| **不建议打包** | `3rdLibTool`<br>`blog/blog`、`blog/wiki`<br>`workout/*` | 见下方理由 |

不建议打包的理由：

- **`3rdLibTool.ts`** — 依赖 `$` / `MathJax` / `showdown` 等**全局变量**。
  npm 场景下使用方装的是真 npm 包（`import $ from 'jquery'`），这层包装会错位。
- **`blog.ts` / `wiki.ts`** — 绑定特定后端 API，且含 CLAUDE.md 记录的 2 个待后端修复问题
  （`recommands` 拼写、`pageCount + 1` 补偿）。
- **`workout/*`** — 业务数据（`workoutData.ts` 为健身动作数据），非通用工具。

### 5.1 exports 配置（实测可用）

```json
{
  "name": "@jade/jadeutils",
  "version": "3.0.0",
  "type": "module",
  "sideEffects": false,
  "exports": {
    "./basic":     { "types": "./dist/basic.d.ts",          "default": "./dist/basic.js" },
    "./data":      { "types": "./dist/dataStructure.d.ts",  "default": "./dist/dataStructure.js" },
    "./geo2d":     { "types": "./dist/ui/geo2d.d.ts",       "default": "./dist/ui/geo2d.js" },
    "./canvas":    { "types": "./dist/ui/canvas.d.ts",      "default": "./dist/ui/canvas.js" },
    "./ui-window": { "types": "./dist/ui/UIWindow.d.ts",    "default": "./dist/ui/UIWindow.js" },
    "./sandtable": { "types": "./dist/trpg/sandtable.d.ts", "default": "./dist/trpg/sandtable.js" }
  },
  "files": ["dist"]
}
```

用子路径导出（而非单一 `main`）的好处：使用方只装一个包，但 import 时按需取，
避免仅用 `geo2d` 却被迫加载 `UIWindow` 的 DOM 代码。

### 5.2 Less 主题：建议单独发包或不发

两个原因：

- **无法独立消费** — [comm.less](../src/themes/comm.less) 有 114 处 `@` 变量引用且自身不定义值，
  必须配合某个主题的 `part.1.less` 才能编译通过（这正是现有主题系统的设计）。
- **体积过大** — `src/themes/` 共 5.3 MB 图片：

  | 主题 | 体积 |
  |------|------|
  | workout | 1.9 MB |
  | hobbit | 1.5 MB |
  | paper-print | 960 KB |
  | lo-fi | 952 KB |
  | trpg | 112 KB |
  | window-ui | 16 KB |

  塞进主包会让安装体积从 117 KB 膨胀到 5 MB 以上。

若确实需要，建议发成独立的 `@jade/jadeutils-themes` 包，或继续走 CDN 引用。

## 6. 最小落地步骤

只做三步就能 `npm install` 到本地项目：

1. **修 `EscapeUnicode`** — 把类定义挪进 `initCustomElements()`（[第 3.2 节](#32-建议改法)）
2. **补 `package.json` 发布字段** — `name` / `version` / `type` / `exports` / `files`
   + `prepublishOnly` 脚本（[第 5.1 节](#51-exports-配置实测可用)）
3. **加 `tsconfig.build.json`** — 排除 `test*.ts`，输出到 `dist/`（[第 4.2 节](#42-测试文件会被打进产物)）

```json
// tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src/scripts/ts",
    "sourceMap": false,
    "inlineSources": false,
    "declaration": true
  },
  "include": ["src/scripts/ts"],
  "exclude": ["src/scripts/ts/**/test*.ts"]
}
```

本地安装到其他项目的两种方式：

```bash
# 方式 1：tarball（推荐，最接近真实发布）
npm pack                                   # 在本项目生成 .tgz
cd ../other-project && npm install ../Jade-Javascript-utils/jade-jadeutils-3.0.0.tgz

# 方式 2：npm link（开发期联调，改动即时生效）
npm link                                   # 在本项目
cd ../other-project && npm link @jade/jadeutils
```

后续可选：把 `dist/` 加进 `.gitignore`、补 `README` 的 npm 用法段落、
`exports` 里加 `"browser"` 条件区分 DOM 层。

## 附录 A：复现脚本

实测用的脚本（在 `/tmp` 下操作，不污染项目目录）：

```bash
# 1. 类型检查（不写 node_modules）
npx -y -p typescript@5.8.3 tsc --noEmit -p tsconfig.json

# 2. 编译 + 打包（需先写好 tsconfig.build.json 和 package.json）
npx -y -p typescript@5.8.3 tsc -p tsconfig.build.json
npm pack

# 3. 消费方验证
mkdir /tmp/consumer && cd /tmp/consumer
echo '{"name":"c","version":"1.0.0","type":"module","private":true}' > package.json
npm install /path/to/jade-jadeutils-3.0.0.tgz
node -e "import('@jade/jadeutils/basic').then(m=>console.log(Object.keys(m)))"
```

注意 `nvm use` 后若 `node -v` 仍显示旧版本，用
`export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use v22.22.2` 重新加载。

## 附录 B：CLAUDE.md 待更新处

分析过程中发现 CLAUDE.md「编译配置」一节的描述已过时：

| CLAUDE.md 当前描述 | 实际情况 |
|-------------------|---------|
| 「**无 `tsconfig.json`**，编译选项内联在 `gulpfile.js` 第 174-182 行」 | [tsconfig.json](../tsconfig.json) 已存在，[gulpfile.js:181](../gulpfile.js#L181) 改为 `ts.createProject('tsconfig.json')`。配置详见 [tsconfig-info.md](tsconfig-info.md) |
| 「`src/scripts/ts/` TypeScript 源码」（平铺 15 个文件） | 已重组为子目录：`blog/`、`trpg/`、`ui/`、`workout/`，共 18 个 `.ts` 文件 |
| 未提及 workout 主题 | `gulpfile.js` 已有 `process-style-workout` 任务，`src/themes/workout/` 含 1.9 MB 图片 |

