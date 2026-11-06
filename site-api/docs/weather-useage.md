# 天气预报接口测试指南

本文给出 `GET /api/weather/forecast` 的 curl 调用示例。所有命令都已实测通过（2026-11-04）。

接口实现在 [Jade-Dungeon-api/src/main/ts/routes/weather.ts](../src/main/ts/routes/weather.ts)。
两个数据源各自能提供什么、哪些字段确定拿不到，见
[weather-data-sources.md](weather-data-sources.md)。

## 准备

### 1. 取出 API key

接口需要两个第三方供应商的 key。**key 不在本仓库里**——
它们原先记在旧项目的 `Jade-TRPG-api/local-notes.md`（已 gitignore），
本项目独立成仓后需要另行保管（那份笔记里还有账号明文密码，不要提交进任何仓库）。

对应关系：`appKey1` 是 weatherapi.com 的 key（**30 位**十六进制），
`appKey2` 是 openweathermap 的（**32 位**）。两者交换使用都会返回 401。

**不要把 key 直接写在命令行里**——那会进入 shell 历史。先读进环境变量：

```bash
cd <本项目根目录>

# 从你保管 key 的文件里读取；30 位的是 weatherapi，32 位的是 openweathermap
export WAPI_KEY=$(grep -oE '\b[a-f0-9]{30}\b' <你的key文件> | head -1)
export OWM_KEY=$(grep -oE '\b[a-f0-9]{32}\b' <你的key文件> | head -1)

export BASE=http://localhost:8089/api/weather/forecast
```

### 2. 启动服务

```bash
nvm use                                  # 切到 v22.22.2，每个新 shell 都要
npm run dev                              # 开发模式，tsx 直跑源码
# 或
npm run build && npm run start           # 跑编译产物
```

dev 端口是 **8089**（由 `config.properties` 指定）。

## 参数说明

| 参数 | 必需 | 默认值 | 作用 |
|------|------|--------|------|
| `appKey1` | ✅ | — | weatherapi.com 的 key，缺失返回 400 |
| `appKey2` | ❌ | — | openweathermap 的 key，用于补齐第 4、5 天；缺失则降级 |
| `outFormat` | ❌ | `conky` | `conky` 返回纯文本，`json` 返回结构化数据 |
| `cityName` | ❌ | `Shanghai` | 传给 weatherapi.com |
| `lat` / `lon` | ❌ | `31.18` / `121.43` | 传给 openweathermap |
| `days` | ❌ | `5` | 传给 weatherapi.com，但免费账号封顶 3 天，传更大的值无效 |

接口只绑定了 GET，POST 会返回 404。

## 示例

### ① conky 文本格式（默认）

```bash
curl "${BASE}?appKey1=${WAPI_KEY}&appKey2=${OWM_KEY}"
```

返回 25 行纯文本，供 conky 桌面组件渲染。不传 `outFormat` 就是这个格式。

### ② JSON 结构化输出

```bash
curl -s "${BASE}?outFormat=json&appKey1=${WAPI_KEY}&appKey2=${OWM_KEY}" | python3 -m json.tool
```

只看关键字段：

```bash
curl -s "${BASE}?outFormat=json&appKey1=${WAPI_KEY}&appKey2=${OWM_KEY}" \
  | python3 -c "
import json,sys
r = json.load(sys.stdin)
print('status:', r['status'], '| msg:', repr(r['msg']))
for d in r['forecastDays']:
    print(f\"  {d['date']}  {d['tempMin']}~{d['tempMax']}C  {d['windDir']} {d['windSpeed']}  uv={d['uv']}  moon={d['moonPhase']!r}\")
"
```

实测输出：

```
status: success | msg: ''
  2026-11-04  17~19.1C  WSW 10.4  uv=0.4  moon='Waning Crescent'
  2026-11-05  15.6~20.1C  WNW 21.2  uv=2.6  moon='Waning Crescent'
  2026-11-06  14.3~20C  NNW 14.4  uv=1  moon='Waning Crescent'
  2026-11-07  15.01~18.26C  ENE 5.34  uv=0  moon=''
  2026-11-08  13.99~15.54C  ENE 3.95  uv=0  moon=''
```

前 3 天来自 weatherapi.com，后 2 天来自 openweathermap。
**后两天的 `uv` 为 0、`moonPhase` 为空是正常的**——openweathermap 不提供这两项，不是 bug。

另外两边的风速单位不同：前 3 天是 km/h，后 2 天是 m/s。这是历史口径问题，迁移时未改动。

### ③ 验证降级行为（只给 appKey1）

```bash
curl -s "${BASE}?outFormat=json&appKey1=${WAPI_KEY}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['msg'])"
```

输出：

```
未提供 appKey2，第 4、5 天数据不可用（WeatherAPI 免费账号只给 3 天）
```

此时仍返回 200 和 5 条记录，但第 4、5 天是占位值（`weatherCode=1000000`、温度 0）。

### ④ 换城市

`cityName` 给 weatherapi.com、`lat`/`lon` 给 openweathermap，**两个都要改**：

```bash
curl -s "${BASE}?outFormat=json&cityName=Beijing&lat=39.90&lon=116.40&appKey1=${WAPI_KEY}&appKey2=${OWM_KEY}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['forecastDays'][0]['location'])"
```

> ⚠️ **换城市必须重启服务。**
> 两个数据源各有 60 分钟进程内缓存，且**不按请求参数区分**。
> 实测：新进程首个请求北京 → 正确返回 `Beijing, China`；
> 同进程紧接着请求上海 → 仍返回 `Beijing, China`。
> 这是旧系统就有的行为，本次迁移未改动。

### ⑤ 错误场景

```bash
curl -s -o /dev/null -w "%{http_code}\n" "${BASE}"                              # 400，缺 appKey1
curl -s -o /dev/null -w "%{http_code}\n" -X POST "${BASE}?appKey1=${WAPI_KEY}"  # 404，只绑了 GET
```

### ⑥ 直接验证上游供应商

排查「是接口的问题还是数据源的问题」时用：

```bash
# weatherapi.com：确认免费账号只给 3 天（请求 10 天也只返回 3）
curl -s "https://api.weatherapi.com/v1/forecast.json?key=${WAPI_KEY}&q=Shanghai&days=10" \
  | python3 -c "import json,sys; print('实际天数:', len(json.load(sys.stdin)['forecast']['forecastday']))"

# openweathermap：确认返回 40 条 3 小时切片（覆盖 5 天）
curl -s "https://api.openweathermap.org/data/2.5/forecast?lat=31.18&lon=121.43&units=metric&appid=${OWM_KEY}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('cnt:', d['cnt'])"
```

## 已知问题

### `outFormat=json` 的响应头不对

返回体确实是 JSON，但 `Content-Type` 仍是 `text/plan`——
[weather.ts:31](../src/main/ts/routes/weather.ts#L31) 的成功分支硬编码了这个值，
代码里算出来的 `cType` 变量只在错误分支用上了。

用 curl 不受影响，但浏览器直接访问会当纯文本显示。
（顺带一提 `text/plan` 本身也是 `text/plain` 的拼写错误，旧系统就有。）

## 排查：端口被占

测完如果服务没退干净，下次请求会打到旧进程上——它可能缓存着上一次的城市数据，
看起来像是参数没生效。

```bash
ss -tlnp | grep 8089              # 查看端口占用
pkill -f "node dist/index.js"     # 清理 npm run start 留下的进程
```
