# TypeScript 操作 SVG 图像

TypeScript 本身不"操作" SVG，它只是在浏览器 DOM 环境里操作 SVG 元素，同时提供类型检查和语法糖。核心规则只有一条：**SVG 元素必须用命名空间创建和操作**。

## 1. 核心：SVG 命名空间

SVG 是 XML，不属于 HTML 命名空间，所以不能用 `document.createElement`，必须用 `createElementNS`：

```typescript
const SVG_NS = "http://www.w3.org/2000/svg";

const svg = document.createElementNS(SVG_NS, "svg");
const path = document.createElementNS(SVG_NS, "path");
```

## 2. 常见操作

### 创建并挂载一个 SVG

```typescript
const svg = document.createElementNS(SVG_NS, "svg");
svg.setAttribute("viewBox", "0 0 100 100");
svg.setAttribute("width", "200");
svg.setAttribute("height", "200");
document.body.appendChild(svg);
```

### 修改图形属性（`fill` / `stroke` / `d` 路径）

```typescript
const circle = document.createElementNS(SVG_NS, "circle");
circle.setAttribute("cx", "50");
circle.setAttribute("cy", "50");
circle.setAttribute("r", "40");
circle.setAttribute("fill", "#ff6347");
circle.setAttribute("stroke", "#333");
circle.setAttribute("stroke-width", "2");
svg.appendChild(circle);
```

> **注意**：SVG 里带连字符的属性（`stroke-width`、`viewBox`、`transform-origin`）必须用 `setAttribute`，不能用 `element.strokeWidth = ...`（属性名映射会错乱）。只有少数属性（如 `fill`、`style`）可以直接赋值。

### 修改路径 `d`（画线/画形状）

```typescript
const path = document.createElementNS(SVG_NS, "path");
path.setAttribute("d", "M10 10 H 90 V 90 H 10 Z");
path.setAttribute("fill", "none");
path.setAttribute("stroke", "blue");
svg.appendChild(path);

// 动态改路径
path.setAttribute("d", "M20 20 L 80 80");
```

### transform 变换（平移/缩放/旋转）

```typescript
const g = document.createElementNS(SVG_NS, "g");
g.setAttribute("transform", "translate(10, 20) rotate(45)");
svg.appendChild(g);
```

### 事件绑定

```typescript
circle.addEventListener("click", () => {
  circle.setAttribute("fill", "#00ff00");
});
```

### 读取/操作已有 SVG

```typescript
const rect = document.querySelector<SVGRectElement>("#myRect");
if (rect) {
  rect.setAttribute("width", "80");
}
```

## 3. 加载外部 SVG 文件

`<img>` 加载的 SVG 无法操作内部（被隔离成位图）。要操作需拉取文本再解析：

```typescript
async function loadSvg(url: string): Promise<SVGSVGElement> {
  const res = await fetch(url);
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  return doc.documentElement as unknown as SVGSVGElement;
}
```

## 4. TypeScript 类型

类型定义在 TS 内置的 `lib.dom.d.ts` 里，无需额外安装：

| 元素 | 类型 |
|------|------|
| `<svg>` | `SVGSVGElement` |
| `<g>` | `SVGGElement` |
| `<path>` | `SVGPathElement` |
| `<circle>` | `SVGCircleElement` |
| `<rect>` | `SVGRectElement` |
| 通用 | `SVGElement` |

## 5. 工具类封装（namespace + 静态方法）

```typescript
// svgUtil.ts
export namespace SvgUtil {
  export const NS = "http://www.w3.org/2000/svg";

  export function create<K extends keyof SVGElementTagNameMap>(
    tag: K
  ): SVGElementTagNameMap[K] {
    return document.createElementNS(NS, tag);
  }

  export function set(
    el: SVGElement,
    attrs: Record<string, string>
  ): SVGElement {
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
    return el;
  }
}
```

使用示例：

```typescript
import { SvgUtil } from "./svgUtil.js";

const svg = SvgUtil.create("svg");
SvgUtil.set(svg, { viewBox: "0 0 100 100", width: "200", height: "200" });

const circle = SvgUtil.create("circle");
SvgUtil.set(circle, { cx: "50", cy: "50", r: "40", fill: "#ff6347" });

svg.appendChild(circle);
document.body.appendChild(svg);
```

`createElementNS` 配合 `SVGElementTagNameMap` 能自动推断返回类型，`create("circle")` 直接得到 `SVGCircleElement`，无需手动断言。

## 总结

记住 `createElementNS` + `setAttribute` 这两件套，就掌握了大部分 SVG 操作，剩下的都是具体的属性和 `d` 路径语法。
