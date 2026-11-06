/**
 * 数字工具类，提供数值格式化、精度计算、曲线函数等静态方法。
 */
export class NumUtil {

	/**
	 * 四舍五入到指定小数位数。
	 * @param n 要处理的数字
	 * @param size 保留的小数位数
	 * @returns 四舍五入后的数字
	 */
	static toFixed(n: number, size: number): number {
		let absN = Math.abs(n);
		let m = Math.pow(10, size);
		return (n >= 0 ? 1 : -1) * Math.floor(absN * m + 0.50000000001) / m;
	}

	/**
	 * 以可读的形式格式化数字，按分隔符分组整数和小数部分。
	 *
	 * 注意：小数部分也会按分隔符分组（如 123456.789012 → 123,456.789,012），
	 * 这不符合常规数字格式化习惯，暂不修复。
	 *
	 * @param n 要格式化的数字
	 * @param formatExp 格式表达式（如 `##,###.##`），未实现完整解析，默认每3位加逗号并保留2位小数
	 * @returns 格式化后的可读字符串
	 */
	static format(n: number, formatExp?: string): string {
		// 解析格式
		let p = 0; // 分隔位符
		let m = 0; // 小数位数
		if (formatExp && formatExp.length > 0) {
			let sArr = formatExp.split(".");
			let s1 = sArr[0]; // 整数格式
			if (s1.length > 0) {
				let pArr = s1.split(",");
				if (pArr.length > 0) {
					for (let pt of pArr) {
						if (pt.length > p) { p = pt.length; }
					}
				}
			}
			let s2 = sArr.length > 1 ? sArr[1] : ""; // 小数格式
			if (s2.length > 0) {
				for (let ms of s2) {
					if ("#" == ms) { m = m + 1; }
				}
			}
		}
		if (p < 3) { p = 3; }
		if (!formatExp && m < 1) { m = 2; }
		// 开始格式化数字
		let numStr: string = n.toString();
		try {
			let num: number = Math.abs(n);
			let isPositive: boolean = n >= 0;
			let sArr = this.toFixed(num, m).toString().split(".");
			let s1 = sArr[0] ? sArr[0] : ""; // 整数字符串
			let s2 = sArr[1] ? sArr[1] : ""; // 小数字符串
			if (s2.length < m) {
				for (let i = s2.length; i < m; i++) {
					s2 = s2 + '0';
				}
			}
			// 给整数部分加上分隔符
			let part1 = "";
			for (let i = 0; i < s1.length; i++) {
				part1 = s1[s1.length - 1 - i] + part1;
				if (i > 0 && i < (s1.length - 1) && 0 == ((i + 1) % p)) {
					part1 = "," + part1;
				}
			}
			// 给小数部分加上分隔符
			let part2 = "";
			for (let i = 0; i < s2.length; i++) {
				part2 = part2 + s2[i];
				if (i > 0 && i < (s2.length - 1) && 0 == ((i + 1) % p)) {
					part2 = part2 + ",";
				}
			}
			return (((isPositive) ? '' : '-') + part1 + '.' + part2);
		} catch (e) {
			console.error(e);
			numStr = "NaN";
		}
		return numStr;
	}

	/**
	 * 将格式化后的数字字符串还原为数字，去除逗号等分隔符。
	 * @param s 格式化后的数字字符串
	 * @returns 解析出的数字
	 */
	static unformat(s: string): number {
		let ns = s.replace(/[^\d\.-]/g, "");
		return ns.includes(".") ? parseFloat(ns) : parseInt(ns, 10);
	}

	private static getDecimalPlaces(n: number): number {
		// return (n.toFixed(16).split(".")[1] || "").length;
		return (n.toString().split(".")[1] || "").length; 
	}

	/**
	 * 精确加法，避免浮点数精度丢失（如 0.1 + 0.2 ≠ 0.3 的问题）。
	 * @param n1 加数
	 * @param n2 被加数
	 * @returns 精确的加法结果
	 */
	static add(n1: number, n2: number): number {
		let r1 = this.getDecimalPlaces(n1);
		let r2 = this.getDecimalPlaces(n2);
		let m = Math.pow(10, Math.max(r1, r2));
		let value = (Math.round(n1 * m) + Math.round(n2 * m)) / m;
		return value;
	}

	/**
	 * 精确减法，避免浮点数精度丢失。
	 * @param n1 被减数
	 * @param n2 减数
	 * @returns 精确的减法结果
	 */
	static sub(n1: number, n2: number): number {
		let r1 = this.getDecimalPlaces(n1);
		let r2 = this.getDecimalPlaces(n2);
		let m = Math.pow(10, Math.max(r1, r2));
		const value = (Math.round(n1 * m) - Math.round(n2 * m)) / m;
		return value;
	}

	/**
	 * 精确乘法，避免浮点数精度丢失。
	 * @param n1 乘数
	 * @param n2 乘数
	 * @returns 精确的乘法结果
	 */
	static mul(n1: number, n2: number): number {
		let s1 = n1.toString(), s2 = n2.toString();
		let m = this.getDecimalPlaces(n1) + this.getDecimalPlaces(n2);
		let value = Number(s1.replace(".", "")) * Number(s2.replace(".", "")) / Math.pow(10, m);
		return value;
	}

	/**
	 * 精确除法，避免浮点数精度丢失。
	 * @param n1 被除数
	 * @param n2 除数
	 * @returns 精确的除法结果
	 */
	static div(n1: number, n2: number): number {
		if (n2 === 0) return n1 >= 0 ? Infinity : -Infinity;
		let r1 = this.getDecimalPlaces(n1);
		let r2 = this.getDecimalPlaces(n2);
		let m = Math.pow(10, Math.max(r1, r2));
		return (Math.round(n1 * m) / Math.round(n2 * m));
	}

	/**
	 * 基础曲线函数，x 在 [0, 1] 之间时为正弦半波（向上凸出），超出范围返回 0。
	 * @param x 横坐标，应在 [0, 1] 之间
	 * @returns 纵坐标值
	 */
	static baseCurve(x: number): number {
		return (x < 0) || (x > 1) ? 0 : Math.sin(x * Math.PI);
	}

	/**
	 * 创建一个钟形曲线函数。以 topX 为中心，在 totalXDis 范围内从 minY 上升到 maxY 再回落。
	 * @param totalXDis 曲线的总 X 跨度
	 * @param topX 曲线顶点所在的 X 坐标
	 * @param minY 曲线底部的 Y 值（最小值）
	 * @param maxY 曲线顶点的 Y 值（最大值）
	 * @returns 一个接受 x 并返回 y 的曲线函数
	 */
	static createCurve(totalXDis: number, topX: number, minY: number, maxY: number): (x: number) => number {
		let curve = (x: number): number => {
			const beginX = topX - totalXDis / 2;
			const endX = topX + totalXDis / 2;
			if (x < beginX || x > endX) {
				return minY;
			} else {
				const yDis = maxY - minY;
				return NumUtil.baseCurve((x - beginX) / totalXDis) * yDis + minY;
			}
		}
		return curve;
	}

}


/**
 * 字符串工具类，提供字符串处理、格式化、编码转换等静态方法。
 */
export class StrUtil {

	/**
	 * 去除字符串两端的空白字符。
	 * @param s 输入字符串
	 * @returns 去除两端空白后的字符串
	 */
	static trim(s: string): string {
		return s.trim();
	}


	/**
	 * 转义 HTML 特殊字符，防止 XSS 注入。
	 */
	static escapeHtml(s: string): string {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	}

	/**
	 * 在字符串左侧填充字符直到达到指定长度。
	 * @param str 原始字符串
	 * @param max 目标长度
	 * @param place 填充字符，默认为空格
	 * @returns 填充后的字符串
	 */
	static leftPad(str: string, max: number, place: string = " "): string {
		return str.length < max ? place.repeat(max - str.length) + str : str;
	}

	/**
	 * 在字符串右侧填充字符直到达到指定长度。
	 * @param str 原始字符串
	 * @param max 目标长度
	 * @param place 填充字符，默认为空格
	 * @returns 填充后的字符串
	 */
	static rightPad(str: string, max: number, place: string = " "): string {
		return str.length < max ? str + place.repeat(max - str.length) : str;
	}

	/**
	 * 字符串模板替换，用对象属性值替换 `{key}` 占位符。
	 * 例：`"我是{name}，今年{age}了".format({name:"loogn",age:22})`
	 * @param str 包含 `{key}` 占位符的模板字符串
	 * @param arg 键值对对象，用于替换占位符
	 * @returns 替换后的字符串
	 */
	static format(str: string, arg: Record<string, string | number>): string {
		// 用 replace 回调一次扫描完成，避免 split().join() 的多次遍历
		return str.replace(/\{([^}]+)\}/g, (match, key: string) => {
			const value = arg[key];
			// != null 同时排除 null 和 undefined，避免 null 被转成字面量 "null"
			return value != null ? String(value) : match;
		});
	}


	/**
	 * 使用正则表达式替换字符串中所有匹配项。
	 * @param s 原始字符串
	 * @param exp 正则表达式模式（字符串形式）
	 * @param newStr 替换成的字符串
	 * @returns 替换后的字符串
	 */
	static replaceByRegex(s: string, exp: string, newStr: string): string {
		// 用函数替换，避免 newStr 中的 $ 被 String.replace 特殊解释（$&、$1 等）
		return s.replace(new RegExp(exp, "gm"), () => newStr);
	}

	/**
	 * 将 UTF-16 字符串转换为 UTF-8 编码字符串。
	 * @param str UTF-16 编码的字符串
	 * @returns UTF-8 编码的字符串
	 */
	static utf16to8(str: string): string {
		let out: string[] = [];
		let len = str.length;
		for (let i = 0; i < len; i++) {
			let c = str.charCodeAt(i);
			if (c >= 0xD800 && c <= 0xDBFF) {
				let low = str.charCodeAt(++i);
				c = ((c - 0xD800) << 10) + (low - 0xDC00) + 0x10000;
			}
			if (c <= 0x007F) {
				out.push(str.charAt(i));
			} else if (c > 0x07FF) {
				if (c > 0xFFFF) {
					out.push(String.fromCharCode(0xF0 | ((c >> 18) & 0x07)));
					out.push(String.fromCharCode(0x80 | ((c >> 12) & 0x3F)));
					out.push(String.fromCharCode(0x80 | ((c >> 6) & 0x3F)));
					out.push(String.fromCharCode(0x80 | ((c >> 0) & 0x3F)));
				} else {
					out.push(String.fromCharCode(0xE0 | ((c >> 12) & 0x0F)));
					out.push(String.fromCharCode(0x80 | ((c >> 6) & 0x3F)));
					out.push(String.fromCharCode(0x80 | ((c >> 0) & 0x3F)));
				}
			} else {
				out.push(String.fromCharCode(0xC0 | ((c >> 6) & 0x1F)));
				out.push(String.fromCharCode(0x80 | ((c >> 0) & 0x3F)));
			}
		}
		return out.join("");
	}

	/**
	 * 将 UTF-8 编码字符串转换为 UTF-16 字符串。
	 * @param str UTF-8 编码的字符串
	 * @returns UTF-16 字符串
	 */
	static utf8to16(str: string): string {
		let out: string[] = [];
		let len = str.length;
		let i = 0;
		let char2: number, char3: number, char4: number;
		while (i < len) {
			let c = str.charCodeAt(i++);
			switch (c >> 4) {
				case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
					out.push(str.charAt(i - 1));
					break;
				case 12: case 13:
					char2 = str.charCodeAt(i++);
					out.push(String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F)));
					break;
				case 14:
					char2 = str.charCodeAt(i++);
					char3 = str.charCodeAt(i++);
					out.push(String.fromCharCode(((c & 0x0F) << 12) |
						((char2 & 0x3F) << 6) | ((char3 & 0x3F) << 0)));
					break;
				case 15:
					char2 = str.charCodeAt(i++);
					char3 = str.charCodeAt(i++);
					char4 = str.charCodeAt(i++);
					let code = ((c & 0x07) << 18) | ((char2 & 0x3F) << 12) |
						((char3 & 0x3F) << 6) | (char4 & 0x3F);
					out.push(String.fromCharCode(0xD800 + ((code - 0x10000) >> 10)));
					out.push(String.fromCharCode(0xDC00 + ((code - 0x10000) & 0x3FF)));
					break;
				default:
					// 非法 UTF-8 首字节（如孤立的 continuation byte），原样保留避免静默丢弃
					out.push(str.charAt(i - 1));
					break;
			}
		}
		return out.join("");
	}

	/**
	 * 将字符串编码为 Base64 格式（支持非 ASCII 字符）。
	 * @param str 原始字符串
	 * @returns Base64 编码后的字符串
	 */
	static base64encode(str: string): string {
		// 先转 UTF-8 字节序列再编码，避免 btoa 对非 Latin-1 字符抛异常
		return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
			String.fromCharCode(parseInt(p1, 16))
		));
	}

	/**
	 * 将 Base64 编码字符串解码为原始字符串（支持非 ASCII 字符）。
	 * @param str Base64 编码的字符串
	 * @returns 解码后的原始字符串
	 */
	static base64decode(str: string): string {
		// 将 atob 得到的字节序列还原为 UTF-8 字符串
		return decodeURIComponent(atob(str).split("").map((c) =>
			"%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)
		).join(""));
	}

}


/**
 * 时间工具类，提供时间常量、格式化、日期运算、时区检测等静态方法。
 */
export class TimeUtil {

	/** 毫秒/秒 常量 */
	static readonly UNIT_SEC : number = 1000;
	/** 毫秒/分 常量 */
	static readonly UNIT_MIN : number = 1000 * 60;
	/** 毫秒/时 常量 */
	static readonly UNIT_HOUR: number = 1000 * 60 * 60;
	/** 毫秒/天 常量 */
	static readonly UNIT_DAY : number = 1000 * 60 * 60 * 24;

	/**
	 * 异步等待指定毫秒数。
	 * @param milSecs 等待的毫秒数
	 * @returns Promise，在指定时间后 resolve
	 */
	static async sleep(milliSecs: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, milliSecs));
	}

	/**
	 * 将 Date 格式化为指定格式的字符串。
	 *
	 * 支持占位符：`y+`（年）、`M+`（月）、`d+`（日）、`H+`（时）、`m+`（分）、
	 * `s+`（秒）、`q+`（季度）、`S+`（毫秒），占位符长度决定补零位数。
	 *
	 * @param d 要格式化的 Date 对象
	 * @param f 格式字符串，如 `"yyyy-MM-dd HH:mm:ss.SSS"`（默认值）
	 * @returns 格式化后的时间字符串
	 */
	static format(d: Date, f?: string): string {
		let result = f ? f : "yyyy-MM-dd HH:mm:ss.SSS";
		let processPart = (part: string, num: number) => {
			const match = result.match(new RegExp(`(${part})`));
			if (match) {
				const mark = match[1];
				const text = `${num}`;
				result = result.replace(mark, StrUtil.leftPad(text, mark.length, '0'));
			}
		}
		processPart("y+", d.getFullYear());
		processPart("M+", d.getMonth() + 1);
		processPart("d+", d.getDate());
		processPart("H+", d.getHours());
		processPart("m+", d.getMinutes());
		processPart("s+", d.getSeconds());
		processPart("q+", Math.floor((d.getMonth() + 3) / 3));
		processPart("S+", d.getMilliseconds());
		return result;
	}


	/**
	 * 在指定日期上添加毫秒数，返回新 Date 对象（不修改原对象）。
	 * @param d 原始日期
	 * @param ms 要加上的毫秒数
	 * @returns 加上毫秒数后的新日期
	 */
	static addMilliseconds(d: Date, ms: number): Date {
		let date = new Date(d);
		date.setTime(date.getTime() + ms);
		return date;
	}


	/**
	 * 在指定日期上添加秒数，返回新 Date 对象（不修改原对象）。
	 * @param d 原始日期
	 * @param secs 要加上的秒数
	 * @returns 加上秒数后的新日期
	 */
	static addSeconds(d: Date, secs: number): Date {
		const date = new Date(d);
		date.setSeconds(date.getSeconds() + secs);
		return date;
	}


	/**
	 * 在指定日期上添加天数，返回新 Date 对象（不修改原对象）。
	 * @param d 原始日期
	 * @param days 要加上的天数
	 * @returns 加上天数后的新日期
	 */
	static addDays(d: Date, days: number): Date {
		const date = new Date(d);
		date.setDate(date.getDate() + days);
		return date;
	}

	/**
	 * 在指定日期上添加月数，返回新 Date 对象（不修改原对象）。
	 * @param d 原始日期
	 * @param months 要加上的月数
	 * @returns 加上月数后的新日期
	 */
	static addMonths(d: Date, months: number): Date {
		const date = new Date(d);
		date.setMonth(date.getMonth() + months);
		return date;
	}


	/**
	 * 在指定日期上添加年数，返回新 Date 对象（不修改原对象）。
	 * @param d 原始日期
	 * @param years 要加上的年数
	 * @returns 加上年数后的新日期
	 */
	static addYears(d: Date, years: number): Date {
		const date = new Date(d);
		date.setFullYear(date.getFullYear() + years);
		return date;
	}

	/**
	 * 将日期重置为当天的 00:00:00.000，返回新 Date 对象。
	 * @param date 原始日期
	 * @returns 重置到当天零点的新日期
	 */
	static cleanDay(date: Date): Date {
		const newDate = new Date(date.getTime());
		newDate.setHours(0, 0, 0, 0);
		return newDate;
	}

	/**
	 * 取得从 date 当天零点起，跨 days 天的时间范围。floor 为较早的零点，ceil 为较晚的零点。
	 * @param date 基准日期
	 * @param days 跨越的天数
	 * @returns 包含 floor（范围起点）和 ceil（范围终点）的对象
	 */
	static getTimeArea(date: Date, days: number): { floor: Date, ceil: Date } {
		const d1 = TimeUtil.cleanDay(date);
		const d2 = TimeUtil.cleanDay(TimeUtil.addDays(d1, days));
		if (d1 < d2) {
			return { floor: d1, ceil: d2 };
		} else {
			return { floor: d2, ceil: d1 };
		}
	}

	/**
	 * 取得从 date 起、偏移 ms 毫秒后的时间范围。floor 为较早的时间点，ceil 为较晚的时间点（已 cleanDay）。
	 * @param date 基准日期
	 * @param ms 偏移毫秒数（可为负）
	 * @returns 包含 floor（范围起点）和 ceil（范围终点）的对象
	 */
	static getDateArea(date: Date, ms: number): { floor: Date, ceil: Date } {
		const d1 = TimeUtil.cleanDay(date);
		const d2 = TimeUtil.cleanDay(TimeUtil.addMilliseconds(d1, ms));
		if (d1 < d2) {
			return { floor: d1, ceil: d2 };
		} else {
			return { floor: d2, ceil: d1 };
		}
	}

	/**
	 * 取得当前环境的时区偏移字符串（如 `GMT8`）。
	 * @returns 时区字符串
	 */
	static getLocalTimeZone(): string {
		const d = new Date();
		return (`GMT${- d.getTimezoneOffset() / 60}`);
	}

	/**
	 * 通过夏令时/冬令时偏移匹配当前环境的 IANA 时区名称（如 `Asia/Shanghai`）。
	 * 匹配失败时返回 `"Unknown"`。
	 * @returns IANA 时区名称字符串
	 */
	static getLocalTimeZoneName(): string {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	}

	/**
	 * 将日期格式化为 `"yyyy-MM-dd HH:mm:ss.SSS"` 的可读文本。
	 * @param date 要格式化的日期
	 * @returns 格式化后的时间字符串
	 */
	static getLocalTimeStr(date: Date): string {
		return this.format(date, "yyyy-MM-dd HH:mm:ss.SSS");
	}


}

/** RGB 颜色只读接口 */
export interface IColorRGB { readonly r: number, readonly g: number, readonly b: number }

/**
 * RGB 颜色类，支持十六进制字符串、RGB 字符串、CSS 140 色名匹配及互补色查询。
 */
export class ColorRGB implements IColorRGB {
	readonly r: number;
	readonly g: number;
	readonly b: number;
	readonly rgbStr: string;
	readonly hexStr: string;
	private color140: null | { color: ColorRGB, name: string } = null;

	/**
	 * 使用 RGB 分量创建颜色。
	 * @param r 红色分量 (0-255)
	 * @param g 绿色分量 (0-255)
	 * @param b 蓝色分量 (0-255)
	 */
	constructor(r: number, g: number, b: number) {
		this.r = r;
		this.g = g;
		this.b = b;
		//
		this.rgbStr = `rgb(${this.r},${this.g},${this.b})`;
		//
		let rs = this.r.toString(16);
		let gs = this.g.toString(16);
		let bs = this.b.toString(16);
		rs = rs.length > 1 ? rs : "0" + rs;
		gs = gs.length > 1 ? gs : "0" + gs;
		bs = bs.length > 1 ? bs : "0" + bs;
		this.hexStr = `#${rs}${gs}${bs}`;
	}

	/**
	 * 从十六进制字符串创建颜色
	 *
	 * 注意：仅支持 #RRGGBB 格式（7字符），不支持 #RGB / #RRGGBBAA 等短/长格式，暂不修复。
	 *
	 * @param str 十六进制颜色字符串
	 * @returns ColorRGB 实例
	 */
	static fromStrHex(str: string): ColorRGB {
		let r = 0, g = 0, b = 0;
		if (!str) {
			// do nothing
		} else if (str.length > 6) {
			r = parseInt(`0x${str.substring(1, 3)}`);
			g = parseInt(`0x${str.substring(3, 5)}`);
			b = parseInt(`0x${str.substring(5, 7)}`);
		}
		return new ColorRGB(r, g, b);
	}

	/**
	 * 根据 CSS 颜色名称查找对应的 140 色记录。
	 * @param name CSS 颜色名称（如 `"Red"`）
	 * @returns 包含 ColorRGB 实例和颜色名的对象，未匹配时返回 White
	 */
	static fromNameTo140(name: string): { color: ColorRGB, name: string } {
		let result = color140.White;
		for (let i = 0; i < color140Arr.length; i++) {
			let rec = color140Arr[i];
			if (name == rec.name) {
				result = color140Arr[i].color;
				break;
			}
		}
		return result;
	}

	/**
	 * 根据 RGB 分量查找最接近的 CSS 140 色（使用曼哈顿距离匹配）。
	 * @param r 红色分量 (0-255)
	 * @param g 绿色分量 (0-255)
	 * @param b 蓝色分量 (0-255)
	 * @returns 包含最近似 ColorRGB 实例和颜色名的对象
	 */
	static fromRgbTo140(r: number, g: number, b: number): { color: ColorRGB, name: string } {
		let minIdx = 0;
		let minDiff = 255 + 255 + 255;

		let idx = 0;
		while (idx < color140Arr.length) {
			let rec = color140Arr[idx].color;
			let curr = rec.color;
			let diff = Math.abs(curr.r - r) + Math.abs(curr.g - g) + Math.abs(curr.b - b);
			if (diff < minDiff) {
				minIdx = idx;
				minDiff = diff;
			}
			idx++;
		}
		return color140Arr[minIdx].color;
	}

	/**
	 * 根据十六进制颜色字符串查找最接近的 CSS 140 色。
	 * @param str 十六进制颜色字符串（如 `"#FF0000"`）
	 * @returns 包含最近似 ColorRGB 实例和颜色名的对象
	 */
	static fromHexTo140(str: string): { color: ColorRGB, name: string } {
		let r = 0, g = 0, b = 0;
		if (!str) {
			// do nothing
		} else if (str.length > 6) {
			r = parseInt(`0x${str.substring(1, 3)}`);
			g = parseInt(`0x${str.substring(3, 5)}`);
			b = parseInt(`0x${str.substring(5, 7)}`);
		}
		return ColorRGB.fromRgbTo140(r, g, b);
	}


	/**
	 * 返回 `rgb(r,g,b)` 格式的字符串。
	 * @returns RGB 字符串
	 */
	toStrRGB(): string { return this.rgbStr; }

	/**
	 * 返回 `#RRGGBB` 格式的十六进制字符串。
	 * @returns 十六进制颜色字符串
	 */
	toStrHex(): string { return this.hexStr; }

	/**
	 * 查找最接近的 CSS 140 色（带缓存，仅首次调用时计算）。
	 * @returns 包含 ColorRGB 实例和颜色名的对象
	 */
	to140Color(): { color: ColorRGB, name: string } {
		if (null != this.color140) {
			return this.color140;
		} else {
			this.color140 = ColorRGB.fromRgbTo140(this.r, this.g, this.b);
			return this.color140;
		}
	}

	/**
	 * 查找当前颜色的互补色（基于预定义的 CSS 140 色互补映射表）。
	 * 参考：https://htmlcolorcodes.com/zh/yanse-xuanze-qi/
	 * @returns 包含互补色 ColorRGB 实例和颜色名的对象
	 */
	oppositeColor(): { color: ColorRGB, name: string } {
		// 互补色的查询
		// https://zh.planetcalc.com/7661/
		let matchedColor = this.to140Color();
		let result = color140Arr[0];
		for (let i = 0; i < color140Arr.length; i++) {
			let rec = color140Arr[i];
			if (matchedColor.name == rec.name) {
				result = rec;
			}
		}
		return result.rev;
	}

};



let color140 = {
	Black                : {color: ColorRGB.fromStrHex('#000000'), name: "Black"               },
	Navy                 : {color: ColorRGB.fromStrHex('#000080'), name: "Navy"                },
	DarkBlue             : {color: ColorRGB.fromStrHex('#00008B'), name: "DarkBlue"            },
	MediumBlue           : {color: ColorRGB.fromStrHex('#0000CD'), name: "MediumBlue"          },
	Blue                 : {color: ColorRGB.fromStrHex('#0000FF'), name: "Blue"                },
	DarkGreen            : {color: ColorRGB.fromStrHex('#006400'), name: "DarkGreen"           },
	Green                : {color: ColorRGB.fromStrHex('#008000'), name: "Green"               },
	Teal                 : {color: ColorRGB.fromStrHex('#008080'), name: "Teal"                },
	DarkCyan             : {color: ColorRGB.fromStrHex('#008B8B'), name: "DarkCyan"            },
	DeepSkyBlue          : {color: ColorRGB.fromStrHex('#00BFFF'), name: "DeepSkyBlue"         },
	DarkTurquoise        : {color: ColorRGB.fromStrHex('#00CED1'), name: "DarkTurquoise"       },
	MediumSpringGreen    : {color: ColorRGB.fromStrHex('#00FA9A'), name: "MediumSpringGreen"   },
	Lime                 : {color: ColorRGB.fromStrHex('#00FF00'), name: "Lime"                },
	SpringGreen          : {color: ColorRGB.fromStrHex('#00FF7F'), name: "SpringGreen"         },
	Aqua                 : {color: ColorRGB.fromStrHex('#00FFFF'), name: "Aqua"                },
	Cyan                 : {color: ColorRGB.fromStrHex('#00FFFF'), name: "Cyan"                },
	MidnightBlue         : {color: ColorRGB.fromStrHex('#191970'), name: "MidnightBlue"        },
	DodgerBlue           : {color: ColorRGB.fromStrHex('#1E90FF'), name: "DodgerBlue"          },
	LightSeaGreen        : {color: ColorRGB.fromStrHex('#20B2AA'), name: "LightSeaGreen"       },
	ForestGreen          : {color: ColorRGB.fromStrHex('#228B22'), name: "ForestGreen"         },
	SeaGreen             : {color: ColorRGB.fromStrHex('#2E8B57'), name: "SeaGreen"            },
	DarkSlateGray        : {color: ColorRGB.fromStrHex('#2F4F4F'), name: "DarkSlateGray"       },
	LimeGreen            : {color: ColorRGB.fromStrHex('#32CD32'), name: "LimeGreen"           },
	MediumSeaGreen       : {color: ColorRGB.fromStrHex('#3CB371'), name: "MediumSeaGreen"      },
	Turquoise            : {color: ColorRGB.fromStrHex('#40E0D0'), name: "Turquoise"           },
	RoyalBlue            : {color: ColorRGB.fromStrHex('#4169E1'), name: "RoyalBlue"           },
	SteelBlue            : {color: ColorRGB.fromStrHex('#4682B4'), name: "SteelBlue"           },
	DarkSlateBlue        : {color: ColorRGB.fromStrHex('#483D8B'), name: "DarkSlateBlue"       },
	MediumTurquoise      : {color: ColorRGB.fromStrHex('#48D1CC'), name: "MediumTurquoise"     },
	Indigo               : {color: ColorRGB.fromStrHex('#4B0082'), name: "Indigo"              },
	DarkOliveGreen       : {color: ColorRGB.fromStrHex('#556B2F'), name: "DarkOliveGreen"      },
	CadetBlue            : {color: ColorRGB.fromStrHex('#5F9EA0'), name: "CadetBlue"           },
	CornflowerBlue       : {color: ColorRGB.fromStrHex('#6495ED'), name: "CornflowerBlue"      },
	MediumAquaMarine     : {color: ColorRGB.fromStrHex('#66CDAA'), name: "MediumAquaMarine"    },
	DimGray              : {color: ColorRGB.fromStrHex('#696969'), name: "DimGray"             },
	SlateBlue            : {color: ColorRGB.fromStrHex('#6A5ACD'), name: "SlateBlue"           },
	OliveDrab            : {color: ColorRGB.fromStrHex('#6B8E23'), name: "OliveDrab"           },
	SlateGray            : {color: ColorRGB.fromStrHex('#708090'), name: "SlateGray"           },
	LightSlateGray       : {color: ColorRGB.fromStrHex('#778899'), name: "LightSlateGray"      },
	MediumSlateBlue      : {color: ColorRGB.fromStrHex('#7B68EE'), name: "MediumSlateBlue"     },
	LawnGreen            : {color: ColorRGB.fromStrHex('#7CFC00'), name: "LawnGreen"           },
	Chartreuse           : {color: ColorRGB.fromStrHex('#7FFF00'), name: "Chartreuse"          },
	Aquamarine           : {color: ColorRGB.fromStrHex('#7FFFD4'), name: "Aquamarine"          },
	Maroon               : {color: ColorRGB.fromStrHex('#800000'), name: "Maroon"              },
	Purple               : {color: ColorRGB.fromStrHex('#800080'), name: "Purple"              },
	Olive                : {color: ColorRGB.fromStrHex('#808000'), name: "Olive"               },
	Gray                 : {color: ColorRGB.fromStrHex('#808080'), name: "Gray"                },
	SkyBlue              : {color: ColorRGB.fromStrHex('#87CEEB'), name: "SkyBlue"             },
	LightSkyBlue         : {color: ColorRGB.fromStrHex('#87CEFA'), name: "LightSkyBlue"        },
	BlueViolet           : {color: ColorRGB.fromStrHex('#8A2BE2'), name: "BlueViolet"          },
	DarkRed              : {color: ColorRGB.fromStrHex('#8B0000'), name: "DarkRed"             },
	DarkMagenta          : {color: ColorRGB.fromStrHex('#8B008B'), name: "DarkMagenta"         },
	SaddleBrown          : {color: ColorRGB.fromStrHex('#8B4513'), name: "SaddleBrown"         },
	DarkSeaGreen         : {color: ColorRGB.fromStrHex('#8FBC8F'), name: "DarkSeaGreen"        },
	LightGreen           : {color: ColorRGB.fromStrHex('#90EE90'), name: "LightGreen"          },
	MediumPurple         : {color: ColorRGB.fromStrHex('#9370DB'), name: "MediumPurple"        },
	DarkViolet           : {color: ColorRGB.fromStrHex('#9400D3'), name: "DarkViolet"          },
	PaleGreen            : {color: ColorRGB.fromStrHex('#98FB98'), name: "PaleGreen"           },
	DarkOrchid           : {color: ColorRGB.fromStrHex('#9932CC'), name: "DarkOrchid"          },
	YellowGreen          : {color: ColorRGB.fromStrHex('#9ACD32'), name: "YellowGreen"         },
	Sienna               : {color: ColorRGB.fromStrHex('#A0522D'), name: "Sienna"              },
	Brown                : {color: ColorRGB.fromStrHex('#A52A2A'), name: "Brown"               },
	DarkGray             : {color: ColorRGB.fromStrHex('#A9A9A9'), name: "DarkGray"            },
	LightBlue            : {color: ColorRGB.fromStrHex('#ADD8E6'), name: "LightBlue"           },
	GreenYellow          : {color: ColorRGB.fromStrHex('#ADFF2F'), name: "GreenYellow"         },
	PaleTurquoise        : {color: ColorRGB.fromStrHex('#AFEEEE'), name: "PaleTurquoise"       },
	LightSteelBlue       : {color: ColorRGB.fromStrHex('#B0C4DE'), name: "LightSteelBlue"      },
	PowderBlue           : {color: ColorRGB.fromStrHex('#B0E0E6'), name: "PowderBlue"          },
	FireBrick            : {color: ColorRGB.fromStrHex('#B22222'), name: "FireBrick"           },
	DarkGoldenRod        : {color: ColorRGB.fromStrHex('#B8860B'), name: "DarkGoldenRod"       },
	MediumOrchid         : {color: ColorRGB.fromStrHex('#BA55D3'), name: "MediumOrchid"        },
	RosyBrown            : {color: ColorRGB.fromStrHex('#BC8F8F'), name: "RosyBrown"           },
	DarkKhaki            : {color: ColorRGB.fromStrHex('#BDB76B'), name: "DarkKhaki"           },
	Silver               : {color: ColorRGB.fromStrHex('#C0C0C0'), name: "Silver"              },
	MediumVioletRed      : {color: ColorRGB.fromStrHex('#C71585'), name: "MediumVioletRed"     },
	IndianRed            : {color: ColorRGB.fromStrHex('#CD5C5C'), name: "IndianRed"           },
	Peru                 : {color: ColorRGB.fromStrHex('#CD853F'), name: "Peru"                },
	Chocolate            : {color: ColorRGB.fromStrHex('#D2691E'), name: "Chocolate"           },
	Tan                  : {color: ColorRGB.fromStrHex('#D2B48C'), name: "Tan"                 },
	LightGray            : {color: ColorRGB.fromStrHex('#D3D3D3'), name: "LightGray"           },
	Thistle              : {color: ColorRGB.fromStrHex('#D8BFD8'), name: "Thistle"             },
	Orchid               : {color: ColorRGB.fromStrHex('#DA70D6'), name: "Orchid"              },
	GoldenRod            : {color: ColorRGB.fromStrHex('#DAA520'), name: "GoldenRod"           },
	PaleVioletRed        : {color: ColorRGB.fromStrHex('#DB7093'), name: "PaleVioletRed"       },
	Crimson              : {color: ColorRGB.fromStrHex('#DC143C'), name: "Crimson"             },
	Gainsboro            : {color: ColorRGB.fromStrHex('#DCDCDC'), name: "Gainsboro"           },
	Plum                 : {color: ColorRGB.fromStrHex('#DDA0DD'), name: "Plum"                },
	BurlyWood            : {color: ColorRGB.fromStrHex('#DEB887'), name: "BurlyWood"           },
	LightCyan            : {color: ColorRGB.fromStrHex('#E0FFFF'), name: "LightCyan"           },
	Lavender             : {color: ColorRGB.fromStrHex('#E6E6FA'), name: "Lavender"            },
	DarkSalmon           : {color: ColorRGB.fromStrHex('#E9967A'), name: "DarkSalmon"          },
	Violet               : {color: ColorRGB.fromStrHex('#EE82EE'), name: "Violet"              },
	PaleGoldenRod        : {color: ColorRGB.fromStrHex('#EEE8AA'), name: "PaleGoldenRod"       },
	LightCoral           : {color: ColorRGB.fromStrHex('#F08080'), name: "LightCoral"          },
	Khaki                : {color: ColorRGB.fromStrHex('#F0E68C'), name: "Khaki"               },
	AliceBlue            : {color: ColorRGB.fromStrHex('#F0F8FF'), name: "AliceBlue"           },
	HoneyDew             : {color: ColorRGB.fromStrHex('#F0FFF0'), name: "HoneyDew"            },
	Azure                : {color: ColorRGB.fromStrHex('#F0FFFF'), name: "Azure"               },
	SandyBrown           : {color: ColorRGB.fromStrHex('#F4A460'), name: "SandyBrown"          },
	Wheat                : {color: ColorRGB.fromStrHex('#F5DEB3'), name: "Wheat"               },
	Beige                : {color: ColorRGB.fromStrHex('#F5F5DC'), name: "Beige"               },
	WhiteSmoke           : {color: ColorRGB.fromStrHex('#F5F5F5'), name: "WhiteSmoke"          },
	MintCream            : {color: ColorRGB.fromStrHex('#F5FFFA'), name: "MintCream"           },
	GhostWhite           : {color: ColorRGB.fromStrHex('#F8F8FF'), name: "GhostWhite"          },
	Salmon               : {color: ColorRGB.fromStrHex('#FA8072'), name: "Salmon"              },
	AntiqueWhite         : {color: ColorRGB.fromStrHex('#FAEBD7'), name: "AntiqueWhite"        },
	Linen                : {color: ColorRGB.fromStrHex('#FAF0E6'), name: "Linen"               },
	LightGoldenRodYellow : {color: ColorRGB.fromStrHex('#FAFAD2'), name: "LightGoldenRodYellow"},
	OldLace              : {color: ColorRGB.fromStrHex('#FDF5E6'), name: "OldLace"             },
	Red                  : {color: ColorRGB.fromStrHex('#FF0000'), name: "Red"                 },
	Fuchsia              : {color: ColorRGB.fromStrHex('#FF00FF'), name: "Fuchsia"             },
	Magenta              : {color: ColorRGB.fromStrHex('#FF00FF'), name: "Magenta"             },
	DeepPink             : {color: ColorRGB.fromStrHex('#FF1493'), name: "DeepPink"            },
	OrangeRed            : {color: ColorRGB.fromStrHex('#FF4500'), name: "OrangeRed"           },
	Tomato               : {color: ColorRGB.fromStrHex('#FF6347'), name: "Tomato"              },
	HotPink              : {color: ColorRGB.fromStrHex('#FF69B4'), name: "HotPink"             },
	Coral                : {color: ColorRGB.fromStrHex('#FF7F50'), name: "Coral"               },
	DarkOrange           : {color: ColorRGB.fromStrHex('#FF8C00'), name: "DarkOrange"          },
	LightSalmon          : {color: ColorRGB.fromStrHex('#FFA07A'), name: "LightSalmon"         },
	Orange               : {color: ColorRGB.fromStrHex('#FFA500'), name: "Orange"              },
	LightPink            : {color: ColorRGB.fromStrHex('#FFB6C1'), name: "LightPink"           },
	Pink                 : {color: ColorRGB.fromStrHex('#FFC0CB'), name: "Pink"                },
	Gold                 : {color: ColorRGB.fromStrHex('#FFD700'), name: "Gold"                },
	PeachPuff            : {color: ColorRGB.fromStrHex('#FFDAB9'), name: "PeachPuff"           },
	NavajoWhite          : {color: ColorRGB.fromStrHex('#FFDEAD'), name: "NavajoWhite"         },
	Moccasin             : {color: ColorRGB.fromStrHex('#FFE4B5'), name: "Moccasin"            },
	Bisque               : {color: ColorRGB.fromStrHex('#FFE4C4'), name: "Bisque"              },
	MistyRose            : {color: ColorRGB.fromStrHex('#FFE4E1'), name: "MistyRose"           },
	BlanchedAlmond       : {color: ColorRGB.fromStrHex('#FFEBCD'), name: "BlanchedAlmond"      },
	PapayaWhip           : {color: ColorRGB.fromStrHex('#FFEFD5'), name: "PapayaWhip"          },
	LavenderBlush        : {color: ColorRGB.fromStrHex('#FFF0F5'), name: "LavenderBlush"       },
	SeaShell             : {color: ColorRGB.fromStrHex('#FFF5EE'), name: "SeaShell"            },
	Cornsilk             : {color: ColorRGB.fromStrHex('#FFF8DC'), name: "Cornsilk"            },
	LemonChiffon         : {color: ColorRGB.fromStrHex('#FFFACD'), name: "LemonChiffon"        },
	FloralWhite          : {color: ColorRGB.fromStrHex('#FFFAF0'), name: "FloralWhite"         },
	Snow                 : {color: ColorRGB.fromStrHex('#FFFAFA'), name: "Snow"                },
	Yellow               : {color: ColorRGB.fromStrHex('#FFFF00'), name: "Yellow"              },
	LightYellow          : {color: ColorRGB.fromStrHex('#FFFFE0'), name: "LightYellow"         },
	Ivory                : {color: ColorRGB.fromStrHex('#FFFFF0'), name: "Ivory"               },
	White                : {color: ColorRGB.fromStrHex('#FFFFFF'), name: "White"               }};

let colorRevMap: Record<string, string> = {
    "Black": "White",
    "Navy": "Khaki",
    "DarkBlue": "Khaki",
    "MediumBlue": "Yellow",
    "Blue": "Yellow",
    "DarkGreen": "Violet",
    "Green": "Violet",
    "Teal": "LightCoral",
    "DarkCyan": "Salmon",
    "DeepSkyBlue": "OrangeRed",
    "DarkTurquoise": "OrangeRed",
    "MediumSpringGreen": "DeepPink",
    "Lime": "Fuchsia",
    "SpringGreen": "DeepPink",
    "Aqua": "Red",
    "Cyan": "Red",
    "MidnightBlue": "Khaki",
    "DodgerBlue": "Maroon",
    "LightSeaGreen": "Maroon",
    "ForestGreen": "Orchid",
    "SeaGreen": "PaleVioletRed",
    "DarkSlateGray": "Tan",
    "LimeGreen": "DarkOrchid",
    "MediumSeaGreen": "Maroon",
    "Turquoise": "FireBrick",
    "RoyalBlue": "DarkGoldenRod",
    "SteelBlue": "Peru",
    "DarkSlateBlue": "DarkKhaki",
    "MediumTurquoise": "Brown",
    "Indigo": "PaleGreen",
    "DarkOliveGreen": "DarkGray",
    "CadetBlue": "Brown",
    "CornflowerBlue": "SaddleBrown",
    "MediumAquaMarine": "Brown",
    "DimGray": "LightSlateGray",
    "SlateBlue": "YellowGreen",
    "OliveDrab": "DarkSlateBlue",
    "SlateGray": "DarkViolet",
    "LightSlateGray": "DarkViolet",
    "MediumSlateBlue": "Khaki",
    "LawnGreen": "DarkViolet",
    "Chartreuse": "DarkViolet",
    "Aquamarine": "Maroon",
    "Maroon": "Aquamarine",
    "Purple": "LightGreen",
    "Olive": "DarkGreen",
    "Gray": "DarkKhaki",
    "SkyBlue": "SaddleBrown",
    "LightSkyBlue": "SaddleBrown",
    "BlueViolet": "YellowGreen",
    "DarkRed": "Aquamarine",
    "DarkMagenta": "LightGreen",
    "SaddleBrown": "SkyBlue",
    "DarkSeaGreen": "DimGray",
    "LightGreen": "Purple",
    "MediumPurple": "DarkKhaki",
    "DarkViolet": "LawnGreen",
    "PaleGreen": "Purple",
    "DarkOrchid": "LimeGreen",
    "YellowGreen": "SlateBlue",
    "Sienna": "CornflowerBlue",
    "Brown": "MediumTurquoise",
    "DarkGray": "DarkSlateGray",
    "LightBlue": "DarkOliveGreen",
    "GreenYellow": "DarkViolet",
    "PaleTurquoise": "Maroon",
    "LightSteelBlue": "DarkOliveGreen",
    "PowderBlue": "DarkOliveGreen",
    "FireBrick": "Turquoise",
    "DarkGoldenRod": "RoyalBlue",
    "MediumOrchid": "LimeGreen",
    "RosyBrown": "DimGray",
    "DarkKhaki": "DarkSlateBlue",
    "Silver": "DarkSlateGray",
    "MediumVioletRed": "MediumSeaGreen",
    "IndianRed": "Navy",
    "Peru": "SteelBlue",
    "Chocolate": "MediumBlue",
    "Tan": "DarkSlateGray",
    "LightGray": "DarkSlateGray",
    "Thistle": "DarkSlateGray",
    "Orchid": "DarkSlateGray",
    "GoldenRod": "RoyalBlue",
    "PaleVioletRed": "DarkSlateGray",
    "Crimson": "Turquoise",
    "Gainsboro": "MidnightBlue",
    "Plum": "ForestGreen",
    "BurlyWood": "MidnightBlue",
    "LightCyan": "Black",
    "Lavender": "Black",
    "DarkSalmon": "Teal",
    "Violet": "Green",
    "PaleGoldenRod": "MidnightBlue",
    "LightCoral": "Teal",
    "Khaki": "MidnightBlue",
    "AliceBlue": "Black",
    "HoneyDew": "Black",
    "Azure": "Black",
    "SandyBrown": "Teal",
    "Wheat": "MidnightBlue",
    "Beige": "Black",
    "WhiteSmoke": "Black",
    "MintCream": "Black",
    "GhostWhite": "Black",
    "Salmon": "Teal",
    "AntiqueWhite": "Black",
    "Linen": "Black",
    "LightGoldenRodYellow": "Black",
    "OldLace": "Black",
    "Red": "Aqua",
    "Fuchsia": "Lime",
    "Magenta": "Lime",
    "DeepPink": "SpringGreen",
    "OrangeRed": "DarkBlue",
    "Tomato": "DarkBlue",
    "HotPink": "SeaGreen",
    "Coral": "Teal",
    "DarkOrange": "DodgerBlue",
    "LightSalmon": "Teal",
    "Orange": "DodgerBlue",
    "LightPink": "DarkSlateGray",
    "Pink": "DarkGreen",
    "Gold": "Blue",
    "PeachPuff": "MidnightBlue",
    "NavajoWhite": "MidnightBlue",
    "Moccasin": "MidnightBlue",
    "Bisque": "MidnightBlue",
    "MistyRose": "Black",
    "BlanchedAlmond": "Black",
    "PapayaWhip": "Black",
    "LavenderBlush": "Black",
    "SeaShell": "Black",
    "Cornsilk": "Black",
    "LemonChiffon": "Black",
    "FloralWhite": "Black",
    "Snow": "Black",
    "Yellow": "Blue",
    "LightYellow": "Black",
    "Ivory": "Black",
    "White": "Black"
};

let color140Arr = Object.keys(color140).map(name => ({
    name,
    color: color140[name as keyof typeof color140],
    rev: colorRevMap[name]
        ? color140[colorRevMap[name] as keyof typeof color140]
        : color140.White,
}));

