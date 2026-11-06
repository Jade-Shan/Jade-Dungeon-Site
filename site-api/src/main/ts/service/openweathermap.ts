import https from 'https';
import { IWeatherRec } from '@/types';

/**
 * OpenWeatherMap 数据源（forecast5：5 天 / 3 小时粒度）。
 *
 * 在天气聚合里的职责：WeatherAPI 免费账号只返回 3 天预报（实测请求 5 或 10 天也只给 3 天），
 * 且它的**逐日数据不含风向**。所以第 4、5 天的整条记录、以及第 2、3 天的风向风速，
 * 都依赖这个数据源补齐。
 *
 * 本数据源不提供的字段：`uv`、`moonPhase`（这两项只有 WeatherAPI 有，所以第 4、5 天拿不到）。
 * `sunrise` / `sunset` 只有 city 级的当天值，无法按天提供。
 * 详见 docs/weather-data-sources.md。
 *
 * API 文档：https://openweathermap.org/forecast5
 */

const CALL_ITV = 1000 * 60 * 60;   // 缓存 60 分钟，与旧实现一致
let lastUpdateTime = 0;
let lastCache: IOwmOriData | undefined = undefined;

/** forecast5 响应里单条 3 小时记录 */
export interface IOwmSlice {
	dt: number;
	dt_txt: string;
	main: {
		temp: number; feels_like: number; temp_min: number; temp_max: number;
		pressure: number; humidity: number;
	};
	weather: { id: number; main: string; description: string; icon: string }[];
	wind: { speed: number; deg: number; gust?: number };
	pop: number;
	visibility?: number;
}

/** forecast5 响应整体 */
export interface IOwmOriData {
	cod: string;
	cnt: number;
	list: IOwmSlice[];
	city: {
		name: string; country: string;
		/** 相对 UTC 的秒数偏移，用于把 UTC 时间换算成当地日期 */
		timezone: number;
		sunrise: number; sunset: number;
	};
}

export interface IOwmResp {
	status: 'success' | 'err';
	msg: string;
	oriData?: IOwmOriData;
}

export const createEmptyOriData = (): IOwmOriData => ({
	cod: '', cnt: 0, list: [],
	city: { name: '', country: '', timezone: 0, sunrise: 0, sunset: 0 },
});

/** icon 前缀 → 本项目的天气位掩码。键是 `weather[0].icon` 的前两位。 */
interface IOwmWeatherCode { code: number; cn: string; en: string }

const weatherCode3rdMap: Map<string, IOwmWeatherCode> = new Map();
weatherCode3rdMap.set('01', { code: 0b0000000000000000, cn: '晴天', en: 'Clear' });
weatherCode3rdMap.set('02', { code: 0b0000000000000100, cn: '局部多云', en: 'Partly Cloudy' });
weatherCode3rdMap.set('03', { code: 0b0000000000001000, cn: '多云', en: 'Cloudy' });
weatherCode3rdMap.set('04', { code: 0b0000000000010000, cn: '阴天', en: 'Overcast' });
weatherCode3rdMap.set('09', { code: 0b0000000000100000, cn: '小雨', en: 'Light rain' });
weatherCode3rdMap.set('10', { code: 0b0000000001000000, cn: '大雨', en: 'Heavy rain' });
weatherCode3rdMap.set('11', { code: 0b1000000001000000, cn: '周边有雷雨', en: 'Thundery outbreaks in nearby' });
weatherCode3rdMap.set('13', { code: 0b0001000000000000, cn: '飞雪', en: 'Blowing snow' });
weatherCode3rdMap.set('50', { code: 0b0000000000000010, cn: '雾', en: 'Fog' });

const getWeatherCode = (iconPrefix: string): number => {
	const rec = weatherCode3rdMap.get(iconPrefix);
	if (rec) { return rec.code; }
	console.warn(`⚠️  OpenWeatherMap 未知 icon 前缀: ${iconPrefix}，按「局部多云」处理`);
	return 0b0000000000000100;
};

/** 风向角度 → 16 方位代码 */
export const transWindDir = (deg: number): string => {
	if (deg < 22.50) { return 'N'; }
	else if (deg < 45.00) { return 'NNE'; }
	else if (deg < 67.50) { return 'NE'; }
	else if (deg < 90.00) { return 'ENE'; }
	else if (deg < 112.50) { return 'E'; }
	else if (deg < 135.00) { return 'ESE'; }
	else if (deg < 157.50) { return 'SE'; }
	else if (deg < 180.00) { return 'SSE'; }
	else if (deg < 202.50) { return 'S'; }
	else if (deg < 225.00) { return 'SSW'; }
	else if (deg < 247.50) { return 'SW'; }
	else if (deg < 270.00) { return 'WSW'; }
	else if (deg < 292.50) { return 'W'; }
	else if (deg < 315.00) { return 'WNW'; }
	else if (deg < 337.50) { return 'NW'; }
	else { return 'NNW'; }
};

// 旧实现这里把 index 2 写成了 'Thu'（应为 'Tue'）、index 5 写成 'Fir'（应为 'Fri'），已修正
const dayOfWeekArr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * 把一条 3 小时记录归入所属的「当地自然日」。
 *
 * 注意 `dt` 是 UTC 时间戳，而 `city.timezone` 是该城市相对 UTC 的秒偏移。
 * 旧实现直接截取 `dt_txt`（UTC 字符串）的日期部分分组，对上海（UTC+8）来说，
 * 一个 UTC 日实际跨了当地 08:00 到次日 08:00，分出来的「日」是错位的。
 * 这里改用 `dt + timezone` 换算到当地时间再分组。
 */
const localDayKey = (slice: IOwmSlice, tzOffsetSec: number): { key: string; dayOfWeek: string } => {
	const localMs = (slice.dt + tzOffsetSec) * 1000;
	const d = new Date(localMs);
	const y = d.getUTCFullYear();
	const m = d.getUTCMonth() + 1;
	const day = d.getUTCDate();
	return {
		key: `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
		dayOfWeek: dayOfWeekArr[d.getUTCDay()],
	};
};

/**
 * 把 3 小时粒度的切片聚合成逐日记录。
 *
 * 聚合口径（与旧实现一致）：
 * - `weatherCode`：当天各时段天气码按位或，可表达「白天晴、傍晚转雨」这类复合天气
 * - `preciPct`：取当天各时段 `pop` 的最大值
 * - `tempMin` / `tempMax`：取当天各时段的最低 / 最高
 * - `windSpeed`：取当天最大风速；`windDir`：取最大风速那一刻的风向
 *
 * 未提供的字段保持 `IWeatherRec` 的空值：`uv` 为 0、`moonPhase` 为 ''、
 * `sunrise` / `sunset` 为 ''（OWM 只有 city 级当天值，无法按天给出）。
 */
export const groupForecastByDays = (oriData: IOwmOriData): IWeatherRec[] => {
	if (!oriData || !oriData.list || oriData.list.length === 0) { return []; }

	const tz = oriData.city?.timezone ?? 0;
	const location = oriData.city?.name ?? '';
	const dayMap: Map<string, IWeatherRec> = new Map();
	// windDir 要取「最大风速那一刻」的值，故单独记录每日已见的最大风速
	const maxWindSeen: Map<string, number> = new Map();

	for (const slice of oriData.list) {
		const { key, dayOfWeek } = localDayKey(slice, tz);
		const rec: IWeatherRec = dayMap.get(key) ?? {
			location, date: key, dayOfWeek,
			weatherCode: 0, weatherDesc: '', moonPhase: '', uv: 0,
			temp: 0, tempBodyFeel: 0, tempMin: 255, tempMax: -255, atmPressure: 0,
			windSpeed: 0, windDir: 'N', humedPct: 0, preciPct: 0, sunrise: '', sunset: '',
		};

		rec.weatherCode = rec.weatherCode | getWeatherCode(slice.weather[0].icon.substring(0, 2));
		rec.weatherDesc = slice.weather[0].description;
		rec.preciPct = Math.max(rec.preciPct, slice.pop * 100);
		rec.tempMin = Math.min(rec.tempMin, slice.main.temp_min);
		rec.tempMax = Math.max(rec.tempMax, slice.main.temp_max);
		rec.temp = slice.main.temp;
		rec.tempBodyFeel = slice.main.feels_like;
		rec.atmPressure = slice.main.pressure;
		rec.humedPct = slice.main.humidity;

		if (slice.wind.speed >= (maxWindSeen.get(key) ?? -1)) {
			maxWindSeen.set(key, slice.wind.speed);
			rec.windSpeed = slice.wind.speed;
			rec.windDir = transWindDir(slice.wind.deg);
		}

		dayMap.set(key, rec);
	}

	// 按日期升序返回，首尾可能是不完整的一天（见文档说明）
	return [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));
};

const fetchForecastData = async (appKey: string, lat: string, lon: string): Promise<IOwmResp> => {
	return new Promise<IOwmResp>((resolve) => {
		const buffers: Buffer[] = [];
		let settled = false;
		const done = (resp: IOwmResp) => {
			if (settled) { return; }
			settled = true;
			resolve(resp);
		};

		const request = https.get(
			`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&mode=json&appid=${appKey}`,
			(res) => {
				if (res.statusCode !== 200) {
					res.resume();
					return done({ status: 'err', msg: `OpenWeatherMap HTTP ${res.statusCode}` });
				}
				res.on('data', (chunk: Buffer) => { buffers.push(chunk); });
				res.on('end', () => {
					const str = Buffer.concat(buffers).toString('utf8');
					try {
						const json = JSON.parse(str) as IOwmOriData;
						if ('200' === json.cod) {
							done({ status: 'success', msg: '', oriData: json });
						} else {
							done({ status: 'err', msg: `OpenWeatherMap 返回 cod=${json.cod}` });
						}
					} catch {
						done({ status: 'err', msg: `parse json err: ${str.substring(0, 200)}` });
					}
				});
				res.on('error', (err: Error) => {
					done({ status: 'err', msg: `Response stream error: ${err.message}` });
				});
			});

		request.on('error', (err: Error) => {
			done({ status: 'err', msg: `Request error: ${err.message}` });
		});

		request.setTimeout(15000, () => {
			request.destroy();
			done({ status: 'err', msg: 'Request timeout' });
		});
	});
};

/**
 * 取 OpenWeatherMap 的逐日预报。带 60 分钟内存缓存，缓存未过期时不再请求。
 *
 * 返回数组长度通常是 6（首尾各有一个不完整的当地日），失败时返回空数组，
 * 由调用方决定如何降级——不要返回填 0 的占位记录，那会让错误数据看起来像真实数据。
 */
export const fetchForecast = async (appKey: string, lat: string, lon: string): Promise<IWeatherRec[]> => {
	const now = (new Date()).getTime();
	if (!lastCache || now - CALL_ITV - lastUpdateTime > 0) {
		const result = await fetchForecastData(appKey, lat, lon);
		if ('success' === result.status && result.oriData) {
			lastCache = result.oriData;
			lastUpdateTime = now;
			return groupForecastByDays(result.oriData);
		}
		console.error(`❌ OpenWeatherMap 取数失败: ${result.msg}`);
		return [];
	}
	return groupForecastByDays(lastCache);
};
