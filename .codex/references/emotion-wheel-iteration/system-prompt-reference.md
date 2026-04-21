# 运行时 Prompt 设计参考

本文件把迭代文档中的 prompt 设计意图转成更适合工程维护的检查表。

## Gemini Prompt 必须覆盖

- 明确自己是“视觉观察助手”
- 强调只写事实，不做心理解释
- 强调 8 个固定分区和固定顺序
- 强调 `painted / blank / unclear`
- 强调不再有独立中心区字段
- 强调模板文字不算用户表达
- 强调输出必须符合 JSON Schema

## Grok Prompt 必须覆盖

- 明确自己不能直接看图
- 明确只能消费 Gemini JSON
- 明确最终报告的字段顺序和段落要求
- 明确只写 painted 分区的 `zone_insights`
- 明确 `key_elements` 是段落，不是数组
- 明确建议部分以行动为导向
- 明确禁止诊断和模板化重复句

## 服务端职责

以下字段不应交给模型自由生成：

- `header.title`
- `header.generate_time`
- `header.nickname`
- `header.identified_zones`
- `header.blank_zones`
- `header.caution`
- `disclaimer`

## 兼容性要求

- 如果模型返回旧分区名，服务端必须归一化。
- 如果 `zone_insights` 为空，但 Gemini 明确标记了 painted 分区，服务端必须构造最小合规 fallback。
- 如果建议条数不是 3-5 条，服务端要裁剪或补齐。
