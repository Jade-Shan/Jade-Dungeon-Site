# 沙盘三级定位 id/name 命名：前后端统一约定

状态：📝 记录
记录/更新日期：2026-11-08

## 背景

`site-api` 正在把沙盘三级定位（campaign / place / scene）从「用户手填的文本」改成
「自增数字 id」，名字降级为显示名。三级各建一张表，Redis key 的三段全用数字 id。
完整实施计划见
[site-api/docs/refactor-campaignid-20261108.md](../site-api/docs/refactor-campaignid-20261108.md)。

## 命名约定（前后端统一）

三级定位统一「`XxxId`（数字，定位）+ `XxxName`（名字，显示）」：

| 层 | 数字 id（定位） | 名字（显示） |
|----|----------------|-------------|
| campaign | `campaignId` | `campaignName` |
| place | `placeId` | `placeName` |
| scene | `sceneId` | `sceneName` |

- 前端：`XxxId` 是数字 id（进 URL 参数、API 参数、内部 `scene.xxxId`），`XxxName`
  是名字（仅界面显示）。
- 后端：接口直接收数字 `XxxId`，不做名字翻译；表字段 `id`（主键）+
  `campaign_name` / `place_name` / `scene_name`（名字）。

## 当前阶段：过渡方案（开发辅助，不上生产）

本次落地的是**过渡方案**：`sandbox/index.html` 用 6 个输入框（三个数字 id + 三个
名字），全部由开发人员手填，后端直接收数字 id。数据必存在（开发人员手动造，
campaign → place → scene 顺序 INSERT），前端不处理「创建 / 不存在」。

**这不是终点。** 正式方案二（以后做）才是目标：

- 用户只输名字（不输数字 id），前端自动 `resolve-campaign` / `create-campaign` 拿 id；
- 接口参数从「传名字」改成「传数字 id」，显示变量用 `XxxName`；
- owner 语义从「首个 save-map」调整为「显式 create」。

## 需要记住的两点

1. 过渡方案里「创建战役/place/scene」不在前端接口里，靠手动 INSERT 或临时脚本；
   正式方案二会把它变成独立的 `create-*` 接口。
2. 唯一保留「名字」语义的对外历史参数是旧系统的 `campaignId`（曾等于名字）；
   本次过渡后，对外 `campaignId` / `placeId` / `sceneId` 已全部是数字 id，
   名字另走 `*Name` 参数。
