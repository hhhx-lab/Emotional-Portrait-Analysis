---
name: emotion-wheel-gemini-vision
description: Use when Gemini needs to read a standard emotion-wheel drawing and produce a strict observation JSON. This skill is for image understanding, quality checks, fixed zone ordering, and evidence-first extraction only.
---

# Emotion Wheel Gemini Vision

## Overview

Use this skill whenever the task is to interpret an emotion-wheel image before report writing. It is specifically for the **Gemini observation stage** of this project, where the model must extract visible facts and quality signals without drifting into psychological explanation.

## When To Use

Use this skill when:

- a user uploads or references a standard emotion-wheel photo
- you are writing or revising the Gemini system/user prompts
- you are validating the Gemini JSON contract
- you need to debug why certain zones are being over-interpreted or mislabeled

Do not use this skill to write the final warm narrative report. That belongs to [$emotion-wheel-grok-report](../emotion-wheel-grok-report/SKILL.md).

## Required References

Read these references before editing prompts or judging Gemini output:

- [SOP 摘要](../../references/emotion-wheel-iteration/sop-summary.md)
- [固定分区参考](../../references/emotion-wheel-iteration/zone-reference.md)
- [视觉质量检查标准](../../references/emotion-wheel-iteration/visual-quality-checklist.md)
- [Prompt 设计参考](../../references/emotion-wheel-iteration/system-prompt-reference.md)

## Workflow

### 1. 先确认图像是否属于标准轮盘场景

检查：

- 是否完整拍到轮盘边界
- 是否存在明显裁切、反光、阴影、严重倾斜
- 是否能区分模板底图与用户后续绘画内容

如果不满足，降低 `confidence`，必要时让 `wheelDetected=false`。

### 2. 只提取可见事实

Gemini 输出里必须优先写：

- 颜色出现在哪里
- 哪些分区有明显涂色、图案、线条、文字、覆盖痕迹
- 哪些分区基本留白
- 哪些地方由于画质问题看不清

禁止把这些事实直接翻译成确定心理判断。

### 3. 固定分区顺序

`zones` 必须严格按以下顺序返回：

1. 愿望
2. 温暖
3. 希望
4. 恐惧
5. 杂乱
6. 激动
7. 期待
8. 注视

### 4. 严格使用三种状态

- `painted`
- `blank`
- `unclear`

不要发明第四种状态，不要把“轻微涂色”写成 blank。

### 5. 不要单独建中心区

迭代版本已经取消独立中心区字段。

如果中心附近有明显内容，只能：

- 写进 `overallScene`
- 放进 `keyElements`
- 或写进相邻分区的 `evidence`

## 输出检查清单

在 Gemini 输出 JSON 之前，逐项自检：

- 是否只用了固定 8 分区名称
- 是否没有使用旧名称“未知 / 忽视”
- 是否每个分区都有 `name + status + evidence`
- `evidence` 是否写成“看见了什么”
- 是否没有出现独立中心区字段
- 是否没有把模板印刷文字当成用户表达
- `keyElements` 是否控制在 3-6 条
- `uncertaintyNotes` 是否只保留真正必要的不确定性

## 成功标准

一份好的 Gemini 输出应该让 Grok 在**不看图**的情况下，也能知道：

- 哪些分区被明显表达了
- 哪些分区留白
- 哪些地方看不清
- 整幅作品的视觉节奏大致是什么样
