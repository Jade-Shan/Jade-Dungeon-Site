# JSX 深入学习笔记

> 本文由一次学习会话整理而成，主题是 JSX 的本质、TS 对它的支持机制、React 与 Vue 实现差异，以及如何从零自研一套 JSX 框架。
>
> 与本仓库的关系：本项目是 `@umijs/max` + React 18，`jsx` 编译模式为 `react-jsx`（见 `src/.umi/tsconfig.json`），第 2 章的结论可直接对照本仓库验证。

## 目录

- [一、`.ts` 与 `.tsx` 的区别](#一ts-与-tsx-的区别)
- [二、JSX 是 TypeScript 原生支持的吗](#二jsx-是-typescript-原生支持的吗)
- [三、`react-jsx` 模式下还要不要引入 react](#三react-jsx-模式下还要不要引入-react)
- [四、Vue 与 React 的 JSX 实现差异](#四vue-与-react-的-jsx-实现差异)
- [五、自研一套 JSX 框架需要什么](#五自研一套-jsx-框架需要什么)
- [附：核心结论速查](#附核心结论速查)

---

## 一、`.ts` 与 `.tsx` 的区别

本质上**只有一个区别**：编译器（TypeScript / esbuild / swc / babel）解析 `.tsx` 文件时会开启 **JSX 语法解析模式**，`.ts` 不开启。

类型系统、语法、模块机制**完全一致**。实际影响只有两点：

### 1.1 `.tsx` 里能写 JSX

```ts
// foo.ts —— 报错：Cannot use JSX unless the '--jsx' flag is provided
const a = <div>hello</div>;
```

### 1.2 `.tsx` 里不能用尖括号类型断言

因为 `<string>value` 与 JSX 标签有语法歧义：

```ts
// .ts 里 OK
const x = <string>someValue;

// .tsx 里必须写成 as
const x = someValue as string;
```

同理，泛型箭头函数在 `.tsx` 里也需要消歧义：

```tsx
const f = <T,>(x: T) => x;                  // 加逗号
const g = <T extends unknown>(x: T) => x;   // 或加 extends
```

---

## 二、JSX 是 TypeScript 原生支持的吗

**不是原生语法，但 TypeScript 内置了对它的支持。** 拆开理解：

- **JSX 不属于 ECMAScript 标准**。它是 Facebook 为 React 设计的**语法扩展（syntax extension）**，[提案](https://facebook.github.io/jsx/)长期停留在 stage-1，从未进入 TC39 标准。
- **但 TS 编译器内置了 JSX 的解析与转译能力**，不需要任何插件。只要文件后缀是 `.tsx` 且 `tsconfig.json` 配了 `jsx` 选项，`tsc` 就能直接处理。

本仓库的配置（`src/.umi/tsconfig.json`）：

```json
"jsx": "react-jsx"
```

### 2.1 `jsx` 选项取值

| 值 | 行为 |
|---|---|
| `preserve` | 原样保留 JSX，交给后续工具（babel 等）处理，产物为 `.jsx` |
| `react` | 转成 `React.createElement(...)`（classic，必须 `import React`） |
| `react-jsx` | 转成 `_jsx(...)`，自动 import `react/jsx-runtime`（React 17+ 新变换，**无需手写 `import React`**） |
| `react-jsxdev` | 同上，额外带调试信息（文件名/行号） |

### 2.2 "HTML 字面量"其实不是 HTML

写出来像 HTML 的东西，编译后是**普通函数调用**，产物是描述 UI 的 JS 对象（React Element），既不是字符串也不是 DOM：

```tsx
// 源码
const el = <div className="box" onClick={handleClick}>hi</div>;

// react-jsx 模式产物
import { jsx as _jsx } from 'react/jsx-runtime';
const el = _jsx('div', { className: 'box', onClick: handleClick, children: 'hi' });
```

这解释了几个常见疑问：

- 要写 `className` 而非 `class` —— `class` 是 JS 保留字
- 要写 `onClick` 而非 `onclick` —— 它是对象的 key，走驼峰约定
- `{}` 里能塞任意表达式 —— 因为本来就在写 JS

### 2.3 TS 如何给 JSX 做类型检查

TS 并不硬编码 HTML 规范，而是查一个叫 `JSX` 的命名空间。React 的类型包 `@types/react` 声明了：

```ts
declare global {
	namespace JSX {
		interface IntrinsicElements {
			div: React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>;
			// ... 几百个标签
		}
	}
}
```

所以 `<div className="x" />` 合法、`<div classname="x" />` 报错，靠的是 `IntrinsicElements` 这张表。换成 Vue 的 JSX 类型包，同一套 `.tsx` 语法的检查规则就变了 —— 说明 **JSX 在 TS 里是"可插拔"的，并非绑定 React**。

---

## 三、`react-jsx` 模式下还要不要引入 react

**结论：`react` 这个 npm 包必须存在（运行时真的会 import 它），但不需要在每个 `.tsx` 文件里手写 `import React from 'react'`。** 这是两件常被混淆的事。

### 3.1 为什么"包"必须有

```tsx
// 源码 —— 一行 import 都没有
export default () => <div className="box">hi</div>;
```

```js
// 产物 —— 编译器自动插入了 import
import { jsx as _jsx } from 'react/jsx-runtime';
export default () => _jsx('div', { className: 'box', children: 'hi' });
```

那行 import 是**编译器自动注入**的，但指向真实存在的模块文件。`node_modules/react/jsx-runtime.js` 必须存在，否则打包直接 `Module not found`。

本仓库的情况：`react@18.3.1` 存在，但**不在 `package.json` 的 dependencies 里**，是由传递依赖带进来的：

```
@umijs/max@4.6.55
└─┬ umi@4.6.55
  └─┬ @umijs/preset-umi@4.6.55
    └── react@18.3.1
```

`package.json` 只显式声明了 `@types/react` / `@types/react-dom`。这是 umi 脚手架的惯例：react 运行时版本由 umi 统一托管，业务层只声明类型包。

### 3.2 为什么 `import React` 不用写

| tsconfig `jsx` | 产物调用 | 是否要手写 `import React` |
|---|---|---|
| `react` | `React.createElement(...)` | **要**，否则 `React is not defined` |
| `react-jsx` | `_jsx(...)`，自动 import `react/jsx-runtime` | **不要** |

classic 模式下 `React` 以**标识符**形式出现在产物中，所以作用域必须有它；新模式改为自动注入 import，不再依赖文件内的变量。

### 3.3 什么时候仍需 import

用到 React 命名空间下的具体 API 或类型时才需要，这属于普通按需导入，与 JSX 无关：

```tsx
import { useState, type FC } from 'react';   // 推荐：按需具名导入
import React from 'react';                   // 仅当用 React.FC / React.memo 等
```

> 本仓库 `src` 下 82 个 `.tsx` 写了 `import React`、64 个没写，两种共存都能正常运行 —— 正是因为 JSX 本身已不依赖它。

### 3.4 彩蛋：连 React 都能换掉

`react-jsx` 中的 "react" 只是默认来源，可用 `jsxImportSource` 替换：

```json
{ "jsx": "react-jsx", "jsxImportSource": "preact" }
```

产物变成 `import { jsx } from 'preact/jsx-runtime'`。也能在单文件顶部覆盖：

```tsx
/** @jsxImportSource preact */
```

编译器只负责按约定生成 `xxx/jsx-runtime` 的调用，runtime 是 React、Preact 还是 Vue，它并不关心。

---

## 四、Vue 与 React 的 JSX 实现差异

### 4.1 编译产物：目标函数不同

**React**（`jsx: "react-jsx"`）：

```tsx
<div className="box"><span>hi</span></div>
// ↓
import { jsx as _jsx } from 'react/jsx-runtime';
_jsx('div', { className: 'box', children: _jsx('span', { children: 'hi' }) });
```

**Vue 3**（`@vue/babel-plugin-jsx` 或 `@vitejs/plugin-vue-jsx`）：

```tsx
<div class="box"><span>hi</span></div>
// ↓
import { createVNode as _createVNode } from 'vue';
_createVNode('div', { class: 'box' }, [_createVNode('span', null, ['hi'])]);
```

两个差异点：

- React 把 children 放进 **props 对象的 `children` 字段**；Vue 放在**第三个参数**
- Vue 3.3 起也提供了 `vue/jsx-runtime`，可直接配 `"jsx": "react-jsx", "jsxImportSource": "vue"` 走自动运行时，不必挂 babel 插件

### 4.2 运行时语义：真正的分水岭

**React：整个组件函数重跑**

```tsx
function App() {
	const [n, setN] = useState(0);
	const handle = () => setN(n + 1);    // 每次 render 都是新函数
	return <Child onClick={handle} />;    // Child 默认也会重渲染
}
```

JSX 是普通表达式，状态一变函数体从头执行，重新求值生成全新 Element 树再 diff。因此需要 `useMemo` / `useCallback` / `React.memo` 手动优化（React Compiler 出现后开始自动化，但心智模型不变）。

**Vue：`setup` 只跑一次，render 按依赖重跑**

```tsx
const App = defineComponent({
	setup() {
		const n = ref(0);
		const handle = () => n.value++;             // 只创建一次，引用永久稳定
		return () => <Child onClick={handle} />;    // 返回 render 函数
	},
});
```

`setup()` 生命周期内只执行一次，返回的 render 函数被包进 `ReactiveEffect`。只有 render 中真正读取过的响应式数据变化才会重跑，且只重跑该组件。所以 Vue JSX 基本不需要 memo 家族。

> 一句话：**React 是"重新执行 + diff 找变化"，Vue 是"响应式精确定位变化 + diff"。**

### 4.3 编译时优化：Vue template > Vue JSX ≈ React

Vue 的 `<template>` 有杀手级优势：编译器能做**静态提升（hoistStatic）**、**PatchFlag 标记**、**Block Tree**，运行时可直接跳过静态节点。

```js
// template 产物带 patchFlag
createElementVNode("div", { class: "box" }, toDisplayString(msg), 1 /* TEXT */)
//                                                               ↑ 只需比对文本
```

但 **JSX 过于动态，编译器无法静态分析**（`{cond && <A/>}`、展开运算符、任意函数调用……）。`@vue/babel-plugin-jsx` 默认 `optimize: false`，**不生成 patchFlag**，走完整 diff。

因此社区共识是：Vue 里 JSX 适合**高度动态的渲染逻辑**（表格列渲染、递归组件、动态组件工厂），常规页面用 template 更优。

### 4.4 语法细节对照

| 维度 | React | Vue 3 JSX |
|---|---|---|
| class | `className="a"` | `class="a"`，且支持 `class={['a', {b: ok}]}` |
| style | 只能对象 `{{color:'red'}}` | 对象或数组，带单位字符串也行 |
| 事件 | `onClick`，修饰符自己写 | `onClick`，修饰符用 `withModifiers(fn, ['stop'])`；原生支持 `onClickCapture` / `onClickOnce` |
| 条件 | `{cond ? <A/> : null}` | 同左；额外支持 `v-show={bool}`（`v-if` / `v-for` **不支持**） |
| 双向绑定 | 无，手写 value + onChange | `v-model={state.foo}`、`v-model:title={x}`，插件展开为 `modelValue` + `onUpdate:modelValue` |
| 插槽 / children | `props.children`、render props | 第三参数传**对象且值为函数**：`<Comp>{{ default: () => <div/>, footer: () => <b/> }}</Comp>` |
| ref | `ref={elRef}`（对象或回调） | `ref={elRef}`（ref 对象或字符串名） |
| Fragment | `<>...</>` | `<>...</>` 同样支持 |
| 返回值 | 必须单个值（Fragment 包裹） | Vue 3 组件本身支持多根节点 |
| 组件识别 | 大写=组件，小写=DOM 标签 | **两家一致** |

> Vue 的 slots 是个坑：`<Comp><div/></Comp>` 虽能跑，但会被当成默认插槽的**非函数值**，Vue 会警告并丢失插槽级更新优化，正确写法是传函数对象。

### 4.5 类型层面

两家各自往 `JSX` 命名空间塞 `IntrinsicElements`：

- React 来自 `@types/react`，标签属性类型**非常严格**
- Vue 来自 `@vue/runtime-dom`，历史上为兼容自定义属性/指令更宽松（`IntrinsicAttributes` 允许任意 key），近几个版本在逐步收紧

由于都挂在同一个全局 `JSX` 命名空间，**同项目同时装两者会互相污染**（`Duplicate identifier 'JSX'`）。Vue 3.4+ 改用 `jsxImportSource` 配合模块级 `JSX` 命名空间来缓解。

---

## 五、自研一套 JSX 框架需要什么

### 5.0 先决定渲染模型

JSX 只是"标签 → 函数调用"，**不规定如何渲染**。第一步选路线，它决定后续所有知识点：

| 路线 | 代表 | JSX 编译成 | 核心难点 |
|---|---|---|---|
| **VDOM + diff** | React / Preact / Vue | 每次生成新的描述对象树 | reconcile 算法、keyed diff、调度 |
| **编译期直出 DOM** | Solid / dom-expressions | 直接 `document.createElement` + 细粒度 effect | 需自写 Babel 插件、响应式系统 |
| **字符串 / SSR-only** | 模板引擎、静态站点 | 拼字符串 | XSS 转义、流式输出 |

> 建议从 **VDOM 路线**起步：JSX 运行时是纯函数，无需编写编译器插件，标准 `jsx-runtime` 契约就够。

### 5.1 JSX 语法层契约（照抄即可）

#### 规范原文

- [facebook/jsx](https://github.com/facebook/jsx) —— **只定义语法（BNF），完全不定义语义**。需掌握的规则：
  - 首字母大写或含 `.` → 当作变量引用（组件）；全小写 → 当作字符串（内置标签）
  - `<foo:bar>`、`<foo-bar>` 是合法的命名空间/连字符标签
  - 属性值只能是字符串字面量或 `{表达式}`
  - `{/* 注释 */}`、`{...spread}`、`<></>` Fragment
- [TypeScript Handbook - JSX](https://www.typescriptlang.org/docs/handbook/jsx.html) —— 类型层契约的唯一权威

#### Classic 约定（`jsx: "react"`）

```jsonc
{ "jsx": "react", "jsxFactory": "h", "jsxFragmentFactory": "Fragment" }
```

```tsx
<div id="a">x</div>    // → h('div', { id: 'a' }, 'x')
<>{list}</>            // → h(Fragment, null, list)
```

要实现的签名：`h(type, props | null, ...children)`。注意 **children 是不定参数**，`key` 混在 props 里。缺点是每个文件必须手动 import。

#### Automatic 约定（`jsx: "react-jsx"`，现代做法）

```jsonc
{ "jsx": "react-jsx", "jsxImportSource": "mylib" }
```

编译器自动生成 `import { jsx as _jsx, jsxs as _jsxs, Fragment } from "mylib/jsx-runtime"`。

**关键契约表，必须精确实现：**

| 模块 | 必须导出 | 签名 |
|---|---|---|
| `mylib/jsx-runtime` | `jsx` | `jsx(type, props, key?)` |
| | `jsxs` | `jsxs(type, props, key?)` —— children 是**编译期确定的静态数组** |
| | `Fragment` | 任意可比较的标记值 |
| `mylib/jsx-dev-runtime` | `jsxDEV` | `jsxDEV(type, props, key, isStaticChildren, source, self)` |
| | `Fragment` | 同上 |

容易踩的细节：

1. **`children` 在 `props.children` 里**，不是参数。单个子节点是值本身，多个是数组。
2. **`key` 被提到第三个参数**，不在 props 里 —— 与 classic 最大的差异。
3. **`jsx` vs `jsxs`**：`jsxs` 表示 children 数组是编译器写死的、不可能来自用户动态数据，React 用它跳过"缺少 key"警告。可以让 `jsxs = jsx`，功能上无区别。
4. **`jsxDEV` 的 `source`** 是 `{ fileName, lineNumber, columnNumber }`，做错误堆栈 / DevTools 定位很有用。
5. **建议同时导出 `createElement`**：Babel 在 `key` 出现在展开运算符之后（`<div {...p} key={k}/>`）这类无法安全提取 key 的场景会回退到 classic 调用，不导出则运行时报错。

#### 单文件覆盖（pragma 注释）

```tsx
/** @jsxImportSource mylib */             // automatic
/** @jsx h */ /** @jsxFrag Fragment */    // classic
```

#### 编译器无关性

契约跨工具统一，不必逐个适配：

```js
// esbuild / vite
{ jsx: 'automatic', jsxImportSource: 'mylib' }
// swc (.swcrc)
{ jsc: { transform: { react: { runtime: 'automatic', importSource: 'mylib' } } } }
// babel
['@babel/plugin-transform-react-jsx', { runtime: 'automatic', importSource: 'mylib' }]
```

### 5.2 最小可运行实现

#### `src/jsx-runtime.ts`

```ts
export const Fragment = Symbol.for('mylib.Fragment');

export interface VNode {
	type: string | symbol | Function;
	props: Record<string, any>;
	key: string | number | null;
}

export function jsx(type: VNode['type'], props: any, key?: any): VNode {
	return { type, props: props ?? {}, key: key ?? null };
}

// children 为静态数组，语义上可与 jsx 合并
export const jsxs = jsx;

// classic 回退 & 手写 h 都用它
export function createElement(type: VNode['type'], props: any, ...children: any[]): VNode {
	const { key = null, ...rest } = props ?? {};
	if (children.length) rest.children = children.length === 1 ? children[0] : children;
	return { type, props: rest, key };
}
```

#### `src/jsx-dev-runtime.ts`

```ts
export { Fragment } from './jsx-runtime';
import { jsx, type VNode } from './jsx-runtime';

export function jsxDEV(
	type: VNode['type'],
	props: any,
	key: any,
	_isStaticChildren: boolean,
	source?: { fileName: string; lineNumber: number; columnNumber: number },
): VNode {
	const vnode = jsx(type, props, key);
	Object.defineProperty(vnode, '__source', { value: source, enumerable: false });
	return vnode;
}
```

#### 一个够用的 `mount`（无 diff 版）

```ts
function mount(vnode: any, parent: Node): void {
	// 1) 空值
	if (vnode == null || vnode === false || vnode === true) return;
	// 2) 文本
	if (typeof vnode !== 'object') {
		parent.appendChild(document.createTextNode(String(vnode)));
		return;
	}
	// 3) 数组
	if (Array.isArray(vnode)) {
		vnode.forEach((child) => mount(child, parent));
		return;
	}

	const { type, props } = vnode as VNode;

	// 4) Fragment
	if (type === Fragment) return mount(props.children, parent);

	// 5) 函数组件 —— 递归求值
	if (typeof type === 'function') return mount((type as Function)(props), parent);

	// 6) 内置标签
	const el = document.createElement(type as string);
	for (const [name, value] of Object.entries(props)) {
		if (name === 'children') continue;
		if (name.startsWith('on') && typeof value === 'function') {
			el.addEventListener(name.slice(2).toLowerCase(), value);
		} else if (name === 'style' && typeof value === 'object') {
			Object.assign(el.style, value);
		} else if (name in el) {
			(el as any)[name] = value;   // property 优先（value/checked 等必须走这条）
		} else {
			el.setAttribute(name, String(value));
		}
	}
	mount(props.children, el);
	parent.appendChild(el);
}
```

到这一步已经有一个能跑的 JSX 框架，剩下的全是"如何更新"的工程量。

### 5.3 包的对接（最常见的翻车点）

`jsxImportSource: "mylib"` 会 import `mylib/jsx-runtime` 这个**子路径**。若 `package.json` 未开 `exports` 子路径，Node ESM 和 Vite 会报 `Package subpath './jsx-runtime' is not defined`：

```jsonc
{
	"name": "mylib",
	"type": "module",
	"exports": {
		".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
		"./jsx-runtime": { "types": "./dist/jsx-runtime.d.ts", "default": "./dist/jsx-runtime.js" },
		"./jsx-dev-runtime": { "types": "./dist/jsx-dev-runtime.d.ts", "default": "./dist/jsx-dev-runtime.js" }
	}
}
```

此外为兼容老的 `moduleResolution: "node"`（不认 `exports`），主流库（Preact 就是这么做的）会**额外在包根放一个 `jsx-runtime/package.json`** 指向产物。想让用户无痛接入就别省这步。

### 5.4 类型层对接

TS 通过 `JSX` 命名空间检查标签。**TS 5.1 之后推荐从 `jsx-runtime` 模块导出 `JSX` 命名空间**（而非污染全局，这样才能与 React 共存）：

```ts
// src/jsx-runtime.ts
export namespace JSX {
	// ① 内置标签表 —— 决定 <div> 合法、<dvi> 报错
	export interface IntrinsicElements {
		div: { class?: string; id?: string; children?: any; onClick?: (e: MouseEvent) => void };
		span: { /* ... */ };
		[tag: string]: any;   // 偷懒版：先全放行，后续逐步收紧
	}

	// ② JSX 表达式的类型 —— 即 <div/> 这个值是什么
	export type Element = VNode;

	// ③ 允许作为标签的东西（TS 5.1+，比 ElementClass 更灵活）
	export type ElementType = string | ((props: any) => Element);

	// ④ 告诉 TS 从组件的哪个属性读 props（类组件用）
	export interface ElementAttributesProperty { props: {} }

	// ⑤ 告诉 TS children 这个 prop 叫什么
	export interface ElementChildrenAttribute { children: {} }

	// ⑥ 所有元素都隐式允许的属性（key 放这里）
	export interface IntrinsicAttributes { key?: string | number }
}
```

关键成员速查：

| 成员 | 作用 |
|---|---|
| `IntrinsicElements` | 小写标签白名单 + 各自属性类型 |
| `Element` | JSX 表达式的结果类型 |
| `ElementType` | 什么东西能放在 `<>` 位置（TS 5.1+） |
| `ElementClass` | 类组件实例约束（只写函数组件可不管） |
| `ElementAttributesProperty` | 类组件的 props 从哪个字段读 |
| `ElementChildrenAttribute` | children 对应的 prop 名 |
| `IntrinsicAttributes` | 注入给所有元素的隐式属性（`key`） |
| `LibraryManagedAttributes` | 高级：处理 defaultProps / propTypes 等 props 变换 |

> `IntrinsicElements` 可用 `csstype` + 手写 HTML 属性表生成，或参考 Preact 的 `src/jsx.d.ts`（比 `@types/react` 清爽很多）。

### 5.5 需要补的知识清单（按依赖顺序）

#### 第 1 层：DOM 与浏览器基础（绕不开）

- **property vs attribute**：`value` / `checked` / `selected` 必须走 property；`aria-*` / `data-*` 必须走 attribute；`class` / `className` 双名
- **布尔属性**：`disabled={false}` 要 `removeAttribute`，而不是设成 `"false"`
- **SVG / MathML 命名空间**：必须用 `createElementNS`，且属性大小写敏感（`viewBox` 不是 `viewbox`）
- **事件系统**：直接绑原生 listener，还是像 React 那样在根节点做**事件委托 + 合成事件**？后者要处理冒泡路径重建、`stopPropagation` 语义、passive、capture
- **Text / 注释节点作为占位锚点**的技巧（Fragment 与条件渲染的定位全靠它）

#### 第 2 层：更新机制（核心竞争力）

- **Keyed list diff 算法**
  - 教学级：snabbdom 的**双端比较**
  - 工业级：Vue 3 的**最长递增子序列（LIS）**求最小移动次数
  - React 的**单链表 Fiber + 两轮遍历**
  - 必须理解 `key` 为什么不能用 index
- **响应式 / 状态追踪**（决定"何时更新"）
  - Signals 模型：`track` / `trigger`、依赖图、拓扑排序、菱形依赖的 glitch 问题
  - 或 React 模型：不可变数据 + `setState` 标脏 + 自顶向下重跑
- **调度与批处理**：微任务队列合并更新、`requestIdleCallback` / `MessageChannel` 时间切片、优先级（React Lane 模型）
- **组件生命周期与副作用时序**：挂载/更新/卸载、effect 清理函数、`useEffect` 与 `useLayoutEffect` 的时机差别

#### 第 3 层：工程化能力

- **SSR 与 hydration**：字符串渲染、XSS 自动转义、客户端复用已有 DOM、hydration mismatch 检测
- **Context / 依赖注入**：不透传 props 的跨层级传值
- **Portal / Suspense / ErrorBoundary** 这类"逃逸舱"机制
- **DevTools 对接**：暴露全局 hook 让扩展读取组件树
- **TS 类型体操**：让 `IntrinsicElements` 精确、组件 props 可推导

#### 第 4 层（可选）：走编译路线

- 学 **Babel 插件 / AST 操作**（`@babel/parser`、visitor 模式）
- 读 `babel-plugin-jsx-dom-expressions` —— Solid 的灵魂，把 JSX 编译成 `template.cloneNode(true)` + 精确 effect 绑定，是当前性能天花板的思路

### 5.6 推荐阅读顺序

1. **[Build your own React](https://pomb.us/build-your-own-react/)**（Rodrigo Pombo）—— 300 行实现 Fiber + 协调 + hooks，**最佳起点，一晚可读完**
2. **[snabbdom](https://github.com/snabbdom/snabbdom)** —— 约 500 行纯 VDOM，双端 diff 经典教材
3. **[Preact](https://github.com/preactjs/preact)** —— 生产级但只有几千行，`src/diff/index.js` 与 `src/jsx.d.ts` 值得逐行读；**它的 `jsx-runtime` 导出方式就是标准答案**
4. **Vue 3 `packages/runtime-core/src/renderer.ts`** —— 看 `patchKeyedChildren` 的 LIS 实现
5. **[Solid](https://github.com/solidjs/solid) + dom-expressions** —— 无 VDOM 路线
6. **[million.js](https://github.com/aidenybai/million) / [hyperapp](https://github.com/jorgebucaran/hyperapp)** —— 极简实现的灵感来源

### 5.7 一句话路线图

**先照抄 `jsx-runtime` 三件套（`jsx` / `jsxs` / `Fragment`）+ `exports` 子路径 + `JSX` 命名空间**，两小时就能让 `<div/>` 渲染出来；然后把 90% 精力投在"**如何最小代价地更新已有 DOM**"上 —— 那才是所有框架真正的分水岭，JSX 那层壳是最简单的部分。

---

## 附：核心结论速查

| 问题 | 结论 |
|---|---|
| `.ts` 与 `.tsx` 差别 | 仅 JSX 解析开关；代价是 `.tsx` 丢失 `<T>` 断言语法 |
| JSX 是 ES 标准吗 | 不是，是语法扩展；但 TS 编译器内置支持 |
| JSX 是 HTML 吗 | 不是，编译后是函数调用，产物是描述 UI 的 JS 对象 |
| TS 怎么校验标签 | 查 `JSX.IntrinsicElements`，由类型包提供，可插拔 |
| `react-jsx` 要装 react 吗 | **包要装**（产物 import `react/jsx-runtime`），**`import React` 不用写** |
| React vs Vue JSX 最大差异 | 更新模型：React 重跑组件函数 + 手动 memo；Vue setup 跑一次 + 响应式精确追踪 |
| Vue 里 JSX 的代价 | 无法生成 patchFlag，放弃 template 的编译时优化 |
| 自研框架的规范接口 | `<pkg>/jsx-runtime` 导出 `jsx` / `jsxs` / `Fragment`，dev 版导出 `jsxDEV` |
| 自研框架的真正难点 | 不是 JSX，而是 diff / 响应式 / 调度 |
