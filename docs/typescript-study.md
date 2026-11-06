# TypeScript 工具类型（Utility Types）学习笔记

> 本文由一次重构会话整理而成。起因是把 `src/scripts/ts/ui/UIWindow.ts` 里的 `DockBarParam` 合并为 `Partial<DockBarCfg>`，借此梳理 TypeScript 内置工具类型的用法。
>
> 与本仓库的关系：可直接对照 `src/scripts/ts/ui/UIWindow.ts` 中的 `DockBarCfg` / `DockBarParam` / `WinCfg` / `WinParam` 验证。

## 目录

- [一、Partial 是什么](#一partial-是什么)
- [二、兄弟工具类型速查表](#二兄弟工具类型速查表)
- [三、结合本仓库的实际例子](#三结合本仓库的实际例子)
- [四、Partial 的边界：嵌套字段怎么办](#四partial-的边界嵌套字段怎么办)

---

## 一、Partial 是什么

`Partial` 是 TypeScript **内置工具类型**，本质是一个**映射类型（Mapped Type）**：把传入类型的所有属性一次性变成可选（每个属性后加 `?`）。

```ts
type Partial<T> = {
    [P in keyof T]?: T[P];
};
```

逐字拆解：

- `keyof T` —— 取出 `T` 的所有属性名（键的联合类型）
- `[P in keyof T]` —— 遍历每一个键 `P`
- `?` —— 给每个属性加上可选标记
- `T[P]` —— 保持每个属性原来的类型不变

**核心价值**：用一份字段声明，同时得到「必填版」和「全可选版」两个类型，避免字段重复维护。最常见场景是「构造参数 / 更新参数」——外部调用时只传想覆盖的字段，内部有默认值兜底。

```ts
interface DockBarCfg {
    dockColor: string,
    iconColor: string,
    opacity: {normal: number, hover: number},
    range: number,
    maxScale: number,
}

type DockBarParam = Partial<DockBarCfg>;  // 五个字段全部变为可选
```

## 二、兄弟工具类型速查表

| 工具类型 | 作用 | 反向关系 | 示例 |
|---------|------|---------|------|
| `Partial<T>` | 全部变**可选** | — | `Partial<DockBarCfg>` |
| `Required<T>` | 全部变**必填** | `Partial` 的反向 | `Required<DockBarParam>` |
| `Readonly<T>` | 全部变**只读** | — | `Readonly<Point2D>` |
| `Pick<T, K>` | 只**挑**出 `K` 里的字段 | — | `Pick<DockBarCfg, "range" \| "maxScale">` |
| `Omit<T, K>` | **剔除** `K` 里的字段 | `Pick` 的反向 | `Omit<DockBarCfg, "opacity">` |
| `Record<K, V>` | 造一个 `K → V` 的映射对象 | — | `Record<string, UIObj>` |

各类型的展开效果：

```ts
type T = { a: number, b: string, c: boolean };

type R1 = Partial<T>;   // { a?: number; b?: string; c?: boolean }
type R2 = Required<Partial<T>>; // 回到 { a: number; b: string; c: boolean }
type R3 = Readonly<T>;  // { readonly a: number; readonly b: string; readonly c: boolean }
type R4 = Pick<T, "a" | "c">;    // { a: number; c: boolean }
type R5 = Omit<T, "b">;          // { a: number; c: boolean }
type R6 = Record<"x" | "y", number>; // { x: number; y: number }
```

## 三、结合本仓库的实际例子

`src/scripts/ts/ui/UIWindow.ts` 里的两对接口：

```ts
// ① DockBar —— 恰好是精确 Partial，可直接用工具类型合并
interface DockBarCfg {
    dockColor: string,
    iconColor: string,
    opacity: {normal: number, hover: number},
    range: number,
    maxScale: number,
}
type DockBarParam = Partial<DockBarCfg>;

// ② WinCfg / WinParam —— 嵌套字段也要可选，不能直接用 Partial（见下一节）
```

构造函数配合默认值使用：

```ts
class DockBar {
    cfg: DockBarCfg = {
        dockColor: "rgb(100,100,100)",
        iconColor: "rgb(34,199,158)",
        opacity: {normal: 55, hover: 75},
        range: 300,
        maxScale: 1.8
    };

    constructor(cfg?: DockBarParam) {   // cfg 全可选
        if (cfg?.dockColor) { this.cfg.dockColor = cfg.dockColor; }
        // ...
    }
}

new DockBar();                                // 全用默认值
new DockBar({ dockColor: "black", range: 500 });  // 只覆盖两个字段
```

## 四、Partial 的边界：嵌套字段怎么办

`Partial` 只做**一层**可选，嵌套对象内部的字段不会变可选。

```ts
interface WinCfg {
    icons: IconGroup,
    scalable: boolean,
    body: {
        initSize: {width: number, height: number},
        overflow: string
    },
}

type NotEnough = Partial<WinCfg>;
// 结果是：
// { icons?: IconGroup; scalable?: boolean; body?: { initSize: {...}; overflow: string } }
// 注意 body 一旦传入，initSize / overflow 仍是必填！
```

要连 `body.initSize`、`body.overflow` 都可选，需要手写递归的 `DeepPartial`：

```ts
type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

type WinParam = DeepPartial<WinCfg>;
// body 及其内部 initSize / overflow 全部变为可选
```

这正是本仓库 `WinCfg` / `WinParam` 未像 `DockBar` 那样简单合并的原因——它们需要 `DeepPartial` 而不是 `Partial`。
