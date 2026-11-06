# tsconfig.json 配置说明

本文档记录 TypeScript 编译配置中几个关键选项的决策原因与背景，便于后续维护。

切 workspaces 之后配置拆成了多份（见 `refactor-20261101.md` 第 18 节）：
本文讲的这几项都在两边共享的 [tsconfig.base.json](../tsconfig.base.json) 里，
各自的 [common-utils/tsconfig.json](../common-utils/tsconfig.json) /
[site-page/tsconfig.json](../site-page/tsconfig.json) 只覆盖路径相关的项。

## 1. moduleResolution: "bundler"

原值为 `node10`（旧名 `node`），是 TypeScript 的弃用值：6.0 起标记弃用、7.0 移除。
项目锁定 `typescript ^5.8.3`（实际 5.8.3，此时 `node10` 尚不报错），但 IDE 用更新的 TS 6.x 会出现弃用提示。

实测对比后改选 `bundler`（node v22.22.2 + tsc 5.8.3）：

| 候选 | 实测结果 | 说明 |
|------|---------|------|
| `bundler` | ✅ 编译通过 | 官方为现代 ESM/浏览器项目推荐的解析模式，契合本项目「无打包器 + `module: ES6` + 相对 import 带 `.js`」 |
| `node16` / `nodenext` | ❌ 报 `TS5110` | 要求 `module` 也改成 `node16`，面向 Node.js 运行时，不适合浏览器项目 |
| 加 `ignoreDeprecations: "6.0"` | 治标不治本 | 只静默警告，未来升级 TS 仍需改 |

## 2. include: ["src/scripts/ts"]

不加 `include` 时，tsc 默认按 `**/*` 扫描整个项目。若 `webroot/` 下出现 `.ts` 文件（例如误复制进去），tsc 会把它们也当成编译输入，但这些文件不在 `rootDir: "src/scripts/ts"` 下，于是报错：

```
File '...' is not under 'rootDir' '...'. 'rootDir' is expected to contain all source files.
```

加 `include` 把编译范围锁死在 `src/scripts/ts`，`webroot` 等目录不再被扫描。

## 3. inlineSources: true

`sourceMap: true` 默认只在 `.js.map` 里记录 `sources` 路径（如 `../../../src/scripts/ts/workout.ts`），不内嵌源码（`sourcesContent` 为空）。浏览器 DevTools 调试时会按 `sources` 路径再请求一次 `.ts` 原始文件，而部署后没有该路径，导致：

```
获取原始源时出错：request failed with status 404
源 URL：http://.../src/scripts/ts/workout.ts
```

加 `inlineSources: true` 后，tsc 把 `.ts` 源码直接内嵌进 `.js.map` 的 `sourcesContent`，DevTools 直接从 sourcemap 读源码，不再发起 `.ts` 请求，404 消失，也无需把源码复制到 `webroot`。

## 附：完整 compilerOptions 参考

```json
{
  "compilerOptions": {
    "target": "ES6",
    "module": "ES6",
    "lib": ["ES6", "DOM", "ES2019.String"],
    "moduleResolution": "bundler",
    "strict": true,
    "noImplicitAny": true,
    "declaration": true,
    "sourceMap": true,
    "inlineSources": true,
    "outDir": "webroot/scripts/ts",
    "rootDir": "src/scripts/ts"
  },
  "include": ["src/scripts/ts"]
}
```
