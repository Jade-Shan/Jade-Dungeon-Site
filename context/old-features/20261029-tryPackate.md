# 设计打包方案与项目结构


## 阻塞项：顶层 DOM 求值

[web.ts:6](../../common-utils/src/web.ts#L6) 的 `EscapeUnicode` 类写在模块顶层：

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

### 1 影响范围会扩散

[canvas.ts](../../common-utils/src/ui/canvas.ts) 本身零 DOM 依赖（纯 Canvas 绘图抽象），
但因为 `import { WebUtil } from '../web.js'` 被连带污染。
[UIWindow.ts](../../common-utils/src/ui/UIWindow.ts) 同理。

纯浏览器环境使用不受影响，当前 CDN 部署方式也完全正常。
但作为 npm 包，使用方一旦有 SSR（Next.js / Nuxt）、单元测试或 Node 脚本就会崩。

### 2 建议改法

[web.ts:228](../../common-utils/src/web.ts#L228) 的 `initCustomElements()` 本来就是需要显式调用的方法，
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
