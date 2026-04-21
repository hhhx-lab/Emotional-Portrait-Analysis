---
name: emotion-wheel-grok-report
description: Use when Grok needs to turn Gemini's structured observation JSON into the final emotion-wheel report. This skill governs report structure, tone, paragraph lengths, and action-oriented suggestions.
---

# Emotion Wheel Grok Report

## Overview

Use this skill for the **final report writing stage** of the emotion-wheel project. The model should behave like an experienced, warm, non-diagnostic course facilitator who reads the picture through Gemini's observation results rather than directly through the image itself.

## When To Use

Use this skill when:

- you are writing or adjusting the Grok system/user prompts
- you need to improve report quality, warmth, or field-level structure
- you are debugging repetitive phrasing or unstable report sections
- you are validating whether final JSON matches the iteration document

Do not use this skill to inspect raw pictures. That belongs to [$emotion-wheel-gemini-vision](../emotion-wheel-gemini-vision/SKILL.md).

## Required References

Open these references before editing prompts or accepting report output:

- [SOP 摘要](../../references/emotion-wheel-iteration/sop-summary.md)
- [报告撰写规范](../../references/emotion-wheel-iteration/report-writing-guide.md)
- [优秀解读风格样例](../../references/emotion-wheel-iteration/example-report.md)
- [Prompt 设计参考](../../references/emotion-wheel-iteration/system-prompt-reference.md)

## Writing Workflow

### 1. 先读结构化观察结果

Grok 的输入必须来自 Gemini JSON，而不是原图。首先确认：

- 哪些分区是 `painted`
- 哪些分区是 `blank`
- 哪些分区是 `unclear`
- 整体画面的节奏、关键元素和不确定性是什么

### 2. 报告顺序固定

写作顺序必须保持：

1. `recognition_note`
2. `overall_impression`
3. `zone_insights`
4. `key_elements`
5. `comprehensive_insight`
6. `action_suggestions`
7. `closing`

`header` 与 `disclaimer` 不由 Grok 生成。

### 3. 只写重点分区

`zone_insights` 只保留 `painted` 分区，并按轮盘顺序返回。  
不要给 blank 分区单独写卡片式分析。

### 4. 写法要自然，不要模板化

避免：

- “提示你……”
- “提醒你……”
- “反映出你……”
- “说明你就是……”
- “营造出……”
- “传达出……”
- “强化了……”

更好的方式是：

- 先描述画面证据
- 再温和连接到可能的情绪体验
- 多用“你在这里……”“这部分画面轻轻流露出……”“你用……表达了……”
- 对不确定部分明确保留

### 5. 建议必须可执行

`action_suggestions` 不是总结句，而是下一步行动。

好的建议应该：

- 轻量
- 具体
- 可在课堂或个人练习中直接尝试
- 最好 5-15 分钟内就能开始
- 不需要继续画、补色、补线或修改轮盘

## 质量检查清单

在 Grok 输出 JSON 前，逐项确认：

- 是否只使用固定分区名
- 是否没有出现旧名称“未知 / 忽视”
- 是否没有单独讨论中心区
- `overall_impression` 是否像自然段而不是标签堆叠
- `key_elements` 是否是段落而不是数组
- `action_suggestions` 是否有 3-5 条
- `action_suggestions` 是否都是现实生活中的动作，而不是继续画画
- `closing` 是否温暖、完整、不空洞
- 是否明确保持非诊断语气

## 成功标准

一份好的 Grok 输出应该让用户感到：

- 被认真看见
- 报告有具体画面依据
- 语言自然，不像模板
- 结尾给出了继续表达和照顾自己的空间
