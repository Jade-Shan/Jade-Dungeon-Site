/**
 * 第三方全局脚本库的封装
 *
 * 这里的每个类都依赖**通过 `<script>` 标签加载的全局变量**
 * （`$` / `MathJax` / `SyntaxHighlighter` / `showdown`），所以按
 * `docs/refactor-20261101.md` 第 3.4 节这个文件不该发 npm 包 ——
 * 切 workspaces 时整个归 site-page 项目。
 *
 * **`BootStrapHelper.renderTopNav` 已挪到库侧的
 * [ui/bootstrapTemplate.ts](ui/bootstrapTemplate.ts)**，
 * 因为它是纯字符串拼接、零全局变量，而且是 `TopNavRenderer` 的一个实现。
 * 用法从 `BootStrapHelper.renderTopNav` 改成 `BootStrapTemplate.renderTopNav`。
 */

/**
 * SyntaxHighlighter 代码高亮库的声明
 * 参考：https://github.com/syntaxhighlighter/syntaxhighlighter/blob/master/scripts/shCore.js
 */
declare namespace SyntaxHighlighter {
	/**
	 * 对所有 pre 元素执行语法高亮
	 * @returns {void}
	 */
	function all(): void;
	namespace autoloader {
		/**
		 * 批量注册语言别名与对应的高亮脚本路径
		 * @param args - 动态参数列表，每两个参数为一组：语言别名和对应脚本路径
		 * @returns {any}
		 */
		function apply(...args: any[]): any;
	}
}

/**
 * SyntaxHighlighterHelper 代码高亮库的工具类
 */
export class SyntaxHighlighterHelper {

	/**
	 * 加载 SyntaxHighlighter 各语言高亮脚本并执行高亮
	 *
	 * `hlCodePath` 原来有个默认值 `../../vimwiki-theme/3rd/SyntaxHighlighter/...`,
	 * **指向的是本项目之外的另一个 vimwiki 项目的目录**。那个路径对别的使用方
	 * 没有任何意义，而且一旦漏传就会静默地去加载不存在的脚本（autoloader 不报错，
	 * 高亮只是不生效）。所以现在改成必传 —— 库不该知道别人的 brush 脚本放在哪。
	 *
	 * 本站 wiki 页面的那个路径挪到了 `blog/wiki.ts` 的
	 * `DEFAULT_WIKI_PAGE_CONFIG.hlCodePath`（应用层），调用方不用改。
	 *
	 * @param hlRootPath - 站点根路径前缀，空值按空串处理
	 * @param hlCodePath - 高亮脚本（shBrush*.js）所在目录，**必传**，不带尾斜杠
	 * @returns {void}
	 */
	static loadCodeHightlight(hlRootPath: string | undefined, hlCodePath: string) {
		hlRootPath = hlRootPath ? hlRootPath : "";
		let basePath = `${hlRootPath}${hlCodePath}/`;
		let parsePath = (arr: Array<string>): Array<string> => {
			let lines: Array<string> = [];
			for (let i = 0; i < arr.length; i++) {
				let arg = arr[i];
				let line = arg.replace('@', basePath);
				lines.push(line);
			}
			return lines;
		};
		let pathArr = parsePath([
			'applescript            @shBrushAppleScript.js',
			'actionscript3 as3      @shBrushAS3.js',
			'bash shell             @shBrushBash.js',
			'coldfusion cf          @shBrushColdFusion.js',
			'cpp c                  @shBrushCpp.js',
			'c# c-sharp csharp      @shBrushCSharp.js',
			'css                    @shBrushCss.js',
			'delphi pascal          @shBrushDelphi.js',
			'diff patch pas         @shBrushDiff.js',
			'erl erlang             @shBrushErlang.js',
			'groovy                 @shBrushGroovy.js',
			'java                   @shBrushJava.js',
			'jfx javafx             @shBrushJavaFX.js',
			'js jscript javascript  @shBrushJScript.js',
			'perl pl                @shBrushPerl.js',
			'php                    @shBrushPhp.js',
			'text plain             @shBrushPlain.js',
			'py python              @shBrushPython.js',
			'ruby rails ror rb      @shBrushRuby.js',
			'sass scss              @shBrushSass.js',
			'latex                  @shBrushLatex.js',
			'less                   @shBrushLess.js',
			'scala                  @shBrushScala.js',
			'scheme                 @shBrushScheme.js',
			'clojure                @shBrushClojure.js',
			'sql                    @shBrushSql.js',
			'vb vbnet               @shBrushVb.js',
			'xml xhtml xslt html    @shBrushXml.js'])
		SyntaxHighlighter.autoloader.apply(null, pathArr);
		SyntaxHighlighter.all();
	};

}

/**
 * MathJax 数学公式库的声明
 * 参考：https://github.com/mathjax/MathJax/blob/master/unpacked/jax/output/HTML-CSS/fonts/STIX-Web/woff2/STIXWeb-Regular.woff2
 */
declare class MathJaxNode {
	/** 父节点引用 */
	parentNode: MathJaxNode;
	/** CSS 类名 */
	className: string;
}
/**
 * MathJaxRec 数学公式库的记录
 * 参考：https://github.com/mathjax/MathJax/blob/master/unpacked/jax/output/HTML-CSS/fonts/STIX-Web/woff2/STIXWeb-Regular.woff2
 */
declare class MathJaxRec {
	/**
	 * 获取该公式渲染元素的源 DOM 节点
	 * @returns {MathJaxNode} 源元素节点
	 */
	SourceElement(): MathJaxNode;
}

/**
 * MathJax 数学公式库的声明
 * 参考：https://github.com/mathjax/MathJax/blob/master/unpacked/jax/output/HTML-CSS/fonts/STIX-Web/woff2/STIXWeb-Regular.woff2
 */
declare namespace MathJax {
	namespace Hub {
		/**
		 * 配置 MathJax 渲染参数
		 * @param config - MathJax 配置对象
		 * @returns {void}
		 */
		function Config(config: any): void;
		/**
		 * 将回调函数加入 MathJax 执行队列
		 * @param func - 回调函数
		 * @returns {void}
		 */
		function Queue(func: () => void): void;
		/**
		 * 获取页面中所有已渲染公式的记录
		 * @returns {Array<MathJaxRec>} 公式记录数组
		 */
		function getAllJax(): Array<MathJaxRec>;
	}
}

/**
 * MathJaxHelper 数学公式库的工具类
 */
export class MathJaxHelper {

	/**
	 * 默认的 MathJax 配置
	 * 包含 TeX 公式编号、扩展列表、tex2jax 转换规则以及 HTML-CSS / SVG 输出选项
	 */
	private static defaultMathJaxCfg = {
		TeX: { equationNumbers: { autoNumber: ["AMS"], useLabelIds: true }, extensions: ["color.js", "enclose.js"] },
		extensions: ["tex2jax.js", "TeX/AMSmath.js", "TeX/AMSsymbols.js"],
		tex2jax: { inlineMath: [['$', '$'], ['\\(', '\\)']], displayMath: [['$$', '$$'], ['\\[', '\\]']], skipTags: ['script', 'noscript', 'style', 'textarea', 'code', 'pre'] },
		"HTML-CSS": {
			// fonts: ["Latin-Modern"],
			availableFonts: ["TeX"],
			linebreaks: { automatic: false }
		},
		SVG: { linebreaks: { automatic: false } }
	};

	/**
	 * MathJax 渲染完成后的默认回调：为公式源元素的父节点添加 CSS 类标记
	 *
	 * 修复 MathJax 执行完后 &lt;code&gt; 标签的问题，用于克服 Markdown 的局限。
	 * @see https://github.com/mojombo/jekyll/issues/199
	 * @returns {void}
	 */
	static defaultQueue() {
		let all = MathJax.Hub.getAllJax();
		for (let i = 0; i < all.length; i += 1) {
			if (all[i].SourceElement().parentNode.className.indexOf('has-jax') == -1) {
				all[i].SourceElement().parentNode.className += ' has-jax';
			}
			if (all[i].SourceElement().parentNode.className.indexOf('no-highlight') == -1) {
				all[i].SourceElement().parentNode.className += ' no-highlight';
			}
		}
	}

	/**
	 * 初始化数学公式库
	 *
	 * @param config - MathJax 配置对象，未提供时使用默认配置
	 * @param queueFunc - MathJax 执行队列回调，未提供时使用默认回调
	 * @returns {void}
	 */
	static initMathJax(config?: any, queueFunc?: () => void) {
		MathJax.Hub.Config(config ? config : MathJaxHelper.defaultMathJaxCfg);
		MathJax.Hub.Queue(queueFunc ? queueFunc : MathJaxHelper.defaultQueue);
	}

}

// import jQuery from '@types/jquery'
// import $ from 'jquery';
// declare type $ = any;
/**
 * jQuery 的声明
 * 参考：https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/jquery/index.d.ts
 * @param selector - CSS 选择器字符串或 DOM 元素
 * @returns {any} jQuery 对象
 */
declare function $(cc: any): any;

/**
 * BootStrapHelper 的工具类
 * 参考：https://getbootstrap.com/docs/3.4/javascript/
 */
export class BootStrapHelper {

	/**
	 * 初始化 Bootstrap 图片查看模态框
	 *
	 * 必须要在页面上加上：
	 * `<div id="photo-frame" class="modal fade photo-frame" tabindex="-1" role="dialog" aria-labelledby="myModalLabel" aria-hidden="true"></div>`
	 * 因为 bootstrap 的导入在最前面。如果 bootstrap.js 已经导入了再添加 div 就没有用了。
	 *
	 * @param photoFrameId - 模态框容器 ID，默认为 "photo-frame"
	 * @returns {void}
	 */
	static initPhotoFrame(photoFrameId?: string): void {
		let photoElem = document.querySelector(`#${photoFrameId ? photoFrameId : "photo-frame"}`);
		if (photoElem) {
			photoElem.innerHTML = `
				<div class="modal-dialog">
					<div class="modal-content">
						<div class="modal-header">
							<button type="button" class="close" data-dismiss="modal" aria-hidden="true">×</button><h4 class="modal-title" id="${photoFrameId}-label" style="margin-right:20px;"></h4>
						</div>
						<div class="modal-body row">
							<img id="${photoFrameId}-img" alt="" src="" class="col-xs-12 col-sm-12 col-md-12 col-lg-12">
						</div>
					</div>
				</div>`;
		}
	};

	/**
	 * 在 Bootstrap 模态框中查看图片
	 *
	 * @param title - 图片标题，显示在模态框标题栏和 img alt 属性
	 * @param url - 图片 URL
	 * @param photoFrameId - 模态框容器 ID，默认为 "photo-frame"
	 * @returns {void}
	 */
	static viewPic(title: string, url: string, photoFrameId?: string): void {
		photoFrameId = photoFrameId ? photoFrameId : "photo-frame";
		let photoLabel = document.querySelector(`#${photoFrameId}-label`);
		if (photoLabel) {
			photoLabel.innerHTML = title;
		}
		let photoImg: HTMLImageElement | null = document.querySelector(`#${photoFrameId}-img`);
		if (photoImg) {
			photoImg.src = url;
			photoImg.alt = title;
		}
		($(`#${photoFrameId}`) as any).modal('show');
	};

	/**
	 * 为指定图片元素绑定点击查看事件
	 *
	 * @param elemSlt - 图片元素的 CSS 选择器，默认为 "img.atc-img"
	 * @param photoFrameId - 模态框容器 ID，默认为 "photo-frame"
	 * @returns {void}
	 */
	static bindImageFrame(elemSlt?: string, photoFrameId?: string): void {
		let elemArr = document.querySelectorAll<HTMLImageElement>(elemSlt ? elemSlt : 'img.atc-img');
		elemArr.forEach((photoImg: HTMLImageElement, key: number, parent: NodeListOf<HTMLImageElement>) => {
			if (photoImg) {
				photoImg.onclick = (ev: MouseEvent): any => {
					// 懒加载的图片点开时可能还停在占位图上，优先取 data-origin 的原图地址
					let url = photoImg.getAttribute("data-origin") || photoImg.src;
					BootStrapHelper.viewPic(photoImg.alt, url, photoFrameId);
				};
			}
		});
	}

}

/**
 * DataTableHelper 的工具类
 * 参考：https://datatables.net/
 * 参考：https://github.com/DataTables/DataTables/blob/master/media/js/dataTables.js
 * 参考：https://github.com/DataTables/DataTables/blob/master/media/js/dataTables.bootstrap.js
 */
export class DataTableHelper {

	/**
	 * 初始化 DataTable 表格插件
	 *
	 * 将 &lt;thead&gt; 从 &lt;tbody&gt; 中提取出来，并根据行数决定是否启用搜索和分页。
	 * @param elemSlt - 表格的 CSS 选择器，默认为 `div.content>table`
	 * @returns {void}
	 */
	static bindInitDataTable(elemSlt?: string): void {
		$(elemSlt ? elemSlt : 'div.content>table').each((n: any, t: any) => {
			let table = $(t);
			let thead = table.find('thead');
			// 用 .length 而不是 .size()：后者在 jQuery 3.0 已移除，调用会抛
			// `thead.size is not a function`。$ 声明的返回类型是 any，TS 查不出来
			if (thead.length < 1) {
				thead = $('<thead></thead>');
				let rows = table.find('tbody>tr');
				rows.each((ln: any, r: any) => {
					let row = $(r); let th = row.find("th");
					if (th.length > 0) { thead.append(row); }
				});
				if (thead.find('th').length > 0) { // 要有表头才能加上DataTable
					table.append(thead);
					let rowCount = rows.length as number;
					if (rowCount > 20) {  // 20行不到的表就不加DataTable了
						try {
							let info = false; let paging = false; let searching = false;
							if (rowCount > 30) { // 大于30行的表要加上搜索和分页
								info = true;
								paging = true;
								searching = true;
							}
							table.DataTable({ info: info, paging: paging, searching: searching });
						} catch (e) { console.error(e); }
					}
				}
			}
		});
	}

}

/**
 * showdown.js 的声明
 * 基础的markdown转html的库
 * 参考：https://github.com/showdownjs/showdown/blob/master/dist/showdown.js
 */
declare namespace showdown {

	class Converter {
		/**
		 * 将 Markdown 文本转换为 HTML
		 * @param markdownStr - Markdown 格式的字符串
		 * @returns {string} 转换后的 HTML 字符串
		 */
		makeHtml(markdownStr: string): string;
	}

}
/**
 * ShowdownUtils 的工具类
 * 基础的markdown转html的库
 * 参考：https://github.com/showdownjs/showdown/blob/master/dist/showdown.js
 */
let showdownConverter: showdown.Converter | null = null; // new showdown.Converter();

/**
 * ShowdownUtils 的工具类
 * 基础的markdown转html的库
 * 参考：https://github.com/showdownjs/showdown/blob/master/dist/showdown.js
 */
export class ShowdownUtils {

	/**
	 * 将 Markdown 文本转换为 HTML
	 *
	 * @param markdown - Markdown 格式的字符串
	 * @returns {string} 转换后的 HTML 字符串
	 */
	static makeHtml(markdown: string): string {
		showdownConverter = showdownConverter != null ? showdownConverter : new showdown.Converter();
		return showdownConverter.makeHtml(markdown);
	}
}
