import https from 'https';
import { IWeatherRec } from '@/types';

const CALL_ITV = 1000 * 60 * 20;
let lastUpdateTime = 0;

interface IWeatherApiForecastAstroRec {
	sunrise: string;
	sunset: string;
	moonrise: string;
	moonset: string;
	moon_illumination: number;
	moon_phase: string;
	is_moon_up: number;
	is_sun_up: number;
}

interface IWeatherApiForecastHourRec {
		condition: { text: string; code: number; icon: string; };
		wind_dir: string;
}

/**
 * 第三方接口的每日预报数据结构
 */
interface IWeatherApiForecastDailyRec {
	date: string;
	day: {
		condition: { text: string; code: number; icon: string; };
		mintemp_c: number;
		maxtemp_c: number;
		avgtemp_c: number;
		maxwind_kph: number;
		avgvis_km: number;
		avgvis_miles: number;
		avghumidity: number;
		daily_chance_of_rain: number;
		daily_chance_of_snow: number;
		uv: number;
	};
	astro: IWeatherApiForecastAstroRec;
	hour: IWeatherApiForecastHourRec[];
}



/**
 * 第三方接口原始数据结构
 */
interface IweatherApiOriData {
	location: {
		name: string;
		region: string;
		country: string;
		lat?: number;
		lon?: number;
		tz_id?: string;
		localtime_epoch?: number;
		localtime?: string;
	};
	current: {
		condition: { text: string; code: number; icon: string; };
		wind_kph: number;
		wind_dir: string;
		wind_degree: number;
		will_it_rain: number;
		chance_of_rain: number;
		will_it_snow: number;
		chance_of_snow: number;
		humidity: number;
		temp_c: number;
		feelslike_c: number;
		pressure_mb: number;
		is_day: number;
	};
	forecast: { forecastday: IWeatherApiForecastDailyRec[]; };
};
export const createEmptyOriData = () : IweatherApiOriData =>{return  {
	location: { name: '', region: '', country: '' },
	current: {
		condition: { text: '', code: 0, icon: '' },
		is_day: 0,
		wind_kph: 0,
		wind_dir: '',
		wind_degree: 0,
		will_it_rain: 0,
		chance_of_rain: 0,
		will_it_snow: 0,
		chance_of_snow: 0,
		humidity: 0,
		temp_c: 0,
		feelslike_c: 0,
		pressure_mb: 0
	},
	forecast: { forecastday: [] as IWeatherApiForecastDailyRec[] },
}};


/**
 * 转换后的记录缓存
 *  */
export interface IWeatherApiResp { 
	status: string; 
	msg: string; 
	oriData: IweatherApiOriData;
	forecastDays: IWeatherRec[];
	fontStr: string;
};
let lastCache:IWeatherApiResp = {
	status: "err", 
	msg: "unknow err", 
	oriData: createEmptyOriData(), 
	forecastDays: [],
	fontStr: ''
};

// https://www.weatherapi.com/api-explorer.aspx#forecast
// https://www.weatherapi.com/docs/ 
const weatherCode3rdMap: Map<number, IWeatherCode3rd> = new Map();

interface IWeatherCode3rd {
	code: number;
	cn: string;
	ens: string;
	en: string;
}

export const createEmptyRecs = (): IWeatherRec[] => {
	return [{
		location: "", date: "", dayOfWeek: "", weatherCode: 0, weatherDesc: '', moonPhase: '', uv: 0,
		temp: 0, tempBodyFeel: 0, tempMin: 0, tempMax: 0, atmPressure: 0,
		windSpeed: 0, windDir: 'N', humedPct: 0, preciPct: 0, sunrise: '', sunset: ''
	}, {
		location: "", date: "", dayOfWeek: "", weatherCode: 0, weatherDesc: '', moonPhase: '', uv: 0,
		temp: 0, tempBodyFeel: 0, tempMin: 0, tempMax: 0, atmPressure: 0,
		windSpeed: 0, windDir: 'N', humedPct: 0, preciPct: 0, sunrise: '', sunset: ''
	}, {
		location: "", date: "", dayOfWeek: "", weatherCode: 0, weatherDesc: '', moonPhase: '', uv: 0,
		temp: 0, tempBodyFeel: 0, tempMin: 0, tempMax: 0, atmPressure: 0,
		windSpeed: 0, windDir: 'N', humedPct: 0, preciPct: 0, sunrise: '', sunset: ''
	}, {
		location: "", date: "", dayOfWeek: "", weatherCode: 0, weatherDesc: '', moonPhase: '', uv: 0,
		temp: 0, tempBodyFeel: 0, tempMin: 0, tempMax: 0, atmPressure: 0,
		windSpeed: 0, windDir: 'N', humedPct: 0, preciPct: 0, sunrise: '', sunset: ''
	}, {
		location: "", date: "", dayOfWeek: "", weatherCode: 0, weatherDesc: '', moonPhase: '', uv: 0,
		temp: 0, tempBodyFeel: 0, tempMin: 0, tempMax: 0, atmPressure: 0,
		windSpeed: 0, windDir: 'N', humedPct: 0, preciPct: 0, sunrise: '', sunset: ''
	}];
}

// 真实 API 响应的测试夹具，供第 288 行那段注释掉的调试代码使用
// （本地调试时启用它可以不消耗 API 配额）。有意保留，故关闭未用变量告警。
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const testData:IweatherApiOriData = {
	"location": {
		"name": "Shanghai",
		"region": "Shanghai",
		"country": "China",
		"lat": 31.005,
		"lon": 121.4086,
		"tz_id": "Asia/Shanghai",
		"localtime_epoch": 1780317130,
		"localtime": "2026-06-01 20:32"
	},
	"current": {
		"temp_c": 24.5,
		"is_day": 0,
		"condition": {
			"text": "Cloudy",
			"icon": "//cdn.weatherapi.com/weather/64x64/night/119.png",
			"code": 1006
		},
		"wind_kph": 14.4,
		"wind_degree": 96,
		"wind_dir": "E",
		"pressure_mb": 1008.0,
		"humidity": 83,
		"feelslike_c": 17.7,
		"will_it_rain": 0,
		"chance_of_rain": 11,
		"will_it_snow": 0,
		"chance_of_snow": 0
	},
	"forecast": {
		"forecastday": [
			{
				"date": "2026-06-01",
				"day": {
					"maxtemp_c": 29.7,
					"mintemp_c": 20.0,
					"avgtemp_c": 24.9,
					"maxwind_kph": 17.3,
					"avgvis_km": 10.0,
					"avgvis_miles": 6.0,
					"avghumidity": 69,
					"daily_chance_of_rain": 73,
					"daily_chance_of_snow": 0,
					"condition": {
						"text": "Partly Cloudy",
						"icon": "//cdn.weatherapi.com/weather/64x64/day/116.png",
						"code": 1003
					},
					"uv": 10.5
				},
				"astro": {
					"sunrise": "04:51 AM",
					"sunset": "06:53 PM",
					"moonrise": "08:16 PM",
					"moonset": "05:14 AM",
					"moon_phase": "Waning Gibbous",
					"moon_illumination": 96,
					"is_moon_up": 1,
					"is_sun_up": 0
				},
				"hour": []
			},
			{
				"date": "2026-06-02",
				"day": {
					"maxtemp_c": 27.7,
					"mintemp_c": 22.8,
					"avgtemp_c": 25.1,
					"maxwind_kph": 13.7,
					"avgvis_km": 10.0,
					"avgvis_miles": 6.0,
					"avghumidity": 78,
					"daily_chance_of_rain": 73,
					"daily_chance_of_snow": 0,
					"condition": {
						"text": "Patchy rain nearby",
						"icon": "//cdn.weatherapi.com/weather/64x64/day/176.png",
						"code": 1063
					},
					"uv": 6.7
				},
				"astro": {
					"sunrise": "04:51 AM",
					"sunset": "06:53 PM",
					"moonrise": "09:05 PM",
					"moonset": "06:07 AM",
					"moon_phase": "Waning Gibbous",
					"moon_illumination": 90,
					"is_moon_up": 0,
					"is_sun_up": 0
				},
				"hour":[], 
			},
			{
				"date": "2026-06-03",
				"day": {
					"maxtemp_c": 30.4,
					"mintemp_c": 21.9,
					"avgtemp_c": 25.7,
					"maxwind_kph": 17.6,
					"avgvis_km": 9.7,
					"avgvis_miles": 6.0,
					"avghumidity": 78,
					"daily_chance_of_rain": 73,
					"daily_chance_of_snow": 0,
					"condition": {
						"text": "Patchy rain nearby",
						"icon": "//cdn.weatherapi.com/weather/64x64/day/176.png",
						"code": 1063
					},
					"uv": 9.5
				},
				"astro": {
					"sunrise": "04:50 AM",
					"sunset": "06:54 PM",
					"moonrise": "09:48 PM",
					"moonset": "07:03 AM",
					"moon_phase": "Waning Gibbous",
					"moon_illumination": 83,
					"is_moon_up": 0,
					"is_sun_up": 0
				},
				"hour": [], 
			}
		]
	}
};

// days 是 string：来自 query 参数，只拼进请求 URL，不参与数值运算
export const fetchForecast = async (appKey: string, cityName: string, days: string): Promise<IWeatherApiResp> => {
	const now = (new Date()).getTime();
	if (!lastCache || now - CALL_ITV - lastUpdateTime > 0) {
		const data: IWeatherApiResp = await fetchForecastData(appKey, cityName, days);
		if ('success' == data.status) {
			data.forecastDays = transForecastFormatFontText(data.oriData);
			// data.forecastDays = transForecastFormatFontText(testData);
			lastCache = data;
			lastUpdateTime = now;
		} else {
			data.forecastDays = createEmptyRecs();
		}
		lastCache = data;
	}
	return lastCache;
};


const fetchForecastData = async (appKey: string, cityName: string, days: string): Promise<IWeatherApiResp> => {
	const emptyRec = createEmptyOriData();
	let result: IWeatherApiResp = { status: "err", msg: "unknow err" ,oriData: emptyRec, forecastDays: [], fontStr: ''};
	await new Promise<IweatherApiOriData>((resolve, reject) => {
		const buffers: Buffer[] = [];
		let settled = false;
		const done = (err: Error | null, data: IweatherApiOriData) => {
			if (settled) return;
			settled = true;
			if (err) { reject(err); } else { resolve(data); }
		};

		const request = https.get(
			`https://api.weatherapi.com/v1/forecast.json?key=${appKey}&q=${cityName}&days=${days}&aqi=no&alerts=no`,
			(res) => {
				if (res.statusCode !== 200) {
					// 消费响应体以防内存泄漏，然后 reject
					res.resume();
					return done(new Error(`Server HTTP Err Code: ${res.statusCode}`), emptyRec);
				}
				res.on('data', (chunk) => { buffers.push(chunk); });
				res.on('end', () => {
					const str = Buffer.concat(buffers).toString('utf8');
					try {
						done(null, JSON.parse(str));
					} catch {
						done(new Error(`parse json err: ${str}`), emptyRec);
					}
				});
				res.on('error', (err) => {
					done(new Error(`Response stream error: ${err.message}`), emptyRec);
				});
			});

		request.on('error', (err) => {
			done(new Error(`Request error: ${err.message}`), emptyRec);
		});

		request.setTimeout(15000, () => {
			request.destroy();
			done(new Error('Request timeout'), emptyRec);
		});
	}).then((data) => {
		result = { status: 'success', msg: '', oriData: data, forecastDays: [], fontStr: '' };
	}).catch((e) => {
		result.msg = e.message || e;
	});
	return result;
};


/** `YYYY-MM-DD` 加若干天，返回同格式字符串 */
const shiftDate = (dateStr: string, n: number): string => {
	const [y, m, d] = dateStr.split('-').map(Number);
	const dt = new Date(Date.UTC(y, m - 1, d));
	dt.setUTCDate(dt.getUTCDate() + n);
	return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
};

const transForecastFormatFontText = (oriData: IweatherApiOriData): IWeatherRec[] => {
	const forecastDays: IWeatherRec[] = createEmptyRecs();
	// console.log(oriData);
	forecastDays[0].location = `${oriData.location.region}, ${oriData.location.country}`;
	// 填入各天的日期（原先这里硬写成 ''，后面几天也从未赋值，导致 date 字段一直是空的）。
	// 第 4、5 天 WeatherAPI 免费账号不提供，按第 3 天顺延推算，供 OpenWeatherMap 按日期对齐。
	const apiDays = oriData.forecast.forecastday;
	for (let i = 0; i < forecastDays.length; i++) {
		forecastDays[i].date = i < apiDays.length
			? apiDays[i].date
			: shiftDate(apiDays[apiDays.length - 1].date, i - (apiDays.length - 1));
	}
	forecastDays[0].weatherDesc = oriData.current.condition.text;
	forecastDays[0].humedPct = oriData.current.humidity;
	// moon_phase 是 "Waxing Crescent" 这类英文名称，原样保留供 transMoonPhaseFont 匹配。
	// 这里原先套了 parseInt() 会得到 NaN，导致月相图标恒为默认值。
	forecastDays[0].moonPhase = oriData.forecast.forecastday[0].astro.moon_phase;
	forecastDays[0].temp = oriData.current.temp_c;
	forecastDays[0].tempBodyFeel = oriData.current.feelslike_c;
	forecastDays[0].atmPressure = oriData.current.pressure_mb;
	forecastDays[0].sunrise = oriData.forecast.forecastday[0].astro.sunrise;
	forecastDays[0].sunset = oriData.forecast.forecastday[0].astro.sunset;

	const today = new Date();
	const tomorrow = (new Date());
	tomorrow.setTime(today.getTime() + 24 * 60 * 60 * 1000);
	const dfTomorrow = (new Date());
	dfTomorrow.setTime(tomorrow.getTime() + 24 * 60 * 60 * 1000);
	const dgTomorrow = (new Date());
	dgTomorrow.setTime(dfTomorrow.getTime() + 24 * 60 * 60 * 1000);
	const dhTomorrow = (new Date());
	dhTomorrow.setTime(dgTomorrow.getTime() + 24 * 60 * 60 * 1000);

	// uv / moonPhase / sunrise / sunset 原先只有第 0 天（或完全没有）赋值。
	// WeatherAPI 对它返回的每一天都提供这四项，这里逐天补齐。
	// 注意第 4、5 天来自 OpenWeatherMap，该数据源不提供这些，所以那两天仍是空值。
	for (let i = 0; i < apiDays.length && i < forecastDays.length; i++) {
		forecastDays[i].uv = apiDays[i].day.uv;
		forecastDays[i].moonPhase = apiDays[i].astro.moon_phase;
		forecastDays[i].sunrise = apiDays[i].astro.sunrise;
		forecastDays[i].sunset = apiDays[i].astro.sunset;
	}

	forecastDays[0].dayOfWeek = today.toDateString().split(' ')[0];
	forecastDays[0].weatherCode = getWeatherCode(oriData.current.condition.code);
	forecastDays[0].windSpeed = oriData.current.wind_kph;
	forecastDays[0].windDir = oriData.current.wind_dir;
	forecastDays[0].tempMin = oriData.forecast.forecastday[0].day.mintemp_c;
	forecastDays[0].tempMax = oriData.forecast.forecastday[0].day.maxtemp_c;
	const rainChance0 = oriData.forecast.forecastday[0].day.daily_chance_of_rain;
	const snowChance0 = oriData.forecast.forecastday[0].day.daily_chance_of_snow;
	forecastDays[0].preciPct = rainChance0 > snowChance0 ? rainChance0 : snowChance0;

	forecastDays[1].dayOfWeek = tomorrow.toDateString().split(' ')[0];
	forecastDays[1].weatherCode = getWeatherCode(oriData.forecast.forecastday[1].day.condition.code);
	forecastDays[1].windSpeed = oriData.forecast.forecastday[1].day.maxwind_kph;
	forecastDays[1].windDir = oriData.forecast.forecastday[1].hour[10].wind_dir;
	forecastDays[1].tempMin = oriData.forecast.forecastday[1].day.mintemp_c;
	forecastDays[1].tempMax = oriData.forecast.forecastday[1].day.maxtemp_c;
	const rainChance1 = oriData.forecast.forecastday[1].day.daily_chance_of_rain;
	const snowChance1 = oriData.forecast.forecastday[1].day.daily_chance_of_snow;
	forecastDays[1].preciPct = rainChance1 > snowChance1 ? rainChance1 : snowChance1;

	forecastDays[2].windDir = oriData.forecast.forecastday[2].hour[10].wind_dir;
	forecastDays[2].dayOfWeek = dfTomorrow.toDateString().split(' ')[0];
	forecastDays[2].weatherCode = getWeatherCode(oriData.forecast.forecastday[2].day.condition.code);
	forecastDays[2].windSpeed = oriData.forecast.forecastday[2].day.maxwind_kph;
	forecastDays[2].tempMin = oriData.forecast.forecastday[2].day.mintemp_c;
	forecastDays[2].tempMax = oriData.forecast.forecastday[2].day.maxtemp_c;
	const rainChance2 = oriData.forecast.forecastday[2].day.daily_chance_of_rain;
	const snowChance2 = oriData.forecast.forecastday[2].day.daily_chance_of_snow;
	forecastDays[2].preciPct = rainChance2 > snowChance2 ? rainChance2 : snowChance2;

	forecastDays[3].windDir     = 'N';
	forecastDays[3].dayOfWeek   = dgTomorrow.toDateString().split(' ')[0];
	forecastDays[3].weatherCode = 1000000;
	forecastDays[3].windSpeed   = 0;
	forecastDays[3].tempMin     = 0;
	forecastDays[3].tempMax     = 0;
	forecastDays[3].preciPct    = 0;

	forecastDays[4].windDir     = 'N';
	forecastDays[4].dayOfWeek   = dhTomorrow.toDateString().split(' ')[0];
	forecastDays[4].weatherCode = 1000000;
	forecastDays[4].windSpeed   = 0;
	forecastDays[4].tempMin     = 0;
	forecastDays[4].tempMax     = 0;
	forecastDays[4].preciPct    = 0;
	return forecastDays;
}

const getWeatherCode = (code3rd: number): number => {
	const ccode = weatherCode3rdMap.get(code3rd);
	return ccode ? ccode.code : 0b0000000000000100;
}

weatherCode3rdMap.set(1000, { "code": 0b0000000000000000,"cn": "晴天", "ens": "Clear", "en": "Clear" });
weatherCode3rdMap.set(1917, { "code": 0b0000000000000001,"cn": "霜冻", "ens": "Fozen", "en": "Fozen" });
weatherCode3rdMap.set(1135, { "code": 0b0000000000000010,"cn": "雾", "ens": "Fog", "en": "Fog" });
weatherCode3rdMap.set(1003, { "code": 0b0000000000000100,"cn": "局部多云", "ens": "Partly Cloudy", "en": "Partly Cloudy" });
weatherCode3rdMap.set(1006, { "code": 0b0000000000001000,"cn": "多云", "ens": "Cloudy", "en": "Cloudy" });
weatherCode3rdMap.set(1009, { "code": 0b0000000000010000,"cn": "阴天", "ens": "Overcast", "en": "Overcast" });
weatherCode3rdMap.set(1183, { "code": 0b0000000000100000,"cn": "小雨", "ens": "Light rain", "en": "Light rain" });
weatherCode3rdMap.set(1189, { "code": 0b0000000001000000,"cn": "中雨", "ens": "Moderate rain", "en": "Moderate rain" });
weatherCode3rdMap.set(1195, { "code": 0b0000000010000000,"cn": "大雨", "ens": "Heavy rain", "en": "Heavy rain" });
weatherCode3rdMap.set(1246, { "code": 0b0000000100000000,"cn": "暴风雨", "ens": "Torrent rain Shwr", "en": "Torrential rain shower" });
weatherCode3rdMap.set(1249, { "code": 0b0000001000000000,"cn": "小冰雹雨", "ens": "Light sleet Shwr", "en": "Light sleet showers" });
weatherCode3rdMap.set(1252, { "code": 0b0000010000000000,"cn": "中度或大冰雹雨", "ens": "Mid Hvy sleet Shwr", "en": "Moderate or heavy sleet showers" });
weatherCode3rdMap.set(1213, { "code": 0b0000100000000000,"cn": "小雪", "ens": "Light snow", "en": "Light snow" });
weatherCode3rdMap.set(1219, { "code": 0b0001000000000000,"cn": "中雪", "ens": "Mid snow", "en": "Moderate snow" });
weatherCode3rdMap.set(1225, { "code": 0b0010000000000000,"cn": "大雪", "ens": "Heavy snow", "en": "Heavy snow" });
weatherCode3rdMap.set(1117, { "code": 0b0100000000000000,"cn": "暴风雪", "ens": "Blizzard", "en": "Blizzard" });
weatherCode3rdMap.set(1087, { "code": 0b1000000000000000,"cn": "雷电", "ens": "Thunder", "en": "Thundery outbreak" });
// 
weatherCode3rdMap.set(1030, { "code": 0b0000000000000010,"cn": "薄雾", "ens": "Mist", "en": "Mist" });
weatherCode3rdMap.set(1147, { "code": 0b0000000000000011,"cn": "冻雾", "ens": "Freezing fog", "en": "Freezing fog" });
weatherCode3rdMap.set(1063, { "code": 0b0000000000100000,"cn": "周边有零星小雨", "ens": "Ptch rain nerby", "en": "Patchy rain nearby" });
weatherCode3rdMap.set(1240, { "code": 0b0000000000100000,"cn": "小阵雨", "ens": "Light rain Shwr", "en": "Light rain shower" });
weatherCode3rdMap.set(1180, { "code": 0b0000000000100000,"cn": "片状小雨", "ens": "Ptch light rain", "en": "Patchy light rain" });
weatherCode3rdMap.set(1153, { "code": 0b0000000000100000,"cn": "细雨", "ens": "Light drizzle", "en": "Light drizzle" });
weatherCode3rdMap.set(1150, { "code": 0b0000000000100000,"cn": "零星细雨", "ens": "Ptch light Drz", "en": "Patchy light drizzle" });
weatherCode3rdMap.set(1186, { "code": 0b0000000001000000,"cn": "偶尔有中雨", "ens": "Mid rain at times", "en": "Moderate rain at times" });
weatherCode3rdMap.set(1192, { "code": 0b0000000010000000,"cn": "偶尔有大雨", "ens": "Heavy rain at times", "en": "Heavy rain at times" });
weatherCode3rdMap.set(1243, { "code": 0b0000000011000000,"cn": "中雨或大阵雨", "ens": "Mid or Hvy rain Shwr", "en": "Moderate or heavy rain shower" });
weatherCode3rdMap.set(1198, { "code": 0b0000000000100010,"cn": "微冻雨", "ens": "Light Frez rain", "en": "Light freezing rain" });
weatherCode3rdMap.set(1201, { "code": 0b0000000001000010,"cn": "中度或大冻雨", "ens": "Mid or Hvy Frez rain", "en": "Moderate or heavy freezing rain" });
weatherCode3rdMap.set(1072, { "code": 0b0000000000100011,"cn": "周边有有零星小冻雾雨", "ens": "Ptch Frez Drz nerby", "en": "Patchy freezing drizzle nearby" });
weatherCode3rdMap.set(1168, { "code": 0b0000000001000011,"cn": "冻雾雨", "ens": "Frez drizzle", "en": "Freezing drizzle" });
weatherCode3rdMap.set(1171, { "code": 0b0000000010000011,"cn": "大冻雾雨", "ens": "Heavy Frez Drz", "en": "Heavy freezing drizzle" });
weatherCode3rdMap.set(1087, { "code": 0b1000000000100000,"cn": "周边有雷雨", "ens": "Thundery outbreaks", "en": "Thundery outbreaks in nearby" });
weatherCode3rdMap.set(1237, { "code": 0b0000001000000000,"cn": "冰丸", "ens": "Ice pellets", "en": "Ice pellets" });
weatherCode3rdMap.set(1261, { "code": 0b0000001000000000,"cn": "冰丸小雨", "ens": "Light ice Plts", "en": "Light showers of ice pellets" });
weatherCode3rdMap.set(1264, { "code": 0b0000010000000000,"cn": "中度或大冰丸", "ens": "Mid Hvy ice Plts", "en": "Moderate or heavy showers of ice pellets" });
weatherCode3rdMap.set(1273, { "code": 0b1000000000100000,"cn": "雷区有零星小雨", "ens": "Ptch light rain thndr", "en": "Patchy light rain in area with thunder" });
weatherCode3rdMap.set(1276, { "code": 0b1000000010000000,"cn": "雷区有中或大雨", "ens": "Mid Hvy rain thunder", "en": "Moderate or heavy rain in area with thunder" });
weatherCode3rdMap.set(1279, { "code": 0b1000100000000000,"cn": "雷区有零星小雪", "ens": "Ptch light snow thndr", "en": "Patchy light snow in area with thunder" });
weatherCode3rdMap.set(1282, { "code": 0b1001000000000000,"cn": "雷区有中或大雪", "ens": "Mid or Hvy snow thndr", "en": "Moderate or heavy snow in area with thunder" });
weatherCode3rdMap.set(1204, { "code": 0b0000100000000000,"cn": "微雨夹雪", "ens": "Light sleet", "en": "Light sleet" });
weatherCode3rdMap.set(1066, { "code": 0b0000100000000000,"cn": "周边有零星小雪", "ens": "Ptch snow nerby", "en": "Patchy snow nearby" });
weatherCode3rdMap.set(1255, { "code": 0b0000000000000000,"cn": "小阵雪", "ens": "Light snow Shwr", "en": "Light snow showers" });
weatherCode3rdMap.set(1210, { "code": 0b0000100000000000,"cn": "零星小雪", "ens": "Ptch light snow", "en": "Patchy light snow" });
weatherCode3rdMap.set(1216, { "code": 0b0001000000000000,"cn": "零星中雪", "ens": "Ptch Mid snow", "en": "Patchy moderate snow" });
weatherCode3rdMap.set(1114, { "code": 0b0001000000000000,"cn": "飞雪", "ens": "Blowing snow", "en": "Blowing snow" });
weatherCode3rdMap.set(1222, { "code": 0b0010000000000000,"cn": "零星大雪", "ens": "Ptch Hvy snow", "en": "Patchy heavy snow" });
weatherCode3rdMap.set(1258, { "code": 0b0011000000000000,"cn": "中度或大阵雪", "ens": "Mid or Hvy snow Shwr", "en": "Moderate or heavy snow showers" });
weatherCode3rdMap.set(1069, { "code": 0b0000100000100000,"cn": "周边有零星小雨夹雪", "ens": "Ptch sleet nerby", "en": "Patchy sleet nearby" });
weatherCode3rdMap.set(1207, { "code": 0b0011000000100000,"cn": "中度或大雨夹雪", "ens": "Mid or Hvy sleet", "en": "Moderate or heavy sleet" });
