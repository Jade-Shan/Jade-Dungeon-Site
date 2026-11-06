import { fetchForecast as fetchFromWeatherAPI, IWeatherApiResp, createEmptyOriData as createEmptyOriDataWeatherAPI } from './weatherapi';
import { fetchForecast as fetchFromOpenWeatherMap } from './openweathermap';
import { weatherCodeMap, windDirtCodeMap, IWeatherCode } from './weatherTypes';
import { IWeatherRec} from '@/types';

// create weather icon SVG to FONT:  https://icomoon.io/app/#/select

/**
 * 聚合两个数据源，产出 5 天预报。
 *
 * 为什么需要两个源（2026-11-04 实测确认）：
 * - WeatherAPI 免费账号**只返回 3 天**（请求 days=5 或 10 都只给 3 天），但这 3 天数据完整
 * - OpenWeatherMap forecast5 给 5 天，用于补齐第 4、5 天
 *
 * 分工：第 1-3 天全部来自 WeatherAPI；第 4、5 天来自 OpenWeatherMap。
 * OpenWeatherMap 不提供 `uv`、`moonPhase`，`sunrise`/`sunset` 也只有当天值，
 * 所以第 4、5 天这几个字段是空的。完整的字段可得性对照见 docs/weather-data-sources.md。
 *
 * days 是 string：从 query 参数取值（默认 '5'），只拼进请求 URL，不参与数值运算。
 */
export const getWeatherForecast = async (outFormat: "conky" | "json", appKey1: string, cityName: string, days: string, lat: string, lon: string, appKey2?: string): Promise<IWeatherApiResp> => {
	let result: IWeatherApiResp = { status: "err", msg: "unknow err", oriData: createEmptyOriDataWeatherAPI(), forecastDays: [] ,fontStr: ''};
	if (appKey1 && appKey1.length > 6) {
		const apiResp = await fetchFromWeatherAPI(appKey1, cityName, days);
		// fetchFromWeatherAPI 带 60 分钟缓存，返回的是缓存对象本身。
		// 下面的合并会改写 forecastDays，必须先拷贝，否则会污染缓存——
		// 那样下一次即使不传 appKey2 也会看到上一次合并进去的 OWM 数据。
		result = { ...apiResp, forecastDays: apiResp.forecastDays.map((d) => ({ ...d })) };

		// 用 OpenWeatherMap 补齐第 4、5 天。缺 appKey2 时跳过，这两天保持 weatherapi.ts
		// 填入的占位值（weatherCode=1000000、温度 0），并在 msg 里说明原因。
		if (appKey2 && appKey2.length > 6) {
			const owmDays: IWeatherRec[] = await fetchFromOpenWeatherMap(appKey2, lat, lon);
			if (owmDays.length > 0) {
				mergeOpenWeatherMapDays(result.forecastDays, owmDays);
			} else {
				result.msg = 'OpenWeatherMap 取数失败，第 4、5 天数据不可用';
			}
		} else {
			result.msg = '未提供 appKey2，第 4、5 天数据不可用（WeatherAPI 免费账号只给 3 天）';
		}

		if ("conky" == outFormat) {
			result.fontStr = transForecastFormatFontText(result.forecastDays);
		} else {
			result.fontStr = JSON.stringify(result);
		}
	}
	return result;
};

/**
 * 把 OpenWeatherMap 的逐日数据合并进 WeatherAPI 的结果。
 *
 * 按**日期**匹配而非下标，因为两个源的首日对齐方式不同（OWM 的第一个自然日可能只有
 * 几条 3 小时切片）。只覆盖 WeatherAPI 没有真实数据的那些天（第 4 天起）。
 */
const mergeOpenWeatherMapDays = (target: IWeatherRec[], owmDays: IWeatherRec[]): void => {
	const owmByDate: Map<string, IWeatherRec> = new Map();
	for (const rec of owmDays) { owmByDate.set(rec.date, rec); }

	// WeatherAPI 已填好第 1-3 天（下标 0-2），其日期取自 forecastday[].date。
	// 第 4、5 天（下标 3、4）在 weatherapi.ts 里只有占位值，这里按日期顺延去 OWM 找。
	const baseDate = target[2]?.date || target[0]?.date;
	if (!baseDate) { return; }

	for (let offset = 1; offset <= 2; offset++) {
		const idx = 2 + offset;
		if (idx >= target.length) { break; }
		const wanted = addDays(baseDate, offset);
		const owmRec = owmByDate.get(wanted);
		if (owmRec) {
			// uv / moonPhase / sunrise / sunset 保持空值——OWM 不提供这几项
			target[idx] = { ...owmRec, location: target[0].location || owmRec.location };
		}
	}
};

/** `YYYY-MM-DD` 加若干天，返回同格式字符串 */
const addDays = (dateStr: string, n: number): string => {
	const [y, m, d] = dateStr.split('-').map(Number);
	const dt = new Date(Date.UTC(y, m - 1, d));
	dt.setUTCDate(dt.getUTCDate() + n);
	return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
};


/**
 * 月相名称 → 图标序号（0-7）。
 *
 * 入参是 WeatherAPI 的 `astro.moon_phase` 原始英文名称，如 `"Waxing Crescent"`。
 * 匹配不上时（空记录的 `''`、或 API 返回了未知名称）返回默认值 5。
 */
const transMoonPhaseFont = (moonPhase: string): number => {
	let mmMoonIcon = 5;
	if (moonPhase == 'New Moon') { mmMoonIcon = 0; } else
		if (moonPhase == 'Waxing Crescent') { mmMoonIcon = 1; } else
			if (moonPhase == 'First Quarter') { mmMoonIcon = 2; } else
				if (moonPhase == 'Waxing Gibbous') { mmMoonIcon = 3; } else
					if (moonPhase == 'Full Moon') { mmMoonIcon = 4; } else
						if (moonPhase == 'Waning Gibbous') { mmMoonIcon = 5; } else
							if (moonPhase == 'Last Quarter') { mmMoonIcon = 6; } else
								if (moonPhase == 'Waning Crescent') { mmMoonIcon = 7; }
	return mmMoonIcon;
};

const splitWeatherDesc = (str: string): string[] => {
	const result = ['', ''];
	if (str && str.length > 0) {
		if (str.length > 30) { str.substring(0, 30); }
		if (str.length < 16) {
			result[0] = str;
		} else {
			const arr = str.split(' ');
			for (const s of arr) {
				if (result[0].length + s.length + 1 < 16) {
					if (result[0].length > 0) { result[0] = result[0] + ' '; }
					result[0] = result[0] + s;
				} else {
					if (result[1].length > 0) { result[1] = result[1] + ' '; }
					result[1] = result[1] + s;
				}
			}
		}
	}
	return result;
};


const getWeatherIconChar = (code: number, isDay: boolean): string => {
	let weather: IWeatherCode | undefined = weatherCodeMap.get(code);
	if (weather && weather.iconChar && weather.iconChar.day) {
		// 
	} else {
		weather = weatherCodeMap.get(0b100);
		for (let i = 1; i < 16; i++) {
			const p = 2 ** i;
			// console.log(`2 ** ${i} = ${p}`);
			if ((code | 2 ** i) > 0) {
				weather = weatherCodeMap.get(p);
			}
		}
	}
	// 兜底：如果仍然找不到，使用默认值 0b0000000000000000（晴天）
	if (!weather) {
		weather = weatherCodeMap.get(0b0000000000000000)!;
	}
	// console.log(`${code.toString(2).padStart(16, 0)} : ${weather.iconChar.day}`);
	return isDay ? weather.iconChar.day : weather.iconChar.night;
};

const transTime12to24 = (timeStr: string): { hour: number, min: number } => {
	let hour = parseInt("1" + timeStr.substring(0, 2)) - 100;
	const min = parseInt("1" + timeStr.substring(3, 5)) - 100;
	const part = timeStr.substring(6, 8);
	if (part == 'pm' || part == 'PM') {
		hour = hour + 12;
	}
	return { hour: hour, min: min };
};

const checkIsDay = (sunrise: { hour: number, min: number }, sunset: { hour: number, min: number }): boolean => {
	const now = new Date();
	const hour = now.getHours();
	const min = now.getMinutes();
	if (hour < sunrise.hour || hour > sunset.hour || //
		(hour == sunrise.hour && min < sunrise.min) || //
		(hour == sunset.hour && min > sunset.min)) // 
	{
		return false;
	} else {
		return true;
	}
};

const transForecastFormatFontText = (forecastDays: IWeatherRec[]): string => {
	// console.log(forecastDays);
	// console.log(forecastDays[0].weatherDesc);
	const weatherStrArr = splitWeatherDesc(forecastDays[0].weatherDesc);
	const sunrise = transTime12to24(forecastDays[0].sunrise);
	const sunset = transTime12to24(forecastDays[0].sunset);
	const isDay = checkIsDay(sunrise, sunset);
	let fontStr = '';
	fontStr = fontStr + `${forecastDays[0].location}\n`;
	fontStr = fontStr + `${getWeatherIconChar(forecastDays[0].weatherCode, isDay)}\n`;
	fontStr = fontStr + `${transMoonPhaseFont(forecastDays[0].moonPhase)}\n`;
	fontStr = fontStr + `${forecastDays[0].temp}\n`;
	fontStr = fontStr + `${forecastDays[0].tempBodyFeel}\n`;
	fontStr = fontStr + `${forecastDays[0].tempMin}~${forecastDays[0].tempMax}\n`;
	fontStr = fontStr + `${forecastDays[0].atmPressure}\n`;
	fontStr = fontStr + `${forecastDays[0].windSpeed}\n`;
	{
		const windD = windDirtCodeMap.get(forecastDays[0].windDir);
		fontStr = fontStr + `${windD ? windD.iconChar : "?"}\n`;
	}
	fontStr = fontStr + `${weatherStrArr[0]}\n`;
	fontStr = fontStr + `${weatherStrArr[1]}\n`;
	fontStr = fontStr + `${forecastDays[0].humedPct}%\n`;
	fontStr = fontStr + `${forecastDays[0].preciPct}%\n`;
	fontStr = fontStr + `${`${sunrise.hour}`.padStart(2, '0')}:${`${sunrise.min}`.padStart(2, '0')} ~ ${`${sunset.hour}`.padStart(2, '0')}:${`${sunset.min}`.padStart(2, '0')}\n`;
	fontStr = fontStr + `${forecastDays[1].dayOfWeek.padStart(8, ' ')}  ${forecastDays[2].dayOfWeek.padStart(8, ' ')}  ${forecastDays[3].dayOfWeek.padStart(8, ' ')}  ${forecastDays[4].dayOfWeek.padStart(8, ' ')}\n`;
	fontStr = fontStr + `  ${getWeatherIconChar(forecastDays[1].weatherCode, true)}  ${getWeatherIconChar(forecastDays[2].weatherCode, true)}  ${getWeatherIconChar(forecastDays[3].weatherCode, true)}   ${getWeatherIconChar(forecastDays[4].weatherCode, true)}\n`;
	fontStr = fontStr + `${`${forecastDays[1].preciPct}%`.padStart(10, ' ')}${`${forecastDays[2].preciPct}%`.padStart(10, ' ')}${`${forecastDays[3].preciPct}%`.padStart(10, ' ')}${`${forecastDays[4].preciPct}%`.padStart(10, ' ')}\n`;
	fontStr = fontStr + `${`${forecastDays[1].windSpeed}Kph`.padStart(10, ' ')}${`${forecastDays[2].windSpeed}Kph`.padStart(10, ' ')}${`${forecastDays[3].windSpeed}Kph`.padStart(10, ' ')}${`${forecastDays[4].windSpeed}Kph`.padStart(10, ' ')}\n`;
	for (let i = 1; i <= 4; i++) {
		const w = windDirtCodeMap.get(forecastDays[i].windDir);
		fontStr = fontStr + `${w ? w.iconChar : '?'}\n`;
	}
	fontStr = fontStr + `${`${forecastDays[1].tempMax}C`.padStart(10, ' ')}${`${forecastDays[2].tempMax}C`.padStart(10, ' ')}${`${forecastDays[3].tempMax}C`.padStart(10, ' ')}${`${forecastDays[4].tempMax}C`.padStart(10, ' ')}\n`;
	fontStr = fontStr + `${`${forecastDays[1].tempMin}C`.padStart(10, ' ')}${`${forecastDays[2].tempMin}C`.padStart(10, ' ')}${`${forecastDays[3].tempMin}C`.padStart(10, ' ')}${`${forecastDays[4].tempMin}C`.padStart(10, ' ')}\n`;
	// console.log(fontStr);
	return fontStr;
}
