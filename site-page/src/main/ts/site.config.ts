/**
 * 本站（jade-dungeon）的站点配置
 *
 * 这些值原来写在 `ui/webHtmlPage.ts` 的 `SITE_NAV_ITEMS` / `SITE_THEMES` 两个
 * 导出常量里 —— 库层带着某一个站点的导航树、品牌名和个人 GitHub 链接，
 * 别人装了包就得连带拿到。现在库只定义 `SiteConfig` 类型，值放在本文件。
 *
 * 本文件**不在** `package.json` 的 `exports` 里，和 `env.demo.ts` 一样不对外发布。
 * 按 `docs/refactor-20261101.md` 第 3.2 节的目标结构，将来 blog / wiki 各拆成
 * 独立的 app 时，各自带一份自己的 site config，本文件随之一分为二。
 *
 * 导航树里 `Themes` 那组的 `id` 与 `themes` 的 `elemSlt` 是一一对应的：
 * 导航项渲染出带 id 的 `<a>`，`bindChangeTheme()` 再按选择器找到它绑点击事件。
 * 改一边就要改另一边。
 */
import { SiteConfig } from '@jade-dungeon/jade-utils/web-html-page';

/** 本站的站点配置 */
export const JADE_DUNGEON_SITE: SiteConfig = {
	brandName: "Jade Dungeon",
	brandLink: "/",
	navItems: [
		{ title: "Journal", link: "/" },
		{ title: "Gallery", link: "/gallery.html" },
		{ title: "Note"   , link: "/study/notes/wiki_html" },
		{
			title: "About Me", subs: [
				{ title: "Github", link: "//github.com/Jade-Shan/", isNewWin: true },
				{ title: ""      , link: "" },
				{ title: "Resume", link: "/resume.html" }]
		},
		{
			title: "Themes", subs: [
				{ title: "hobbit", id: "switch-theme-hobbit"     , link: "#" },
				{ title: "lo-fi" , id: "switch-theme-lo-fi"      , link: "#" },
				{ title: "paper" , id: "switch-theme-paper-print", link: "#" }]
		}
	],
	themes: [
		{ elemSlt: "#switch-theme-hobbit"     , themeName: "hobbit"      },
		{ elemSlt: "#switch-theme-lo-fi"      , themeName: "lo-fi"       },
		{ elemSlt: "#switch-theme-paper-print", themeName: "paper-print" },
	],
};
