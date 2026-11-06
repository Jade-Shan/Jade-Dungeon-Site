# 天气数据源能力与缺失字段

实测日期：2026-11-04　　测试城市：Shanghai（lat 31.18 / lon 121.43）

本文档记录两个天气供应商**用本项目当前账号实际能拿到什么**，以及哪些字段拿不到。
所有结论来自真实请求，不是读文档推断的。

## 一句话结论

WeatherAPI 免费账号**只给 3 天**预报，所以第 4、5 天必须靠 OpenWeatherMap 补；
而 OpenWeatherMap 不提供 `uv` 和 `moonPhase`，所以**第 4、5 天这两个字段永远是空的**。
这是账号等级决定的，不是代码缺陷。

## 一、预报天数：关键差异

### WeatherAPI.com —— 免费账号封顶 3 天

```
请求 days=3  → 实际返回 3 天  [11-04, 11-05, 11-06]
请求 days=5  → 实际返回 3 天  [11-04, 11-05, 11-06]
请求 days=10 → 实际返回 3 天  [11-04, 11-05, 11-06]
```

**请求再多也只给 3 天**，接口不报错、静默截断。这就是老系统要聚合两个数据源的根本原因。
接口的 `days` 参数传 5 其实没有意义，但保留它以兼容旧调用方。

### OpenWeatherMap forecast5 —— 5 天，3 小时粒度

```
cnt=40 条 3 小时记录 → 覆盖 5.0 天
按当地自然日分组 → 6 个日期：
    2026-11-04: 5 条   ← 不完整（当天剩余时段）
    2026-11-05: 8 条
    2026-11-06: 8 条
    2026-11-07: 8 条
    2026-11-08: 8 条
    2026-11-09: 3 条   ← 不完整（第 5 天之后的零头）
```

满一天应是 8 条（24h ÷ 3h）。**首尾两个日期必然不完整**：首日只剩从当前时刻到当地午夜的时段，
尾日是窗口末端的零头。所以虽然分出 6 个日期，真正完整的只有中间 4 天。

本项目用到的是第 4、5 天（上例的 11-07、11-08），都落在完整区间内。

### One Call 3.0 —— 当前账号无权限

```
GET /data/3.0/onecall → HTTP 401
```

该接口能提供 `uvi` 和每日 `moon_phase`，可以填补下面列出的缺口，但需要单独订阅。

## 二、字段可得性对照

`IWeatherRec` 共 18 个字段，两个源各自能提供的情况：

| 字段 | WeatherAPI（3 天） | OpenWeatherMap（5 天） | 说明 |
|------|-------------------|----------------------|------|
| `location` | `location.name` | `city.name` | 都有 |
| `date` | `forecastday[].date` | 由 `dt` + `city.timezone` 算出 | 都有 |
| `dayOfWeek` | 由日期计算 | 由日期计算 | 都有 |
| `weatherCode` | `day.condition.code` | `weather[].icon` 前两位 | 都有，但编码体系不同，各有一张映射表 |
| `weatherDesc` | `condition.text` | `weather[].description` | 都有 |
| `temp` | `current.temp_c`（仅当天） | `main.temp` | WeatherAPI 的逐日段没有「当前温度」概念 |
| `tempBodyFeel` | `current.feelslike_c`（仅当天） | `main.feels_like` | 同上 |
| `tempMin` / `tempMax` | `day.mintemp_c` / `maxtemp_c` | 各时段 `temp_min`/`temp_max` 取极值 | 都有 |
| `atmPressure` | `current.pressure_mb`（仅当天）<br>或 `hour[].pressure_mb` | `main.pressure` | 都有 |
| `windSpeed` | `day.maxwind_kph` | 各时段 `wind.speed` 取最大 | 都有，**单位不同**（见下） |
| `windDir` | `hour[10].wind_dir`（字符串方位） | `wind.deg`（角度，需换算） | 都有 |
| `humedPct` | `day.avghumidity` | `main.humidity` | 都有 |
| `preciPct` | `day.daily_chance_of_rain` / `_of_snow` 取大 | 各时段 `pop` 取最大 ×100 | 都有 |
| `uv` | `day.uv` ✅ | ❌ **不提供** | 第 4、5 天为 0 |
| `moonPhase` | `astro.moon_phase` ✅ | ❌ **不提供** | 第 4、5 天为空字符串 |
| `sunrise` / `sunset` | `astro.sunrise` / `sunset` ✅ | ⚠️ 只有 `city.sunrise/sunset`（当天一组） | 第 4、5 天为空字符串 |

### 确定缺失的三项

第 4、5 天（来自 OpenWeatherMap）**必然没有**以下数据：

| 字段 | 当前取值 | 原因 |
|------|---------|------|
| `uv` | `0` | OWM forecast5 响应里没有任何紫外线字段 |
| `moonPhase` | `''` | OWM forecast5 不含月相；月相数据在 One Call 3.0 里（需订阅） |
| `sunrise` / `sunset` | `''` | OWM 只在 `city` 级给一组当天的日出日落，不按天提供 |

想补齐这三项需要订阅 OpenWeatherMap One Call 3.0，或把 WeatherAPI 升级到付费档
（付费档支持最多 14 天，届时就不需要第二个数据源了）。

## 三、实测注意事项

### 单位不一致

- WeatherAPI 的风速是 **km/h**（`maxwind_kph`）
- OpenWeatherMap 在 `units=metric` 下风速是 **m/s**（`wind.speed`）

所以第 1-3 天和第 4、5 天的 `windSpeed` 量纲不同，数值不可直接比较。
实测样例：11-06 为 `14.4`（km/h），11-07 为 `5.34`（m/s，约 19.2 km/h）。
**这是已知的历史口径问题，旧系统也是如此**，本次迁移未改动，以免影响前端显示。

### 时区

OpenWeatherMap 的 `dt_txt` 是 **UTC 时间**，而 `city.timezone` 给出该城市的秒偏移（上海为 28800 = UTC+8）。
旧实现直接截取 `dt_txt` 的日期部分分组，对上海来说一个「UTC 日」实际跨了当地 08:00 到次日 08:00，
分出来的「日」是错位的。本次迁移改为用 `dt + timezone` 换算到当地时间后再分组。

### WeatherAPI 的小时级数据

WeatherAPI 每天返回 24 条 `hour[]` 记录，含 `wind_dir`、`wind_degree`、`pressure_mb`、`uv` 等。
逐日的 `day` 段**没有风向**，所以代码取 `hour[10]`（当地 10:00）的风向代表当天。
这意味着 WeatherAPI 的 3 天数据是自足的，不需要 OpenWeatherMap 补风向。

### 天气码映射表的覆盖情况

本次实测中 OpenWeatherMap 返回的 icon 前缀为 `01`、`03`、`04`、`10`，
全部命中 `openweathermap.ts` 里的 `weatherCode3rdMap`。该表共覆盖 9 种前缀
（`01` `02` `03` `04` `09` `10` `11` `13` `50`），是 OWM 的完整 icon 集合。
未命中时会打 `⚠️` 日志并退回「局部多云」。

WeatherAPI 实测返回的 `condition.code` 有 `1183`（Light rain）、`1036`（Smoky haze）、`1009`（Overcast）。

## 四、接口行为

`GET /api/weather/forecast` 的参数与降级行为：

| 参数 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `appKey1` | ✅ | — | WeatherAPI.com 的 key，缺失返回 400 |
| `appKey2` | ❌ | — | OpenWeatherMap 的 key，缺失时降级 |
| `cityName` | ❌ | `Shanghai` | 传给 WeatherAPI |
| `lat` / `lon` | ❌ | `31.18` / `121.43` | 传给 OpenWeatherMap |
| `days` | ❌ | `5` | 传给 WeatherAPI，但免费账号封顶 3 天 |
| `outFormat` | ❌ | `conky` | `conky` 输出文本，`json` 输出结构化数据 |

**降级行为**：不传 `appKey2` 时仍返回 200 和 5 条记录，但第 4、5 天是占位值
（`weatherCode=1000000`、温度 0），同时 `msg` 字段会说明原因：

```
"未提供 appKey2，第 4、5 天数据不可用（WeatherAPI 免费账号只给 3 天）"
```

OpenWeatherMap 请求失败时同理，`msg` 为 `"OpenWeatherMap 取数失败，第 4、5 天数据不可用"`。

> 这与旧实现不同：旧版要求两个 key 都有效，缺一个直接返回 400。
> 改为降级是因为「有 3 天数据」比「什么都没有」更有用，且 `msg` 明确告知了缺失原因。

## 五、缓存

| 数据源 | 缓存时长 | 位置 |
|--------|---------|------|
| WeatherAPI | 60 分钟 | `weatherapi.ts` 的 `lastCache` |
| OpenWeatherMap | 60 分钟 | `openweathermap.ts` 的 `lastCache` |

两者都是**进程内存缓存**，重启即失效，且不区分请求参数——
换城市请求会拿到上一个城市的缓存结果。这是旧实现的既有行为，本次未改动。

⚠️ 注意 `weather.ts` 里合并 OpenWeatherMap 数据前**必须拷贝** `forecastDays`。
直接改写会污染 WeatherAPI 的缓存对象，导致后续不传 `appKey2` 的请求也看到上次合并进去的数据。
这个坑在本次迁移中踩过并已修复。

## 六、复现方法

```bash
# WeatherAPI：验证天数上限
curl "https://api.weatherapi.com/v1/forecast.json?key=<APPKEY1>&q=Shanghai&days=10&aqi=no&alerts=no" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d['forecast']['forecastday']))"

# OpenWeatherMap：验证切片数与字段
curl "https://api.openweathermap.org/data/2.5/forecast?lat=31.18&lon=121.43&units=metric&appid=<APPKEY2>" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['cnt'], list(d['list'][0].keys()))"
```

key 不要写进任何会提交的文件，走请求参数传入。
