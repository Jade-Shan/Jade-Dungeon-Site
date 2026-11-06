/**
 * Bootstrap 3 的导航栏模板
 *
 * 这段骨架的来历：原来写在 `WebHtmlPage.renderTopNav` 里，库层因此硬绑定
 * Bootstrap 3；[15.2 节](../../../docs/refactor-20261101.md)把它挪进了
 * `3rdLibTool.ts` 的 `BootStrapHelper`；现在又从那里拆出来单独成文件。
 *
 * **为什么要拆出来**：`3rdLibTool.ts` 里其余的代码都依赖全局脚本变量
 * （`$` / `MathJax` / `SyntaxHighlighter` / `showdown`），按
 * `docs/refactor-20261101.md` 第 3.4 节那部分不该发包，切 workspaces 时归 site-page 项目。
 * 而这个函数是**纯字符串拼接** —— 零全局变量、零 DOM、零副作用，
 * 而且它是 {@link TopNavRenderer} 的一个实现，和 `ui/webHtmlPage.ts` 配套，
 * 所以留在库侧。详见第 18 节的决定 6 和决定 14。
 *
 * 用法：
 *
 * ```typescript
 * page.renderTopNav(site, "#topnav", BootStrapTemplate.renderTopNav);
 * ```
 */
import { StrUtil } from '../basic.js';
import type { NavTreeNode, TopNavContext } from './webHtmlPage.js';

/**
 * Bootstrap 3 的页面模板
 *
 * 只放**不依赖全局变量**的模板函数。要 jQuery 的那些（模态框、DataTable）
 * 在应用层的 `3rdLibTool.ts` 里。
 */
export class BootStrapTemplate {

	/**
	 * Bootstrap 3 的导航栏模板
	 *
	 * 纯函数：拿 {@link TopNavContext} 产出 HTML 字符串，不碰 DOM。
	 *
	 * 目标元素要带 `.navbar` 系的 class（见 `blog.html` 的 `<nav id="topnav">`），
	 * 折叠按钮的 `data-target` 与容器 id 要对上，否则小屏下展不开。
	 *
	 * @param ctx - 渲染所需的导航树与品牌信息
	 * @returns {string} Bootstrap 3 骨架的导航栏 HTML
	 */
	static renderTopNav(ctx: TopNavContext): string {
		let esc = StrUtil.escapeHtml;
		let addLink = (item: NavTreeNode): string => {
			// title 为空串是分隔符，不是导航项
			if (item.title === "") { return '<li class="divider"></li>'; }
			let html = ctx.activeTitle === item.title ? '<li class="active">' : '<li>';
			html = html + '<a';
			if (item.isNewWin) { html = html + ' target="_blank"'; }
			if (item.id) { html = html + ' id="' + esc(item.id) + '"'; }
			return html + ' href="' + esc(item.link || '') + '">' + esc(item.title) + '</a></li>';
		};
		let addSub = (item: NavTreeNode): string => {
			let html = '<li class="dropdown"><a href="#" class="dropdown-toggle" data-toggle="dropdown">' +
				esc(item.title) + '<b class="caret"></b></a><ul class="dropdown-menu">';
			if (item.subs && item.subs.length > 0) {
				item.subs.forEach((sub) => { html = html + addLink(sub); });
			}
			return html + '</ul></li>';
		};

		let navhtml = '<div class="navbar-header"> ' +
			'<button type="button" class="navbar-toggle" data-toggle="collapse" data-target="#example-navbar-collapse"> ' +
			'<span class="sr-only">切换导航</span> <span class="icon-bar"></span> ' +
			'<span class="icon-bar"></span> <span class="icon-bar"></span> </button> ' +
			'<a class="navbar-brand" href="' + esc(ctx.brandLink) + '">' + esc(ctx.brandName) + '</a> </div> ' +
			'<div class="collapse navbar-collapse" id="example-navbar-collapse"> <ul class="nav navbar-nav">';
		if (ctx.items && ctx.items.length > 0) {
			ctx.items.forEach((item) => {
				if (item.link) { navhtml = navhtml + addLink(item); }
				else if (item.subs) { navhtml = navhtml + addSub(item); }
			});
		}
		return navhtml + '</ul></div>';
	}

}
