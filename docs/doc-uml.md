# 为 ui-style-win98.plantuml 配置思源字体（粗体黑体 / 非粗体宋体）

## Context

刚在系统（Ubuntu 22.04）装好了思源字体（`fonts-noto-cjk`），其中：

- 思源黑体 = **Noto Sans CJK SC**（含 Regular / Bold 两个字重，Bold 已确认存在）
- 思源宋体 = **Noto Serif CJK SC**（含 Regular / Bold）

现在需要让时序图 [docs/uml/src/ui-style-win98.plantuml](../common-utils/docs/uml/src/ui-style-win98.plantuml) 的中文使用思源字体，并做字体分层：

- **粗体元素**（标题 title、participant/actor 名称、`== 分节 ==` divider）→ 思源黑体加粗字重 `Noto Sans CJK SC` + `bold`
- **非粗体元素**（消息文本、alt/else 分支标签）→ 思源宋体 `Noto Serif CJK SC`

## 修改方案

只改一个文件：`docs/uml/src/ui-style-win98.plantuml`。

在现有 `skinparam sequenceMessageAlign center` 这一行之后，追加以下字体 skinparam（PlantUML 1.2025.10 的 legacy skinparam 语法，仍受支持）：

```plantuml
skinparam defaultFontName "Noto Serif CJK SC"

skinparam sequenceTitleFontName "Noto Sans CJK SC"
skinparam sequenceTitleFontStyle bold

skinparam sequenceParticipantFontName "Noto Sans CJK SC"
skinparam sequenceParticipantFontStyle bold

skinparam sequenceActorFontName "Noto Sans CJK SC"
skinparam sequenceActorFontStyle bold

skinparam sequenceDividerFontName "Noto Sans CJK SC"
skinparam sequenceDividerFontStyle bold
```

映射关系：

| 元素 | 用到的 skinparam | 字体 |
|------|------------------|------|
| 默认 / 消息文本 / alt-else 标签 | `defaultFontName` | Noto Serif CJK SC（宋体，非粗体） |
| 图表标题 `title` | `sequenceTitleFont*` | Noto Sans CJK SC + bold |
| participant 名称（桌面/窗口/任务栏） | `sequenceParticipantFont*` | Noto Sans CJK SC + bold |
| actor 名称（用户） | `sequenceActorFont*` | Noto Sans CJK SC + bold |
| `== ① 创建窗口 ==` 分节 | `sequenceDividerFont*` | Noto Sans CJK SC + bold |

> 渲染为 SVG 时 `bold` 会输出 `font-weight: bold` 并命中 `Noto Sans CJK SC` 的 Bold 字重，符合「思源黑体简体的加粗字重」要求。

## 验证

1. 用仓库既有脚本渲染 SVG（输出目录 `docs/uml/out/`，md 里已引用该 svg）：

```bash
cd /home/ecs-user/workspace/node-dev/Jade-Javascript-utils
/opt/quickstart/plantuml-dir.sh -t svg -s ./docs/uml/src/ -o ./docs/uml/out/
```

2. 检查生成 SVG 中的字体引用，确认分层生效：

```bash
grep -o 'font-family="[^"]*"' docs/uml/out/ui-style-win98.svg | sort | uniq -c
```

预期结果：出现 `Noto Serif CJK SC`（消息文本等）和 `Noto Sans CJK SC`（title/participant/actor/divider，配合 `font-weight:bold`）。

3. 人工打开 SVG 确认中文无豆腐块、粗体/非粗体字体分层正确。

## 参考

- PlantUML 时序图字体 skinparam 命名：`sequenceTitle/Participant/Actor/Divider` + `FontName` / `FontStyle`（见 [PlantUML style evolution 文档](https://plantuml.com/ja-dark/style-evolution) 及 [PlantUML 语言参考](https://www.sugi-chiiki.com/uploadDocs/PlantUML_Language_Reference_Guide_JA.pdf)）。

