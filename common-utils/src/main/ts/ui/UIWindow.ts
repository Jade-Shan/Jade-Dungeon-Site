import { SimpleMap } from "../dataStructure.js";
import { IPoint2D } from "./geo2d.js";
// 图标和桌面背景走注册表，不直接 import resource.ts ——
// 那个文件有 310 行 base64，只想用窗口管理器的人不该被迫下载。
// 要用内置的那套图标，调用 resource.ts 的 registerDefaultUIResource()
import {
	IconGroup, getDesktopBackground, getIconGroup, pickIconSize,
} from "./uiResource.js";
import { IconSize } from "../web.js";
import { WebUtil } from "../web.js";

/* ──────────────────────────────────────────────────────────────
 * 下面四个常量里有两个在**复述 98.css 的尺寸**，两边各写一份，
 * 改一边忘另一边窗口内容区就会算错大小。
 *
 * | 常量              | 值  | 对应的 CSS                                |
 * |-------------------|-----|------------------------------------------|
 * | WIN_BORDER_SIZE   | 6   | 98.css `.window { padding: 3px }` ×2 边   |
 * | WIN_BODY_PADDING  | 25  | 98.css `.window-body { margin: 8px }` ×2  |
 * |                   |     | 边 = 16，再加标题栏占的高度               |
 * | DOCK_BAR_MARGIN   | 10  | **不是 CSS 尺寸** —— 窗口最大化时在底部留  |
 * |                   |     | 的空隙，让 Dock 栏还能接到鼠标事件         |
 * | WIN_Z_IDX_MIN     | 2000| 纯 TS 侧，与 CSS 无关                     |
 *
 * 其中 `WIN_BORDER_SIZE = 6` 与 98.css 的 `padding: 3px` 精确对应；
 * `WIN_BODY_PADDING = 25` 只有 16 来自 `.window-body` 的 margin，
 * 余下 9 是标题栏的高度，**是估出来的、不精确**。
 * 换 98.css 版本或改标题栏样式时这个数要重新量。
 *
 * 为什么不用 CSS 自定义属性做单一数据源：那要在运行时
 * `getComputedStyle(el).getPropertyValue('--x')` 再 parseInt，
 * 为几个数字引入 DOM 读取和解析，收益不抵复杂度。
 * 取舍记录见 docs/refactor-20261101.md 5.4 节与第 19 节。
 *
 * **这几个值依赖 98.css，而它是可选 peer 依赖**（见
 * common-utils/package.json）。不装 98.css 时窗口没有边框和标题栏，
 * 这些数算出来的尺寸会偏大 —— 属于已知局限，不影响功能。
 * ────────────────────────────────────────────────────────────── */

/** 窗口初始 z-index 最小值。纯 TS 侧，与 CSS 无关 */
const WIN_Z_IDX_MIN = 2000;
/** 窗口边框厚度（像素）。= 98.css `.window { padding: 3px }` 的左右两边 */
const WIN_BORDER_SIZE = 6;
/** 窗口内容区内边距（像素）。98.css `.window-body` 的 margin×2 + 标题栏高度（后者为估值） */
const WIN_BODY_PADDING = 25;
/** 窗口最大化时底部留的空隙，让 Dock 栏还能接到鼠标。不对应任何 CSS 尺寸 */
const DOCK_BAR_MARGIN = 10;

/**
 * 桌面环境的参数配置
 */
interface IDesktopConfig {
	/** 桌面区域配置 */
	desktop?: {
		/** 桌面背景图片 */
		backgroundImage?: string,
		/** 桌面宽度 */
		width: string,
		/** 桌面高度 */
		height: string
	},
	/** Dock 任务栏配置 */
	dockBar?: DockBarParam
}

/**
 * 拖动中的窗口状态
 */
interface DraggingWindow {
	/** 被拖动的窗口 */
	win?: UIObj,
	/** 鼠标起始位置 */
	moveStart?: { x: number, y: number },
	/** 窗口起始位置 */
	winStart?: { left: number, top: number }
}

/**
 * 缩放中的窗口状态
 */
interface ScalingWindow {
	/** 被缩放的窗口 */
	win?: UIObj,
	/** 缩放方向（小键盘方位：5=中心） */
	direction?: 1|2|3|4|5|6|7|8|9,
	/** 鼠标起始位置 */
	moveStart?: { x: number, y: number },
	/** 窗口起始信息（位置与大小） */
	winStart?: { left: number, top: number, width: number, height: number }
}

/**
 * 当前窗口状态（顶层、拖动中、缩放中）
 */
interface CurrentWindow {
	/** 当前顶层窗口 */
	top?: UIObj,
	/** 拖动状态 */
	dragging: DraggingWindow,
	/** 缩放状态 */
	scaling: ScalingWindow,
}

/**
 * 桌面环境
 */
export class UIDesktop {
	readonly desktopDiv: HTMLElement; // 窗口在上一级HTML元素
	private allWindows: SimpleMap<string, UIObj> = new SimpleMap(); // 全部窗口的索引
	private windowZIndex: Array<UIObj> = []; // 窗口的z-index序列
	private dockBar?: DockBar; // 程序栏
	private readonly currWin: CurrentWindow = {dragging:{}, scaling:{}};

	/** 获取当前顶层窗口 */
	getCurrTopWin(): UIObj | undefined { return this.currWin.top; }
	/** @param win - 要设为顶层的窗口 */
	setCurrTopWin(win: UIObj): void { this.currWin.top = win; }

	/** 获取当前拖动状态 */
	getCurrDragging() { return this.currWin.dragging; }
	/** @param dragging - 拖动状态 */
	setCurrDragging(dragging: DraggingWindow) {
		this.currWin.dragging = dragging;
	}

	/** 获取当前缩放状态 */
	getCurrScaling() { return this.currWin.scaling; }
	/** @param scaling - 缩放状态 */
	setCurrScaling(scaling: ScalingWindow) {
		this.currWin.scaling= scaling;
	}

	private newWindowPosition = { // 管理新窗口弹出位置
		lastPos: { x: 0, y: 0 }, // 上一次窗口弹出的坐标
		lastTopStart: { x: 0, y: 0 } // 叠完一行以后，下移一行开始重新叠
	};

	// 记录鼠标状态	
	readonly mouseEvtStatus = {
		currPos: {x: 0, y: 0}, 
		btnPress: {left: false, right: false}
	}

	/**
	 * 创建一个桌面环境
	 * 
	 * @param parentElement 上一级元素
	 * @param cfg 配置参数
	 */
	constructor(desktopDiv: HTMLElement, cfg?: IDesktopConfig) {
		this.desktopDiv = desktopDiv;
		desktopDiv.style.height = cfg?.desktop?.height ? cfg.desktop.height : "100%";
		desktopDiv.style.width  = cfg?.desktop?.width  ? cfg.desktop.width  : "100%";
		// 没传背景图时问注册表要。注册表也没有就一行都不写，
		// 保留 CSS 里的值（`style.backgroundImage = ""` 会盖掉样式表）
		let bgImg = cfg?.desktop?.backgroundImage;
		if (!bgImg) {
			const bg = getDesktopBackground();
			if (bg) { bgImg = WebUtil.transBase64ImgURL(bg); }
		}
		if (bgImg) { desktopDiv.style.backgroundImage = bgImg; }
		this.dockBar = cfg?.dockBar ? new DockBar(this, cfg.dockBar) : undefined;

		defaultWinOption.bindWindowDragMoving(this); // 绑定拖动窗口的事件
		defaultWinOption.bindWindowScaleMoving(this); // 绑定缩放窗口的事件
	}

	/**
	 * 桌面上有没有docker
	 * @returns 是否有
	 */
	hasDockBar(): boolean { return this.dockBar !== undefined; }

	/**
	 * 获取窗口对应 Dock 图标的中心位置（相对于桌面）
	 * @param winId - 窗口 ID
	 * @returns 图标中心坐标；Dock 不存在或不可见时返回 undefined
	 */
	getDockIconCenter(winId: string): IPoint2D | undefined {
		if (!this.dockBar || !this.dockBar.isVisible()) { return undefined; }
		return this.dockBar.getIconCenter(winId);
	}

	/**
	 * 取得桌面上窗口的最大层数
	 * @returns 窗口的最大层数
	 */
	getMaxWindowIndex(): number { return this.windowZIndex.length + WIN_Z_IDX_MIN; }

	/**
	 * 通过新窗口的大小计算新窗口弹出的坐标
	 * 
	 * @param width 新窗口的宽度
	 * @param height 新窗口的高度
	 * @returns 新窗口弹出的坐标
	 */
	getNewWindowPosition(width: number, height: number): IPoint2D {
		const margin = 90; // 新弹出的位置的间隔
		const maxLevel = 8; // 同一次弹出时叠加几次
		const maxWidth = this.desktopDiv.clientWidth - margin;
		const maxHeight = this.desktopDiv.clientHeight - margin;

		let newX = this.newWindowPosition.lastPos.x + margin;
		let newY = this.newWindowPosition.lastPos.y + margin;

		let coverlevel = (this.newWindowPosition.lastPos.y -
			this.newWindowPosition.lastTopStart.y) / margin;
		if (coverlevel > maxLevel) { // 叠了几层，换一个位置重新叠
			newX = this.newWindowPosition.lastTopStart.x + margin + margin;
			newY = this.newWindowPosition.lastTopStart.y + margin;
			this.newWindowPosition.lastTopStart.x = newX;
			this.newWindowPosition.lastTopStart.y = newY;
		}

		if (((newX + width) > maxWidth)) {// 一行满了，换一行
			newX = margin;
			newY = this.newWindowPosition.lastTopStart.y + margin;
			this.newWindowPosition.lastTopStart.x = newX;
			this.newWindowPosition.lastTopStart.y = newY;
		}
		if ((newY + height) > maxHeight) { // 纵向满了，回头
			newX = margin;
			newY = margin;
			this.newWindowPosition.lastTopStart.x = newX;
			this.newWindowPosition.lastTopStart.y = newY;
		}

		let lastPos = { x: newX, y: newY };
		this.newWindowPosition.lastPos = lastPos;
		return lastPos;
	}

	/**
	 * 在桌面上添加一个新窗口
	 * 
	 * @param window 新的窗口
	 */
	addWindow(window: UIObj) {
		if (this.windowZIndex.length > 0) {
			let last = this.windowZIndex[this.windowZIndex.length - 1];
			last.activeWindow(false);
		}
		this.allWindows.put(window.id, window);
		this.windowZIndex.push(window);
		if (this.dockBar) {
			this.dockBar.addIcon(window);
		}
	}

	/**
	 * 重新排列窗口 z-index（排除指定窗口），被排除窗口之后会追加到末尾成为顶层
	 * @param excludeId - 要排除的窗口 ID
	 * @returns {Array<UIObj>} 重排后的窗口数组
	 */
	private reorderWindows(excludeId: string): Array<UIObj> {
		let newIndex: Array<UIObj> = [];
		for (let i = 0; i < this.windowZIndex.length; i++) {
			let w = this.windowZIndex[i];
			if (w.id !== excludeId) {
				w.activeWindow(false);
				w.setZIndex(WIN_Z_IDX_MIN + newIndex.length);
				newIndex.push(w);
			}
		}
		return newIndex;
	}

	/**
	 * 关闭一个窗口
	 *
	 * @param win 要关闭的窗口
	 */
	optWinClose(win: UIObj) {
		this.allWindows.remove(win.id);
		let newIndex = this.reorderWindows(win.id);
		this.windowZIndex = newIndex;
		this.desktopDiv.removeChild(win.ui.win);
		if (newIndex.length > 0) {
			let currWin = newIndex[newIndex.length - 1];
			currWin.activeWindow(true);
			currWin.setZIndex(WIN_Z_IDX_MIN + newIndex.length);
		}
		if (this.dockBar) {
			this.dockBar.removeIcon(win);
		}
	}

	/**
	 * 指定一个窗口为当前活动窗口
	 *
	 * @param win 指定的窗口
	 */
	optWinActive(win: UIObj) {
		let newIndex = this.reorderWindows(win.id);
		newIndex.push(win);
		this.windowZIndex = newIndex;
		win.activeWindow(true);
		win.setZIndex(WIN_Z_IDX_MIN + newIndex.length);
	}

}

/**
 * 绑定窗口操作
 */
export interface IBindWinOpt {

	/**
	 * 绑定窗口的关闭操作
	 * @param win 窗口
	 */
	bindWinOptActive: (win: UIObj) => any;

	/**
	 * 绑定窗口的关闭操作
	 *
	 * @param win 窗口
	 * @param btn 绑定的按键
	 */
	bindWinOptClose: (win: UIObj, btn: HTMLElement) => any;

	/**
	 * 绑定窗口的最大化操作
	 *
	 * @param win 窗口
	 * @param btn 绑定的按键
	 */
	bindWinOptMax: (win: UIObj, btn: HTMLElement) => any;

	/**
	 * 绑定窗口的最小化操作
	 *
	 * @param win 窗口
	 * @param btn 绑定的按键
	 */
	bindWinOptMin: (win: UIObj, btn: HTMLElement) => any;


	/* 选中要拖动窗口 */
	bindWindowDragSelect: (win: UIObj, titleBar: HTMLElement, titleBarControl: HTMLElement) => any,

	/* 拖动窗口 */
	bindWindowDragMoving: (desktop: UIDesktop) => any,

	/* 选中要缩放窗口 */
	bindWindowScaleSelect: (win: UIObj) => any,
	/* 缩放窗口 */
	bindWindowScaleMoving: (desktop: UIDesktop) => any,

}
/** 清除缩放状态，恢复默认光标 */
let cleanScaling = (desktop: UIDesktop) => {
	desktop.desktopDiv.style.cursor = "default";
	desktop.setCurrScaling({});
};

/**
 * 默认的窗口操作绑定
 */
export let defaultWinOption = {

	/**
	 * 绑定窗口的关闭操作
	 * @param win 窗口
	 */
	bindWinOptActive: (win: UIObj): any => {
		win.ui.win.addEventListener("mousedown", e => {
			// console.log(`click win ${win.id}`);
			win.desktop.optWinActive(win);
		});
	},

	/**
	 * 绑定窗口的关闭操作
	 * 
	 * @param win 窗口
	 * @param btn 绑定的按键 
	 */
	bindWinOptClose: (win: UIObj, btn: HTMLElement): any => {
		btn.addEventListener("mouseup", e => {
			win.desktop.optWinClose(win);
		});
	},

	/**
	 * 绑定窗口的最大化操作
	 * 
	 * @param win 窗口
	 * @param btn 绑定的按键 
	 */
	bindWinOptMax: (win: UIObj, btn: HTMLElement): any => {
		if (!win.cfg.scalable) {
			return false; // 忽略不可调整大小的窗口
		}
		btn.addEventListener("mousedown", e => {
			let winDiv = win.ui.win;
			let pElem = win.desktop.desktopDiv;
			let start = {
				left: winDiv.offsetLeft, top: winDiv.offsetTop,
				width: winDiv.offsetWidth, height: winDiv.offsetHeight,
			};
			let end = {
				left: winDiv.offsetLeft, top: winDiv.offsetTop,
				width: winDiv.offsetWidth, height: winDiv.offsetHeight,
			};
			if (win.status.isMax) {
				win.status.isMax = false;
				btn.setAttribute("aria-label", "Maximize"),
				end.left   = win.status.lastPos.x;
				end.top    = win.status.lastPos.y;
				end.width  = win.status.lastSize.width;
				end.height = win.status.lastSize.height;
			} else { // 最大化
				win.status.isMax = true;
				btn.setAttribute("aria-label", "Restore"),
				// 保存之前的位置与大小
				win.status.lastPos.x       = start.left  ;
				win.status.lastPos.y       = start.top   ;
				win.status.lastSize.width  = start.width ;
				win.status.lastSize.height = start.height;
				//
				end.left   = 0;
				end.top    = 0;
				end.width  = pElem.clientWidth - WIN_BORDER_SIZE;
				// 如果桌面上有dock，留几个像素让dock可以响应鼠标
				end.height = win.desktop.hasDockBar() ?
						pElem.clientHeight - DOCK_BAR_MARGIN : pElem.clientHeight - WIN_BORDER_SIZE;
			}
			JadeWindowUI.showWinMaxMinAnima(win, 300, 50, start, end);
			setTimeout(() => {
				winDiv.style.left   = `${end.left  }px`;
				winDiv.style.top    = `${end.top   }px`;
				winDiv.style.width  = `${end.width }px`;
				winDiv.style.height = `${end.height}px`;
				let bodyHeight = win.ui.win.offsetHeight - win.ui.titleBar.clientHeight;
				if (win.ui.statusBar) {
					bodyHeight = bodyHeight - win.ui.statusBar.clientHeight;
				}
				win.ui.windowBody.style.height = `${bodyHeight - WIN_BODY_PADDING}px`;
				win.ui.windowBody.style.width  = `${end.width  - WIN_BODY_PADDING}px`;
			}, 350);
		});
	},

	/**
	 * 绑定窗口的最小化操作
	 * 
	 * @param win 窗口
	 * @param btn 绑定的按键 
	 */
	bindWinOptMin: (win: UIObj, btn: HTMLElement): any => {
		btn.addEventListener("mousedown", e => {
			let winDiv = win.ui.win;
			// 最小化动画的终点：优先使用 Dock 图标中心，Dock 不存在或不可见时退回桌面底部中央
			let dockIconPos = win.desktop.getDockIconCenter(win.id);
			let min = dockIconPos ? {
				left: dockIconPos.x,
				top: dockIconPos.y,
				width: 10, height: 1
			} : {
				left: win.desktop.desktopDiv.offsetWidth / 2,
				top: win.desktop.desktopDiv.offsetHeight - 10,
				width: 10, height: 1
			}
			let ori = {
				left: winDiv.offsetLeft, top: winDiv.offsetTop,
				width: winDiv.offsetWidth, height: winDiv.offsetHeight
			}
			if (win.status.isMin) { // 当前是最小化的，恢复到正常
				JadeWindowUI.showWinMaxMinAnima(win, 300, 50, min, ori);
				setTimeout(() => {
					win.status.isMin = false;
					win.ui.win.style.visibility = "visible";
					win.desktop.optWinActive(win); // 恢复的窗口为顶层
				}, 350);
			} else if (win.status.isTop) {
				// 当前活动窗口，最小化
				win.status.isMin = true;
				win.ui.win.style.visibility = "hidden";
				JadeWindowUI.showWinMaxMinAnima(win, 300, 50, ori, min);
			} else if (!win.status.isTop) {
				win.desktop.optWinActive(win);
			}
		})
	},

	/**
	 * 绑定窗口缩放选中事件
	 * 在窗口边缘 7px 范围内检测鼠标，确定缩放方向
	 * @param win - 窗口对象
	 */
	bindWindowScaleSelect: (win: UIObj): any=> {
		let desktop = win.desktop;
		let winDiv = win.ui.win;
		let checkScaleStart = (e: MouseEvent): 1|2|3|4|5|6|7|8|9 => {
			let effSize = 7; // 会触发的范围是5个像素
			let width  = winDiv.offsetWidth ;
			let height = winDiv.offsetHeight;
			let rect = winDiv.getBoundingClientRect();
			let cPoint = { // 点击的位置
				x: parseInt(`${e.clientX - rect.left}`),
				y: parseInt(`${e.clientY - rect.top }`)
			};
			//
			let distance = { x: width - cPoint.x, y: height - cPoint.y };
			let direction: 1|2|3|4|5|6|7|8|9 = 5;
			if (distance.x < 0) {
				return 5;
			} else if (distance.y < 0) {
				return 5;
			} else {
				direction = ( //
					(cPoint.y < effSize) ? //
						((cPoint.x < effSize) ? 7 : (distance.x < effSize) ? 9 : 8) : //
						((distance.y < effSize) ? //
							((cPoint.x < effSize) ? 1 : (distance.x < effSize) ? 3 : 2) : //
							((cPoint.x < effSize) ? 4 : (distance.x < effSize) ? 6 : 5)));
			}
			return direction;
		};
		winDiv.addEventListener("mousedown", (e) => {
			if (win.cfg.scalable && !win.status.isMax && !win.status.isMin) {
				let desktopDiv = desktop.desktopDiv;
				let direction = checkScaleStart(e);
				if (5 != direction) {
					desktop.setCurrScaling({ win: win, direction: direction });
					if (2 === direction || 8 === direction) {
						desktopDiv.style.cursor = "ns-resize";
					} else if (4 === direction || 6 === direction) {
						desktopDiv.style.cursor = "ew-resize";
					} else if (7 === direction || 3 === direction) {
						desktopDiv.style.cursor = "nwse-resize";
					} else if (1 === direction || 9 === direction) {
						desktopDiv.style.cursor = "nesw-resize";
					}
				}
			}
		});
	},


	/**
	 * 绑定窗口缩放拖动事件（全局桌面监听）
	 * @param desktop - 桌面实例
	 */
	bindWindowScaleMoving: (desktop: UIDesktop): any => {
		let desktopDiv = desktop.desktopDiv;
		//
		desktopDiv.addEventListener("mouseup"   , (e) => { cleanScaling(desktop); })
		desktopDiv.addEventListener("mouseleave", (e) => { cleanScaling(desktop); })
		desktopDiv.addEventListener("mousedown" , (e) => {
			setTimeout(() => {
				if (desktop.getCurrScaling().win && desktop.getCurrScaling().direction) {
					let direction = desktop.getCurrScaling().direction;
					let currDiv = desktop.getCurrScaling().win!.ui.win;
					let moveStart = { x: e.clientX, y: e.clientY };
					let winStart  = {
						left  : currDiv.offsetLeft,
						top   : currDiv.offsetTop,
						width : currDiv.offsetWidth,
						height: currDiv.offsetHeight
					};
					desktop.getCurrScaling().direction = direction;
					desktop.getCurrScaling().moveStart = moveStart;
					desktop.getCurrScaling().winStart  = winStart;
				}
			}, 10);
		});
		desktopDiv.addEventListener("mousemove", (e) => {
			if (desktop.getCurrScaling().win && desktop.getCurrScaling().moveStart && desktop.getCurrScaling().winStart) {
				let currWin = desktop.getCurrScaling().win!;
				let winDiv = currWin.ui.win;
				let winStart = desktop.getCurrScaling().winStart!;
				let direction = desktop.getCurrScaling().direction!;
				let dx = e.clientX - desktop.getCurrScaling().moveStart!.x;
				let dy = e.clientY - desktop.getCurrScaling().moveStart!.y;
				//
				let end = {
					left: winStart.left, top: winStart.top,
					width: winStart.width, height: winStart.height,
				};
				if (1 === direction || 2 === direction || 3 === direction) {
					end.height = winStart.height + dy;
				} 
				if (3 === direction || 6 === direction || 9 === direction) {
					end.width = winStart.width + dx;
				} 
				if (7 === direction || 8 === direction || 9 === direction) {
					end.top = winStart.top + dy;
					end.height = winStart.height - dy;
				} 
				if (1 === direction || 4 === direction || 7 === direction) {
					end.left = winStart.left + dx;
					end.width = winStart.width - dx;
				}
				if (5 != direction) {
					end.height = end.height - WIN_BORDER_SIZE;
				}

				winDiv.style.left   = `${end.left  }px`;
				winDiv.style.top    = `${end.top   }px`;
				winDiv.style.width  = `${end.width }px`;
				winDiv.style.height = `${end.height}px`;
				let bodyHeight = end.height - currWin.ui.titleBar.clientHeight;
				if (currWin.ui.statusBar) {
					bodyHeight = bodyHeight - currWin.ui.statusBar.clientHeight;
				}
				currWin.ui.windowBody.style.height = `${bodyHeight - WIN_BODY_PADDING}px`;
				currWin.ui.windowBody.style.width  = `${end.width  - WIN_BODY_PADDING}px`;
			}
		});
	},

	/**
	 * 绑定窗口拖动选中事件（标题栏 mousedown）
	 * @param win - 窗口对象
	 * @param titleBar - 标题栏元素
	 * @param titleBarControl - 标题栏控件区域
	 */
	bindWindowDragSelect: (win: UIObj, titleBar: HTMLElement, titleBarControl: HTMLElement): any => {
		let desktop = win.desktop;
		titleBar.addEventListener("mousedown" , (e) => {
			if (!win.status.isMax && !win.status.isMin) {
				titleBar.style.cursor = "move";
				desktop.setCurrDragging({win:win});
			}
		});
	},

	/**
	 * 绑定窗口拖动移动事件（全局桌面监听）
	 * @param desktop - 桌面实例
	 */
	bindWindowDragMoving: (desktop: UIDesktop): any => {
		let desktopDiv = desktop.desktopDiv;
		//
		let cleanDragging = () => {
			let currWin = desktop.getCurrDragging().win;
			if (currWin) { currWin.ui.titleBar.style.cursor = "default"; }
			currWin = desktop.getCurrTopWin();
			if (currWin) { currWin.ui.titleBar.style.cursor = "default"; }
			desktop.setCurrDragging({});
		};
		desktopDiv.addEventListener("mouseup"   , (e) => { cleanDragging() });
		desktopDiv.addEventListener("mouseleave", (e) => { cleanDragging() });
		// 窗口的拖动要监控整个桌面
		desktopDiv.addEventListener("mousedown", (e) => {
			setTimeout(() => {
				if (desktop.getCurrDragging().win) {
					let currDiv = desktop.getCurrDragging().win!.ui.win;
					let moveStart = { x: e.clientX, y: e.clientY };
					let winStart = {
						left: currDiv.offsetLeft,
						top: currDiv.offsetTop
					};
					desktop.getCurrDragging().moveStart = moveStart;
					desktop.getCurrDragging().winStart = winStart;
				}
			}, 10);
		});
		desktopDiv.addEventListener("mousemove", (e) => {
			let dRct = desktop.desktopDiv.getBoundingClientRect();
			if (e.clientX < dRct.left || e.clientX > dRct.right || e.clientY < dRct.top || e.clientY > dRct.bottom) {
				cleanDragging();
			} else if (desktop.getCurrDragging().win && desktop.getCurrDragging().moveStart && desktop.getCurrDragging().winStart) {
				let currDiv = desktop.getCurrDragging().win!.ui.win;
				let dx = e.clientX - desktop.getCurrDragging().moveStart!.x;
				let dy = e.clientY - desktop.getCurrDragging().moveStart!.y;
				currDiv.style.left = `${desktop.getCurrDragging().winStart!.left + dx}px`;
				currDiv.style.top  = `${desktop.getCurrDragging().winStart!.top  + dy}px`;
			}
		});
	},

};




/**
 * 窗口配置
 */
interface WinCfg {
	// 可选：没传图标、注册表里也没有时为 undefined，此时图标位留空交给 CSS
	icons?: IconGroup,
	bindWinOpt: IBindWinOpt, // 绑定窗口的操作
	scalable: boolean, // 是否可以调整大小
	body: {
		initSize: {width: number, height: number},
		overflow: string
	},
}

/**
 * 窗口构造参数（可选配置）
 */
export interface WinParam {
	/** 窗口的图标组 */
	icons?: IconGroup,
	/** 绑定窗口的操作（关闭/最大化/最小化/拖动/缩放） */
	bindWinOpt?: IBindWinOpt,
	/** 是否可以调整大小 */
	scalable?: boolean,
	/** 窗口主体配置 */
	body?: {
		/** 初始大小 */
		initSize?: {width: number, height: number},
		/** 溢出处理 */
		overflow?: string
	},
}
/**
 * 窗口状态
 */
interface WinStatus {
	isTop: boolean; // 是否是当前窗口
	isMax: boolean; // 是否最大化
	isMin: boolean; // 是否最小化
	isDragging: boolean; // 是否在拖动状态
	readonly lastPos : {x: number, y: number, zIdx: number}; // 正常状态时最后状态
	readonly lastSize: {width: number, height: number}; // 正常状态时最后的大小
}

/**
 * 窗口要用的HTML元素
 */
interface WinUIElement {
	readonly win: HTMLDivElement;        // 窗口
	readonly titleBar: HTMLDivElement;   // 标题栏
	readonly windowBody: HTMLDivElement; // 窗口主体
	statusBar?: HTMLDivElement;          // 窗口状态栏
	menuBar?: HTMLDivElement;          // 窗口状态栏
}

/**
 * 窗口元素的接口
 */
export interface UIObj {
	readonly desktop: UIDesktop;      // 桌面实例
	readonly ui: WinUIElement;        // 窗口中用到的HTML元素
	readonly status: WinStatus;       // 窗口的状态
	readonly id: string;              // 窗口的ID
	title: string;                    // 窗口的标题
	cfg: WinCfg;

	/**
	 * 在桌面上渲染窗口
	 */
	renderIn(): void;

	/**
	 * 设置窗口为当前窗口
	 * @param isActive 是否是当前窗口
	 */
	activeWindow(isActive: boolean): void;

	/**
	 * 设置窗口的层级
	 * @param zIdx 设置层级
	 */
	setZIndex(zIdx: number): void;

	/**
	 * 检查窗口是否处于拖动状态
	 * @returns {boolean}
	 */
	checkDragging(): boolean;

}

/**
 * 窗口的部分实现
 */
export abstract class UIWindowAdapter implements UIObj {
	readonly desktop: UIDesktop;
	readonly ui: WinUIElement;
	readonly status: WinStatus = { 
		isTop: false, isMin: false, isMax: false, isDragging: false,
		lastPos: { x: 10, y: 10, zIdx: 100 },
		lastSize: { width: 320, height: 250 }
	};
	readonly id: string;
	title: string;
	cfg: WinCfg = {
		// 向注册表要默认图标。没注册 provider 时是 undefined，窗口就没图标
		icons: getIconGroup(),
		bindWinOpt: defaultWinOption,
		scalable: true,
		body: { overflow: "auto", initSize: {width: 800, height: 600} }
	};

	/**
	 * 创建窗口对象 
	 * @param desktop 所在的桌面
	 * @param id  窗口ID
	 * @param title 窗口标题
	 * @param bindWinOpt 绑定窗口的操作 
	 */
	constructor(desktop: UIDesktop, id: string, title: string, cfg?: WinParam) {
		this.title = title;
		this.desktop = desktop;
		this.id = JadeWindowUI.genWinId(id);
		let winDiv = document.createElement('div');
		winDiv.id = this.id;
		winDiv.classList.add("window");
		let titleBar = document.createElement('div');
		let windowBody = document.createElement('div');
		windowBody.classList.add("window-body");
		this.ui = { win: winDiv, titleBar: titleBar, windowBody: windowBody };
		if (cfg) {
			if (cfg.bindWinOpt) { this.cfg.bindWinOpt = cfg.bindWinOpt; }
			if (cfg.icons) { this.cfg.icons = cfg.icons; }
			if (cfg.scalable !== undefined) { this.cfg.scalable = cfg.scalable; }
			if (cfg.body) {
				this.cfg.body = { ...this.cfg.body, ...cfg.body };
			}
		}
	}

	/**
	 * 渲染窗口
	 */
	abstract renderIn(): void;

	/**
	 * 设置窗口为当前窗口
	 * @param isActive 是否是当前窗口
	 */
	activeWindow(isActive: boolean): void {
		let div = this.ui.titleBar;
		if (div != null) {
			if (isActive) {
				this.status.isTop = isActive;
				this.desktop.setCurrTopWin(this);
				if (div.classList.contains('inactive')) {
					div.classList.remove('inactive');
				}
			} else if (!isActive && !div.classList.contains('inactive')) {
				this.status.isTop = isActive;
				div.classList.add('inactive');
			} 
		}
	}

	/**
	 * 设置窗口的层级
	 * @param zIdx 设置层级
	 */
	setZIndex(zIndex: number): void {
		this.status.lastPos.zIdx = zIndex; 
		this.ui.win.style.zIndex = `${zIndex}`;
	}

	/**
	 * 检查窗口是否处于拖动状态
	 * @returns {boolean}
	 */
	checkDragging(): boolean { return this.status.isDragging; }

} 

//export abstract class UIWindow extends UIWindowAdptt {

//	constructor(desktop: UIDesktop, id: string, title: string, cfg?: WinParam) {
//		super(desktop, id, title, cfg);
//	}

//	//renderIn(): void {
//	//	let div = JadeWindowUI.renderWindowTplt(this);
//	//}

//}


/**
 * Dock 栏内部配置
 */
interface DockBarCfg {
	/** Dock 栏背景颜色 */
	dockColor: string,
	/** 图标颜色 */
	iconColor: string,
	/** 透明度：normal=默认, hover=悬停 */
	opacity: {normal: number, hover: number},
	/** 图标缩放响应范围 */
	range: number,
	/** 图标最大缩放倍数 */
	maxScale: number,
}

/**
 * Dock 栏构造参数（DockBarCfg 的全可选版本）
 */
type DockBarParam = Partial<DockBarCfg>;

/**
 * Dock 任务栏
 *
 * 桌面底部的程序坞，支持图标缩放动画和透明度响应。
 */
export class DockBar {

	private barDiv: HTMLDivElement;
	private parentElement: HTMLElement;
	cfg: DockBarCfg = {
		dockColor: "rgb(100, 100, 100)",
		iconColor: "rgb(34, 199, 158)",
		opacity: {normal: 55, hover: 75},
		range: 300,
		maxScale: 1.8
	};


	/**
	 * @param desktop - 桌面实例
	 * @param cfg - Dock 栏配置
	 */
	constructor(desktop: UIDesktop, cfg?: DockBarParam) {
		if (cfg) {
			if (cfg.dockColor  ) { this.cfg.dockColor = cfg.dockColor; }
			if (cfg.iconColor  ) { this.cfg.iconColor = cfg.iconColor; }
			if (cfg.range      ) { this.cfg.range     = cfg.range    ; }
			if (cfg.maxScale   ) { this.cfg.maxScale  = cfg.maxScale ; }
			if (cfg.opacity?.normal) { this.cfg.opacity.normal = cfg.opacity.normal; }
			if (cfg.opacity?.hover ) { this.cfg.opacity.hover  = cfg.opacity.hover ; }
		}
		//
		this.parentElement = desktop.desktopDiv;
		let barDiv = document.createElement('div');
		this.barDiv = barDiv;
		barDiv.classList.add('dock-bar');
		barDiv.style.backgroundColor = this.cfg.dockColor;
		barDiv.style.opacity = `${this.cfg.opacity.normal}%`;
		this.parentElement.appendChild(this.barDiv);
		barDiv.addEventListener("mousemove", e => {
			let sizeCurve    = this.createCurve(this.cfg.range, e.clientX, 1, this.cfg.maxScale);
			let opacityCurve = (x: number) => { return this.cfg.opacity.hover; };
			this.layout(sizeCurve, opacityCurve);
		});
		barDiv.addEventListener("mouseleave", e => {
			this.layout((x: number) => 1, (x: number) => this.cfg.opacity.normal);
			barDiv.style.opacity = `${this.cfg.opacity.normal}%`;
			barDiv.style.setProperty('width', 'fit-content');
			barDiv.style.zIndex = `${WIN_Z_IDX_MIN - 1}`; // 下到最低层
		});
		barDiv.addEventListener("mouseenter", e => {
			barDiv.style.opacity = `${this.cfg.opacity.hover}%`;
			barDiv.style.zIndex = `${desktop.getMaxWindowIndex() + 100}`;// 提到最上层
			let rect = barDiv.getBoundingClientRect();
			let width = rect.right - rect.left + 80;
			barDiv.style.setProperty('width', `${width}px`);
		});
	}

	// 生成一个曲线函数
	/**
	 * 生成图标缩放曲线函数（基于 sin 曲线）
	 * @param totalDis - 缩放响应总范围
	 * @param topX - 曲线峰值对应的 X 坐标
	 * @param minY - 最小缩放倍数
	 * @param maxY - 最大缩放倍数
	 * @returns 缩放曲线函数
	 */
	private createCurve(totalDis: number, topX: number,  //
		minY: number, maxY: number): (x: number) => number //
	{
		let baseCurve = (x: number): number => {
			return x < 0 || x > 1 ? 0 : Math.sin(x * Math.PI);
		};
		let curve = (x: number): number => {
			let beginX = topX - totalDis / 2
			let endX = topX + totalDis / 2
			return x < beginX || x > endX ? minY : //
				baseCurve((x - beginX) / totalDis) * (maxY - minY) + minY;
		}
		return curve;
	}

	/**
	 * 根据曲线函数布局所有图标的大小和透明度
	 * @param sizeCurve - 缩放曲线函数
	 * @param opacityCurve - 透明度曲线函数
	 */
	private layout(sizeCurve: (x: number) => number, opacityCurve: (x: number) => number) {
		let items = this.barDiv.children;
		for (let i = 0; i < items.length; i++) {
			let item = items.item(i) as HTMLElement | null;
			if (item != null) {
				let rect = item.getBoundingClientRect();
				let x = rect.left + rect.width / 2;
				// 图标的大小
				let scale = sizeCurve(x);
				item.style.setProperty('--i', `${scale}`);
				// 图标的透明度
				let opacity = opacityCurve(x);
				item.style.opacity = `${opacity}%`;
			}
		}
	}

	/** 生成图标间隔元素的 ID */
	genAppGrapId(winId: string): string { return `appGrp-${winId}`; };

	/** 生成图标元素的 ID */
	genAppIconId(winId: string): string { return `appIco-${winId}`; };

	/**
	 * Dock 栏当前是否可见
	 * @returns 是否可见
	 */
	isVisible(): boolean {
		let style = getComputedStyle(this.barDiv);
		return style.display !== 'none' && style.visibility !== 'hidden';
	}

	/**
	 * 获取指定窗口图标的中心位置（相对于桌面）
	 * @param winId - 窗口 ID
	 * @returns 图标中心坐标；找不到图标时返回 undefined
	 */
	getIconCenter(winId: string): IPoint2D | undefined {
		let icon = document.getElementById(this.genAppIconId(winId));
		if (!icon) { return undefined; }
		let iconRect = icon.getBoundingClientRect();
		let deskRect = this.parentElement.getBoundingClientRect();
		return {
			x: iconRect.left - deskRect.left + iconRect.width / 2,
			y: iconRect.top  - deskRect.top  + iconRect.height / 2
		};
	}

	/**
	 * 向 Dock 栏添加窗口图标
	 * @param win - 窗口对象
	 */
	addIcon(win: UIObj) {
		let items = this.barDiv.children;
		if (items.length > 0) {
			let gap = document.createElement('div');
			gap.id = this.genAppGrapId(win.id);
			gap.classList.add('gap');
			this.barDiv.appendChild(gap);
		}
		//
		let icon = document.createElement('div');
		icon.id = this.genAppIconId(win.id);
		icon.classList.add('menu-item');
		// 没图标时不写 backgroundImage，留给 CSS 的 .menu-item 决定外观
		if (win.cfg.icons) {
			icon.style.backgroundImage = WebUtil.transBase64ImgURL(win.cfg.icons.x32);
		} else {
			icon.classList.add('no-icon');
		}
		icon.style.backgroundSize = "100%";
		icon.style.opacity = `${this.cfg.opacity.normal}%`;
		this.barDiv.appendChild(icon);
		win.cfg.bindWinOpt.bindWinOptMin(win, icon);
	}

	/**
	 * 从 Dock 栏移除窗口图标
	 * @param win - 窗口对象
	 */
	removeIcon(win: UIObj) {
		let iconId = this.genAppIconId(win.id);
		let items = this.barDiv.children;
		for (let i = 0; i < items.length; i++) {
			if (iconId === items.item(i)?.id) {
				let gap : Element | null = null;
				let icon: Element | null = items.item(i);
				if (items.length == 1) {
					// 最后一个元素，没有间隔符
				} else if (i == 0 && items.item(i + 1)?.classList.contains("gap")) {
					// 如果是第一个元素，删除右边的间隔
					gap = items.item(i + 1);
				} else if (items.item(i - 1)?.classList.contains("gap")) {
					// 其他的元素默认删除左边的间隔
					gap = items.item(i - 1);
				}
				if (icon) { this.barDiv.removeChild(icon); }
				if (gap ) { this.barDiv.removeChild(gap ); }
				break;
			}
		}
	}

}


/**
 * Jade 窗口 UI 工具集
 *
 * 提供窗口 ID 生成、标题栏渲染、窗口模板渲染、最大化/最小化动画等功能。
 */
export namespace JadeWindowUI {

	let winIdCounter = 0;
	/** 生成唯一窗口 ID */
	export function genWinId(id: string): string { return `${id}-${Date.now()}-${winIdCounter++}`; }

	/** 生成窗口标题栏 ID */
	export function genWinTitleBarId(id: string): string { return `titBar-${id}`; }

	/** 生成窗口标题图标 ID */
	export function genWinTitleIconId(id: string): string { return `titIcon-${id}`; }

	/** 生成窗口标题文本 ID */
	export function genWinTitleTextId(id: string): string { return `titText-${id}`; }

	let renderTitleBarIcon = (win: UIObj): HTMLDivElement => {
		let titleBarIcon = document.createElement("div");
		titleBarIcon.id = genWinTitleIconId(win.id);
		titleBarIcon.classList.add("title-bar-icon", "cannot-select");
		titleBarIcon.style.width  = '12px';
		titleBarIcon.style.height = '12px';
		// 没图标时加 .no-icon，CSS 把这 12px 收掉，标题文字不会凭空缩进
		const icon12 = pickIconSize(win.cfg.icons, IconSize.x12);
		if (icon12) {
			titleBarIcon.style.backgroundImage = WebUtil.transBase64ImgURL(icon12);
		} else {
			titleBarIcon.classList.add("no-icon");
		}
		return titleBarIcon;
	}
	let renderTitleBarText = (win: UIObj): HTMLDivElement => {
		let titleBarText = document.createElement("div");
		titleBarText.id = genWinTitleTextId(win.id);
		titleBarText.classList.add("title-bar-text", "cannot-select");
		titleBarText.textContent = win.title;
		return titleBarText;
	}
	let renderTitleBarIconText = (win: UIObj): HTMLDivElement => {
		let titleBarIcon = renderTitleBarIcon(win);
		let titleBarText = renderTitleBarText(win);
		let titleBarIconText = document.createElement('div');
		titleBarIconText.classList.add("title-bar-icon-text");
		titleBarIconText.appendChild(titleBarIcon);
		titleBarIconText.appendChild(titleBarText);
		return titleBarIconText;
	}

	let renderTitleBarControls = (win: UIObj): HTMLDivElement => {
		//
		let btnMin = document.createElement("button");
		btnMin.setAttribute("aria-label", "Minimize");
		win.cfg.bindWinOpt.bindWinOptMin(win, btnMin);
		//
		let btnMax = document.createElement("button");
		btnMax.setAttribute("aria-label", "Maximize");
		if (win.cfg.scalable) {
			win.cfg.bindWinOpt.bindWinOptMax(win, btnMax);
		} else {
			btnMax.disabled = true;
		}
		//
		let btnClose = document.createElement("button");
		btnClose.setAttribute("aria-label", "Close");
		win.cfg.bindWinOpt.bindWinOptClose(win, btnClose);
		//
		let titleBarCtls = document.createElement("div");
		titleBarCtls.classList.add("title-bar-controls");
		titleBarCtls.appendChild(btnMin);
		titleBarCtls.appendChild(btnMax);
		titleBarCtls.appendChild(btnClose);
		return titleBarCtls;
	}

	let renderTitleBar = (win: UIObj): HTMLDivElement => {
		let titleBarIconText = renderTitleBarIconText(win);
		let titleBarControls = renderTitleBarControls(win);
		let titleBar = win.ui.titleBar;
		titleBar.id = genWinTitleBarId(win.id);
		titleBar.classList.add("title-bar");
		titleBar.appendChild(titleBarIconText);
		titleBar.appendChild(titleBarControls);
		win.cfg.bindWinOpt.bindWindowDragSelect (win, titleBar, titleBarControls);
		win.cfg.bindWinOpt.bindWindowScaleSelect(win);
		return titleBar;
	}



	/**
	 * 计算一组 DIV 元素的总高度
	 * @param divs - DIV 元素数组
	 * @returns {number} 总高度
	 */
	export function countWindowHeight(divs: Array<HTMLDivElement>): number {
		let totalHeight = 0;
		for (let i = 0; i < divs.length; i++) {
			totalHeight += divs[i].offsetHeight;
		}
		return totalHeight;
	}

	/**
	 * 计算一组 DIV 元素的总宽度
	 * @param divs - DIV 元素数组
	 * @returns {number} 总宽度
	 */
	export function countWindowWidth(divs: Array<HTMLDivElement>): number {
		let totalWidth = 0;
		for (let i = 0; i < divs.length; i++) {
			totalWidth += divs[i].offsetWidth;
		}
		return totalWidth;
	}

	/**
	 * 渲染窗口完整模板（标题栏 + Body + 状态栏）并添加到桌面
	 * @param win - 窗口对象
	 * @param renderWindowBody - 可选的窗口主体渲染函数
	 * @param renderStatusBar - 可选的状态栏渲染函数
	 * @returns {HTMLDivElement} 窗口 DIV 元素
	 */
	export function renderWindowTplt(win: UIObj, renderWindowMenu?: () => HTMLDivElement, renderWindowBody?: () => HTMLDivElement, renderStatusBar?: () => HTMLDivElement): HTMLDivElement {

		let parent = win.desktop.desktopDiv;
		let winDiv: HTMLDivElement = win.ui.win;
		//
		let titleBar = renderTitleBar(win);
		winDiv.appendChild(titleBar );
		//
		if (renderWindowMenu) {
			let menuBar = renderWindowMenu();
			win.ui.menuBar = menuBar;
			winDiv.appendChild(menuBar);
		}
		//
		if (renderWindowBody) { renderWindowBody(); }
		let windowBody = win.ui.windowBody;
		winDiv.appendChild(windowBody);
		//
		if (renderStatusBar) {
			let statusBar = renderStatusBar();
			win.ui.statusBar = statusBar;
			winDiv.appendChild(statusBar);
		}
		// 
		let pos = win.desktop.getNewWindowPosition( //
			winDiv.getBoundingClientRect().width, //
			winDiv.getBoundingClientRect().height);
		win.status.lastPos.x = pos.x;
		win.status.lastPos.y = pos.y;
		winDiv.style.position = 'absolute';
		winDiv.style.left = `${pos.x}px`;
		winDiv.style.top  = `${pos.y}px`;
		parent.style.position = 'relative';
		//
		parent.appendChild(winDiv);
		//
		win.cfg.bindWinOpt.bindWinOptActive(win);
		//
		win.desktop.addWindow(win);
		//计算窗口大小
		let width = winDiv.offsetWidth;
		if (width > parent.offsetWidth) {
			win.status.lastSize.width = width;
			winDiv.style.left = `0px`;
			winDiv.style.width = `${width}px`;
		} else if ((width + win.status.lastPos.x) > parent.offsetWidth) {
			win.status.lastPos.x = parent.offsetWidth - width;
			winDiv.style.left = `${win.status.lastPos.x}px`;
		}
		let height = winDiv.offsetHeight;
		if (height > parent.offsetHeight) {
			win.status.lastSize.height = height;
			winDiv.style.top = `0px`;
			winDiv.style.height = `${height}px`;
		} else if ((height + win.status.lastPos.y) > parent.offsetHeight) {
			win.status.lastPos.y = parent.offsetHeight - height;
			winDiv.style.top = `${win.status.lastPos.y}px`;
		}

		return winDiv;
	};

	/**
	 * 显示窗口最大化/最小化的过渡动画
	 * @param win - 窗口对象
	 * @param zoomMilSec - 缩放动画时长（毫秒）
	 * @param deleMilSec - 动画结束后延迟移除时间（毫秒）
	 * @param start - 动画起始位置和大小
	 * @param end - 动画结束位置和大小
	 */
	export function showWinMaxMinAnima(win: UIObj, zoomMilSec: number, deleMilSec: number,
		start: { left: number, top: number, width: number, height: number },
		end  : { left: number, top: number, width: number, height: number }) //
	{
		let transSec = (zoomMilSec / 1000);
		let pElem = win.desktop.desktopDiv;
		let newDiv = document.createElement('div');
		newDiv.style.zIndex = `${win.status.lastPos.zIdx + 10}`;
		newDiv.style.left = `${start.left}px`;
		newDiv.style.top = `${start.top}px`;
		newDiv.style.width = `${start.width}px`;
		newDiv.style.height = `${start.height}px`;
		newDiv.style.backgroundColor = 'white';
		newDiv.style.border = '3px solid black';
		newDiv.style.position = 'absolute';
		newDiv.style.opacity = '30%';
		pElem.appendChild(newDiv);
		newDiv.style.transition = `left ${transSec}s ease, top ${transSec}s ease, width ${transSec}s ease, height ${transSec}s ease`;
		setTimeout(() => {
			newDiv.style.left = `${end.left}px`;
			newDiv.style.top = `${end.top}px`;
			newDiv.style.width = `${end.width}px`;
			newDiv.style.height = `${end.height}px`;
			setTimeout(() => { pElem.removeChild(newDiv); }, zoomMilSec + deleMilSec);
		}, 10);
	};
}
