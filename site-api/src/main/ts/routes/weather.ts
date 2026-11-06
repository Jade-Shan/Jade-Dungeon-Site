import { ICustomHandler, IRequestContext, IRequestData, HTTP_GET } from '@/types';
import { getWeatherForecast } from '@/service/weather';
import { corsHeadersFor, sendOnce } from '@/middleware/simpleHTTPServer';

import { createEmptyOriData as createEmptyOriDataWeatherAPI, IWeatherApiResp } from '@/service/weatherapi';
export const handler: ICustomHandler = {
	urlPtn: '/api/weather/forecast',
	method: HTTP_GET,
	bindFunc: async (context: IRequestContext, data: IRequestData) => {
		let result: IWeatherApiResp = { status: "err", msg: "unknow err", oriData: createEmptyOriDataWeatherAPI(), forecastDays: [], fontStr: '' };
		let outFormat: "conky" | "json" = "conky";
		let cType: string = "text/plan";
		if (data.params.outFormat) {
			if ("json" == data.params.outFormat) {
				outFormat = "json";
				cType = "application/json";
			}
		}
		const appKey1 = data.params.appKey1 ? data.params.appKey1 : "";
		// appKey2 是 OpenWeatherMap 的 key，用于补齐第 4、5 天。
		// 不强制要求：缺它时仍返回 WeatherAPI 的 3 天数据，并在 msg 里说明。
		const appKey2 = data.params.appKey2 ? data.params.appKey2 : "";
		const cityName = data.params.cityName ? data.params.cityName : "Shanghai";
		const forecastDays = data.params.days ? data.params.days : "5";

		if (appKey1 && appKey1.length > 6) {
			const lat = data.params.lat ? data.params.lat : "31.18";
			const lon = data.params.lon ? data.params.lon : "121.43";
			result = await getWeatherForecast(outFormat, appKey1, cityName, forecastDays, lat, lon, appKey2);
			sendOnce(context.response, 200, {
				'Content-Type': 'text/plan',
				'Cache-Control': 'public,s-maxage=300,max-age=300',
				...corsHeadersFor(context.globalCfg, context.request),
			}, result.fontStr);
		} else {
			console.error(`miss app key`);
			result.msg = 'miss appKey1 or appKey2';
			sendOnce(context.response, 400, {
				'Content-Type': `${cType};charset=utf-8`,
				'Cache-Control': 'public,s-maxage=300,max-age=300',
				...corsHeadersFor(context.globalCfg, context.request),
			}, result.fontStr);
		}
	}
};