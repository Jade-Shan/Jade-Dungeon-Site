import { SimpleMap } from '@jade-dungeon/jade-utils/data';
import {
	CircleToken, ICircleTokenRec, ILineTokenRec, IRectangleTokenRec,
	ImageResource, IToken2D, LineToken, RectangleToken, SandTableUtils, SceneDataResp,
} from '../trpg/sandtable.js';
import { normalizeImageUrl } from './sandboxApi.js';

/**
 * 沙盘场景的状态容器
 *
 * 老代码把六个分组的 `Array` 和 `Map` 平铺在 `this.scene` 上
 *（`teams`/`teamMap`/`creaters`/`createrMap`/...），增删时要手工同步两份 ——
 * `deleteToken()` 就是先删 Map、再把整个 Array 重建一遍。这里收成一个类。
 *
 * ## ⚠️ Token 是不可变的，改位置要用返回值替换
 *
 * `moveTo()` / `scaleTo()` 返回**新实例**（见 `docs/sandbox-refactor.md` 4.6 节：
 * 几何层字段是 `readonly`，`Rectangle2D` 还缓存了顶点与边）。
 * 所以挪动棋子的正确写法是：
 *
 * ```typescript
 * scene.replace('teams', token.moveTo(dx, dy));
 * ```
 *
 * **不是** `token.x += dx`。那样改不了（`readonly`），
 * 强行 `as any` 改则会让缓存的顶点停在旧位置、阴影算错且不报错。
 */

/** 五个 Token 分组的名字。顺序决定渲染层次（先画的在下层） */
export const TOKEN_GROUPS = ['walls', 'doors', 'furnishings', 'creaters', 'teams'] as const;

/** Token 分组名 */
export type TokenGroup = typeof TOKEN_GROUPS[number];

/**
 * 场景状态
 *
 * 五个 Token 分组 + 图片资源。每组用 {@link SimpleMap} 存（保留插入顺序），
 * 取列表时按序展开 —— 不再维护平行的 Array。
 */
export class SandboxScene {

	/** 图片资源，按 id 索引 */
	readonly images: SimpleMap<string, ImageResource> = new SimpleMap();
	/** 五个 Token 分组 */
	private readonly groups: Map<TokenGroup, SimpleMap<string, IToken2D>> = new Map();
	/** 场景所属的用户名（来自 `load-map` 的响应） */
	username = '';

	constructor() {
		for (const g of TOKEN_GROUPS) { this.groups.set(g, new SimpleMap()); }
	}

	/**
	 * 取某组的 Token 列表
	 *
	 * @param group - 分组名
	 * @returns {Array<IToken2D>} 按插入顺序
	 */
	list(group: TokenGroup): Array<IToken2D> {
		const map = this.groups.get(group)!;
		const out: Array<IToken2D> = [];
		for (let i = 0; i < map.size(); i++) {
			const e = map.getElementByIndex(i);
			if (e) { out.push(e[1]); }
		}
		return out;
	}

	/**
	 * 取全部 Token，按渲染层次排好
	 *
	 * 顺序就是 {@link TOKEN_GROUPS}：墙 → 门 → 陈设 → 生物 → 玩家。
	 * 玩家在最上层，所以点击命中测试要**反向**遍历（见 {@link SandboxScene.hitTest}）。
	 *
	 * @returns {Array<IToken2D>}
	 */
	allTokens(): Array<IToken2D> {
		return TOKEN_GROUPS.flatMap(g => this.list(g));
	}

	/**
	 * 按 id 取 Token
	 *
	 * @param group - 分组名
	 * @param id - Token ID
	 * @returns {IToken2D | undefined}
	 */
	get(group: TokenGroup, id: string): IToken2D | undefined {
		return this.groups.get(group)!.get(id) ?? undefined;
	}

	/**
	 * 放入或替换一个 Token
	 *
	 * **挪动/缩放之后必须调它** —— `moveTo()` 返回的是新实例，
	 * 不替换进来的话容器里还是旧位置那个。
	 *
	 * @param group - 分组名
	 * @param token - Token（按 `token.id` 定位）
	 */
	replace(group: TokenGroup, token: IToken2D): void {
		this.groups.get(group)!.put(token.id, token);
	}

	/**
	 * 删掉一个 Token
	 *
	 * @param group - 分组名
	 * @param id - Token ID
	 */
	remove(group: TokenGroup, id: string): void {
		this.groups.get(group)!.remove(id);
	}

	/**
	 * 找出点 `(x, y)` 命中的最上层 Token
	 *
	 * **反向遍历**：渲染是「墙在下、玩家在上」，所以命中判定要从上层往下找，
	 * 否则点在棋子上会先命中它脚下的墙。老代码正向遍历 `allTokens`，
	 * 点重叠处选中的是下层那个。
	 *
	 * @param x - 画布 X
	 * @param y - 画布 Y
	 * @returns {{group, token} | undefined} 命中的 Token 及其所属分组
	 */
	hitTest(x: number, y: number): { group: TokenGroup, token: IToken2D } | undefined {
		for (let i = TOKEN_GROUPS.length - 1; i >= 0; i--) {
			const group = TOKEN_GROUPS[i];
			const list = this.list(group);
			// 同组内也是后放的在上层
			for (let j = list.length - 1; j >= 0; j--) {
				if (list[j].isHit(x, y)) { return { group, token: list[j] }; }
			}
		}
		return undefined;
	}

	/**
	 * 从 `load-map` 的响应装载整个场景
	 *
	 * 图片 URL 会过 {@link normalizeImageUrl} —— 存量数据里是老相对路径，
	 * 新页面的相对基准变了，不归一化会 404（而且是静默换占位图）。
	 *
	 * ## ⚠️ 图片必须在建 Token **之前**加载完
	 *
	 * `fromRecord()` 是把 `ImageResource.imgElem` **快照拷贝**进 Token 的
	 * `imgClip.imageElem` 的（见 `trpg/sandtable.ts`）。所以顺序反了的话，
	 * Token 拿到的是 `undefined`，**之后再把 `imgElem` 填上对已建好的 Token
	 * 没有任何影响** —— 棋子图片不显示，而且 `draw()` 里是
	 * `if (imageElem)` 的空判断，不报错。
	 *
	 * 这就是本方法 `async` 的原因：加载图片这一步**收在里面**，
	 * 不留给调用方排顺序。原来两个调用方都是
	 * `loadFrom()` 之后再 `loadImageResources()`，正好是坏的那个顺序。
	 *
	 * 加载失败不影响装载流程 —— `loadImageByProxy` 内部 catch 住、
	 * 静默换占位图，不抛错。
	 *
	 * @param resp - 后端返回的场景数据
	 * @param assetRoot - 老相对路径的落点，页面从 `envs.js` 注入
	 * @param imgProxyUrl - 图片代理前缀，跨源图片要走它（canvas 污染）
	 * @returns {Promise<void>}
	 */
	async loadFrom(resp: SceneDataResp, assetRoot: string,
		imgProxyUrl?: string): Promise<void> //
	{
		this.username = resp.username ?? '';
		this.images.recs = [];
		for (const g of TOKEN_GROUPS) { this.groups.get(g)!.recs = []; }

		for (const img of resp.imgResources ?? []) {
			this.images.put(img.id, { ...img, url: normalizeImageUrl(img.url, assetRoot) });
		}
		const imgList = this.imageList();
		// 先把图片元素备好，再建 Token。顺序见上面的说明
		await SandTableUtils.loadImageResources(imgList, imgProxyUrl);

		const md = resp.mapDatas;
		if (!md) { return; }
		for (const rec of md.walls ?? []) {
			this.replace('walls', LineToken.fromRecord(rec as ILineTokenRec));
		}
		for (const rec of md.doors ?? []) {
			this.replace('doors', RectangleToken.fromRecord(rec as IRectangleTokenRec, imgList));
		}
		for (const rec of md.furnishings ?? []) {
			this.replace('furnishings', RectangleToken.fromRecord(rec as IRectangleTokenRec, imgList));
		}
		for (const rec of md.creaters ?? []) {
			this.replace('creaters', CircleToken.fromRecord(rec as ICircleTokenRec, imgList));
		}
		for (const rec of md.teams ?? []) {
			this.replace('teams', CircleToken.fromRecord(rec as ICircleTokenRec, imgList));
		}
	}

	/**
	 * 放入或替换一个图片资源
	 *
	 * 编辑器「资源文件」标签页里新增/改 url 后走这里。改的是 `images` 这张
	 * `SimpleMap` 里的值，`imageList()` 和 `requireMapImage()` 会立刻看到。
	 *
	 * @param img - 图片资源（按 `img.id` 定位）
	 */
	putImage(img: ImageResource): void {
		this.images.put(img.id, img);
	}

	/**
	 * 删掉一个图片资源
	 *
	 * 不检查有没有 Token 还在引用它 —— 引用它的 Token 持有的是 `imgElem`
	 * 的**快照**（见 `loadFrom` 的注释），删资源本身不影响已建 Token 的内存显示，
	 * 但保存重载后那些 Token 就找不到图了。编辑器删除时用状态栏提示这一点。
	 *
	 * @param id - 图片资源 ID
	 */
	removeImage(id: string): void {
		this.images.remove(id);
	}

	/**
	 * 图片资源的数组形式，给 `fromRecord()` 用
	 * @returns {Array<ImageResource>}
	 */
	imageList(): Array<ImageResource> {
		const out: Array<ImageResource> = [];
		for (let i = 0; i < this.images.size(); i++) {
			const e = this.images.getElementByIndex(i);
			if (e) { out.push(e[1]); }
		}
		return out;
	}

	/**
	 * 取场景的背景地图图片
	 *
	 * ⚠️ **`imgResources` 里必须有一项 id 为 `map`** ——
	 * 场景的宽高就是这张图的尺寸。老代码直接写
	 * `imageMap.get('map').image.img.width`，缺了就抛
	 * `Cannot read properties of undefined (reading 'image')`，
	 * 指向一句取宽高的代码、看不出是数据缺项。
	 *
	 * 所以这里显式校验并抛可读的错（方案 4.5 节的决定）。
	 *
	 * @returns {ImageResource} id 为 `map` 的图片资源
	 * @throws 没有 `map` 项时抛出带说明的 Error
	 */
	requireMapImage(): ImageResource {
		const map = this.images.get('map');
		if (!map) {
			const ids = this.imageList().map(i => i.id).join(', ') || '(空)';
			throw new Error(
				`场景缺少背景地图：imgResources 里没有 id 为 "map" 的项。` +
				`现有图片资源：${ids}。` +
				`场景的宽高取自这张图，缺了画不出地图 —— ` +
				`请在编辑器的「图片资源」里加一项 id 为 map 的图片。`);
		}
		return map;
	}

	/**
	 * 序列化成 `save-map` 要的 JSON 字符串
	 *
	 * 两点要记住：
	 *
	 * - **`username` 与 `loginToken` 必须塞进去** —— 后端从请求体里解析
	 *   `loginToken` 做鉴权，不信任何 query 参数
	 * - **只写 `visible`，不写 `visiable`** —— 各 Token 的 `toRecord()`
	 *   已经保证了这点，所以场景在这里保存一次就自动转正（4.1 节）
	 *
	 * @param username - 当前用户名
	 * @param loginToken - 登录 token
	 * @returns {string} JSON 字符串
	 */
	toJsonStr(username: string, loginToken: string): string {
		return JSON.stringify({
			username: username,
			loginToken: loginToken,
			imgResources: this.imageList().map(i => ({
				id: i.id, type: i.type, url: i.url,
			})),
			mapDatas: {
				teams: this.list('teams').map(t => t.toRecord()),
				creaters: this.list('creaters').map(t => t.toRecord()),
				furnishings: this.list('furnishings').map(t => t.toRecord()),
				doors: this.list('doors').map(t => t.toRecord()),
				walls: this.list('walls').map(t => t.toRecord()),
			},
		});
	}

}
