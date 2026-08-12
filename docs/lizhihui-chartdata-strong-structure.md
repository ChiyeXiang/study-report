# 荔智惠对接：三类报告 chartData 强结构说明

版本：2026-08-12

本文档只说明报告内容中的 `reportData.chartData` 字段。  
从本版本开始，三类报告的 `chartData` 统一返回强结构，荔智惠前端可以按固定结构渲染图表，不再需要兼容同一字段的多种数据形态。

## 1. 通用结构

三类报告的 `chartData` 均固定为：

```json
{
  "version": "1.0",
  "scores": [
    {
      "key": "academics",
      "label": "学术基础",
      "value": 72,
      "max": 100
    }
  ],
  "timeline": [
    {
      "phase": "阶段 1",
      "period": "0-3 个月",
      "title": "建立基础档案",
      "items": ["完成材料整理", "明确目标方向"]
    }
  ],
  "trends": [
    {
      "key": "growth",
      "label": "成长趋势",
      "points": [
        { "label": "2026", "value": 64 },
        { "label": "2027", "value": 82 }
      ]
    }
  ]
}
```

## 2. 字段说明

| 字段 | 类型 | 是否必返 | 说明 |
| --- | --- | --- | --- |
| `version` | string | 是 | 当前固定为 `1.0` |
| `scores` | array | 是 | 固定评分项数组，三类报告各自有固定 key |
| `scores[].key` | string | 是 | 评分项英文 key，用于前端识别 |
| `scores[].label` | string | 是 | 评分项中文名称，可直接展示 |
| `scores[].value` | number | 是 | 评分值，范围 0-100 |
| `scores[].max` | number | 是 | 当前固定为 100 |
| `timeline` | array | 是 | 时间轴数组；没有时间轴时返回空数组 `[]` |
| `timeline[].phase` | string | 是 | 阶段名称 |
| `timeline[].period` | string | 是 | 时间范围 |
| `timeline[].title` | string | 是 | 阶段标题 |
| `timeline[].items` | array | 是 | 阶段行动项；没有时返回空数组 `[]` |
| `trends` | array | 是 | 趋势图数组；没有趋势图时返回空数组 `[]` |
| `trends[].key` | string | 是 | 趋势图英文 key |
| `trends[].label` | string | 是 | 趋势图中文名称 |
| `trends[].points` | array | 是 | 趋势点数组 |
| `trends[].points[].label` | string | 是 | 横轴标签，如年份、季度、阶段 |
| `trends[].points[].value` | number | 是 | 趋势值，范围 0-100 |

## 3. 报告一：全球留学竞争力评估报告

`scores` 固定返回 6 项：

| key | 中文 label |
| --- | --- |
| `academics` | 学术基础 |
| `testScores` | 语言/标化竞争力 |
| `majorFit` | 专业匹配度 |
| `backgroundDepth` | 背景完整度 |
| `highVisibility` | 高辨识度成果 |
| `narrativeMaturity` | 申请叙事成熟度 |

示例：

```json
{
  "version": "1.0",
  "scores": [
    { "key": "academics", "label": "学术基础", "value": 72, "max": 100 },
    { "key": "testScores", "label": "语言/标化竞争力", "value": 65, "max": 100 },
    { "key": "majorFit", "label": "专业匹配度", "value": 68, "max": 100 },
    { "key": "backgroundDepth", "label": "背景完整度", "value": 60, "max": 100 },
    { "key": "highVisibility", "label": "高辨识度成果", "value": 75, "max": 100 },
    { "key": "narrativeMaturity", "label": "申请叙事成熟度", "value": 58, "max": 100 }
  ],
  "timeline": [],
  "trends": []
}
```

## 4. 报告二：NextGen 家族教育战略智能报告

`scores` 固定返回 5 项：

| key | 中文 label |
| --- | --- |
| `experienceDepth` | 经历深度 |
| `familyAlignment` | 家庭目标一致性 |
| `directionClarity` | 方向清晰度 |
| `internationalFit` | 国际化适配度 |
| `academicPotential` | 学术潜力 |

示例：

```json
{
  "version": "1.0",
  "scores": [
    { "key": "experienceDepth", "label": "经历深度", "value": 66, "max": 100 },
    { "key": "familyAlignment", "label": "家庭目标一致性", "value": 72, "max": 100 },
    { "key": "directionClarity", "label": "方向清晰度", "value": 64, "max": 100 },
    { "key": "internationalFit", "label": "国际化适配度", "value": 70, "max": 100 },
    { "key": "academicPotential", "label": "学术潜力", "value": 68, "max": 100 }
  ],
  "timeline": [
    {
      "phase": "阶段 1",
      "period": "0-3 个月",
      "title": "建立家庭教育目标共识",
      "items": ["明确孩子当前优势与短板", "统一家庭投入边界", "确定下一阶段教育路径"]
    }
  ],
  "trends": []
}
```

## 5. 报告三：Life-Career Strategy 人生生涯全规划报告

`scores` 固定返回 6 项：

| key | 中文 label |
| --- | --- |
| `technical_depth` | 技术深度 |
| `project_delivery` | 项目交付能力 |
| `industry_knowledge` | 行业认知 |
| `communication_clarity` | 沟通表达清晰度 |
| `practical_application` | 实践应用能力 |
| `career_direction_clarity` | 职业方向清晰度 |

示例：

```json
{
  "version": "1.0",
  "scores": [
    { "key": "technical_depth", "label": "技术深度", "value": 65, "max": 100 },
    { "key": "project_delivery", "label": "项目交付能力", "value": 58, "max": 100 },
    { "key": "industry_knowledge", "label": "行业认知", "value": 62, "max": 100 },
    { "key": "communication_clarity", "label": "沟通表达清晰度", "value": 70, "max": 100 },
    { "key": "practical_application", "label": "实践应用能力", "value": 60, "max": 100 },
    { "key": "career_direction_clarity", "label": "职业方向清晰度", "value": 74, "max": 100 }
  ],
  "timeline": [
    {
      "phase": "阶段 1",
      "period": "0-6 个月",
      "title": "能力基线补强",
      "items": ["补齐核心技能", "完成可展示项目", "建立求职作品集"]
    }
  ],
  "trends": [
    {
      "key": "careerGrowth",
      "label": "职业成长趋势",
      "points": [
        { "label": "2026", "value": 64 },
        { "label": "2027", "value": 82 }
      ]
    }
  ]
}
```

## 6. 前端渲染建议

1. 分项评分图：直接遍历 `chartData.scores`。
2. 雷达图：使用 `scores[].label` 作为维度名，`scores[].value` 作为数值。
3. 时间轴：如果 `timeline.length > 0` 则展示，否则隐藏该模块。
4. 趋势图：如果 `trends.length > 0` 且 `trends[].points.length > 0` 则展示，否则隐藏该模块。
5. 不需要再兼容 `chartData.scores` 为 object、array、字符串混合结构的情况；本版本后统一为 `scores` 数组。

