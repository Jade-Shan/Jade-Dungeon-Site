interface IWindDirtCodeMap {
	code: string;
	iconChar: string;
	name: string;
	angle: string;
}
export const windDirtCodeMap: Map<string, IWindDirtCodeMap> = new Map();

windDirtCodeMap.set("N", { "code": "N", "iconChar": "a", "name": "North", "angle": "0.00°" });
windDirtCodeMap.set("NNE", { "code": "NNE", "iconChar": "b", "name": "North-Northeast", "angle": "22.50°" });
windDirtCodeMap.set("NE", { "code": "NE", "iconChar": "c", "name": "Northeast", "angle": "45.00°" });
windDirtCodeMap.set("ENE", { "code": "ENE", "iconChar": "d", "name": "East-Northeast", "angle": "67.50°" });
windDirtCodeMap.set("E", { "code": "E", "iconChar": "e", "name": "East", "angle": "90.00°" });
windDirtCodeMap.set("ESE", { "code": "ESE", "iconChar": "f", "name": "East-Southeast", "angle": "112.50°" });
windDirtCodeMap.set("SE", { "code": "SE", "iconChar": "g", "name": "Southeast", "angle": "135.00°" });
windDirtCodeMap.set("SSE", { "code": "SSE", "iconChar": "h", "name": "South-Southeast", "angle": "157.50°" });
windDirtCodeMap.set("S", { "code": "S", "iconChar": "i", "name": "South", "angle": "180.00°" });
windDirtCodeMap.set("SSW", { "code": "SSW", "iconChar": "j", "name": "South-Southwest", "angle": "202.50°" });
windDirtCodeMap.set("SW", { "code": "SW", "iconChar": "k", "name": "Southwest", "angle": "225.00°" });
windDirtCodeMap.set("WSW", { "code": "WSW", "iconChar": "l", "name": "West-Southwest", "angle": "247.50°" });
windDirtCodeMap.set("W", { "code": "W", "iconChar": "m", "name": "West", "angle": "270.00°" });
windDirtCodeMap.set("WNW", { "code": "WNW", "iconChar": "n", "name": "West-Northwest", "angle": "292.50°" });
windDirtCodeMap.set("NW", { "code": "NW", "iconChar": "o", "name": "Northwest", "angle": "315.00°" });
windDirtCodeMap.set("NNW", { "code": "NNW", "iconChar": "p", "name": "North-Northwest", "angle": "337.50°" });



export interface IWeatherCode {
	code: number;
	iconChar: { day: string; night: string; };
	cn: string;
	ens: string;
	en: string;
}
export const weatherCodeMap: Map<number, IWeatherCode> = new Map();

weatherCodeMap.set(0b0000000000000000, { "code": 0b0000000000000000, "iconChar": { "day": "a", "night": "A" }, "cn": "晴天", "ens": "Clear", "en": "Clear" });
weatherCodeMap.set(0b0000000000000001, { "code": 0b0000000000000001, "iconChar": { "day": "u", "night": "u" }, "cn": "霜冻", "ens": "Fozen", "en": "Fozen" });
weatherCodeMap.set(0b0000000000000010, { "code": 0b0000000000000010, "iconChar": { "day": "d", "night": "D" }, "cn": "雾", "ens": "Fog", "en": "Fog" });
weatherCodeMap.set(0b0000000000000100, { "code": 0b0000000000000100, "iconChar": { "day": "b", "night": "B" }, "cn": "局部多云", "ens": "Partly Cloudy", "en": "Partly Cloudy" });
weatherCodeMap.set(0b0000000000001000, { "code": 0b0000000000001000, "iconChar": { "day": "c", "night": "C" }, "cn": "多云", "ens": "Cloudy", "en": "Cloudy" });
weatherCodeMap.set(0b0000000000010000, { "code": 0b0000000000010000, "iconChar": { "day": "q", "night": "q" }, "cn": "阴天", "ens": "Overcast", "en": "Overcast" });
weatherCodeMap.set(0b0000000000100000, { "code": 0b0000000000100000, "iconChar": { "day": "g", "night": "G" }, "cn": "小雨", "ens": "Light rain", "en": "Light rain" });
weatherCodeMap.set(0b0000000001000000, { "code": 0b0000000001000000, "iconChar": { "day": "g", "night": "G" }, "cn": "中雨", "ens": "Moderate rain", "en": "Moderate rain" });
weatherCodeMap.set(0b0000000010000000, { "code": 0b0000000010000000, "iconChar": { "day": "i", "night": "I" }, "cn": "大雨", "ens": "Heavy rain", "en": "Heavy rain" });
weatherCodeMap.set(0b0000000100000000, { "code": 0b0000000100000000, "iconChar": { "day": "i", "night": "I" }, "cn": "暴风雨", "ens": "Torrent rain Shwr", "en": "Torrential rain shower" });
weatherCodeMap.set(0b0000001000000000, { "code": 0b0000001000000000, "iconChar": { "day": "Q", "night": "Q" }, "cn": "小冰雹雨", "ens": "Light sleet Shwr", "en": "Light sleet showers" });
weatherCodeMap.set(0b0000010000000000, { "code": 0b0000010000000000, "iconChar": { "day": "Q", "night": "Q" }, "cn": "中度或大冰雹雨", "ens": "Mid Hvy sleet Shwr", "en": "Moderate or heavy sleet showers" });
weatherCodeMap.set(0b0000100000000000, { "code": 0b0000100000000000, "iconChar": { "day": "j", "night": "J" }, "cn": "小雪", "ens": "Light snow", "en": "Light snow" });
weatherCodeMap.set(0b0001000000000000, { "code": 0b0001000000000000, "iconChar": { "day": "j", "night": "J" }, "cn": "中雪", "ens": "Mid snow", "en": "Moderate snow" });
weatherCodeMap.set(0b0010000000000000, { "code": 0b0010000000000000, "iconChar": { "day": "k", "night": "K" }, "cn": "大雪", "ens": "Heavy snow", "en": "Heavy snow" });
weatherCodeMap.set(0b0100000000000000, { "code": 0b0100000000000000, "iconChar": { "day": "k", "night": "K" }, "cn": "暴风雪", "ens": "Blizzard", "en": "Blizzard" });
weatherCodeMap.set(0b1000000000000000, { "code": 0b1000000000000000, "iconChar": { "day": "n", "night": "N" }, "cn": "雷电", "ens": "Thunder", "en": "Thundery outbreak" });
//
weatherCodeMap.set(0b0000000000000011, { "code": 0b0000000000000011, "iconChar": { "day": "u", "night": "u" }, "cn": "冻雾", "ens": "Freezing fog", "en": "Freezing fog" });
weatherCodeMap.set(0b0000000000100010, { "code": 0b0000000000100010, "iconChar": { "day": "y", "night": "y" }, "cn": "微冻雨", "ens": "Light Frez rain", "en": "Light freezing rain" });
weatherCodeMap.set(0b0000000000100011, { "code": 0b0000000000100011, "iconChar": { "day": "y", "night": "y" }, "cn": "周边有有零星小冻雾雨", "ens": "Ptch Frez Drz nerby", "en": "Patchy freezing drizzle nearby" });
weatherCodeMap.set(0b0000000001000010, { "code": 0b0000000001000010, "iconChar": { "day": "y", "night": "y" }, "cn": "中度或大冻雨", "ens": "Mid or Hvy Frez rain", "en": "Moderate or heavy freezing rain" });
weatherCodeMap.set(0b0000000001000011, { "code": 0b0000000001000011, "iconChar": { "day": "y", "night": "y" }, "cn": "冻雾雨", "ens": "Frez drizzle", "en": "Freezing drizzle" });
weatherCodeMap.set(0b0000000010000011, { "code": 0b0000000010000011, "iconChar": { "day": "y", "night": "y" }, "cn": "大冻雾雨", "ens": "Heavy Frez Drz", "en": "Heavy freezing drizzle" });
weatherCodeMap.set(0b0000000011000000, { "code": 0b0000000011000000, "iconChar": { "day": "h", "night": "H" }, "cn": "中雨或大阵雨", "ens": "Mid or Hvy rain Shwr", "en": "Moderate or heavy rain shower" });
weatherCodeMap.set(0b0000100000100000, { "code": 0b0000100000100000, "iconChar": { "day": "S", "night": "S" }, "cn": "周边有零星小雨夹雪", "ens": "Ptch sleet nerby", "en": "Patchy sleet nearby" });
weatherCodeMap.set(0b0011000000000000, { "code": 0b0011000000000000, "iconChar": { "day": "k", "night": "K" }, "cn": "中度或大阵雪", "ens": "Mid or Hvy snow Shwr", "en": "Moderate or heavy snow showers" });
weatherCodeMap.set(0b0011000000100000, { "code": 0b0011000000100000, "iconChar": { "day": "k", "night": "K" }, "cn": "中度或大雨夹雪", "ens": "Mid or Hvy sleet", "en": "Moderate or heavy sleet" });
weatherCodeMap.set(0b1000000000100000, { "code": 0b1000000000100000, "iconChar": { "day": "l", "night": "L" }, "cn": "小雷雨", "ens": "Thundery outbreaks", "en": "Thundery outbreaks in nearby" });
weatherCodeMap.set(0b1000000001000000, { "code": 0b1000000001000000, "iconChar": { "day": "l", "night": "L" }, "cn": "中到大雷雨", "ens": "Thundery outbreaks", "en": "Thundery outbreaks in nearby" });
weatherCodeMap.set(0b1000000010000000, { "code": 0b1000000010000000, "iconChar": { "day": "l", "night": "L" }, "cn": "雷区有中或大雨", "ens": "Mid Hvy rain thunder", "en": "Moderate or heavy rain in area with thunder" });
weatherCodeMap.set(0b1000100000000000, { "code": 0b1000100000000000, "iconChar": { "day": "j", "night": "J" }, "cn": "雷区有零星小雪", "ens": "Ptch light snow thndr", "en": "Patchy light snow in area with thunder" });
weatherCodeMap.set(0b1001000000000000, { "code": 0b1001000000000000, "iconChar": { "day": "k", "night": "K" }, "cn": "雷区有中或大雪", "ens": "Mid or Hvy snow thndr", "en": "Moderate or heavy snow in area with thunder" });


export interface IForecastDayRec {
	location: string;
	date: string;
	dayOfWeek: string;
	weatherCode: number;
	weatherDesc: string;
	/** 月相名称，WeatherAPI 原样返回的英文字符串，如 `"Waxing Crescent"` */
	moonPhase: string;
	uv: number;
	temp: number;
	tempBodyFeel: number;
	tempMin: number;
	tempMax: number;
	atmPressure: number;
	windSpeed: number;
	windDir: string;
	humedPct: number;
	preciPct: number;
	sunrise: string;
	sunset: string;
}
export const forecastDays: IForecastDayRec[] = [{
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
