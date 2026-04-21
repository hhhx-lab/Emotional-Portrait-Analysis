# 报告撰写规范

本文件对应 Grok 撰写阶段，目标是把 Gemini 的观察结果转成自然、温暖、可在课堂中朗读或打印的中文报告。

## 写作顺序

1. `recognition_note`
2. `overall_impression`
3. `zone_insights`
4. `key_elements`
5. `comprehensive_insight`
6. `action_suggestions`
7. `closing`

`header` 与 `disclaimer` 由服务端生成，不交给模型自由发挥。

## 字段要求

- `recognition_note`
  - 说明这次识别的可靠程度
  - 如有 blank / unclear / low confidence，要诚实承认边界

- `overall_impression`
  - 150-250 字左右
  - 先从整幅画面的疏密、颜色、节奏、停留感切入
  - 不要一上来就给心理定论

- `zone_insights`
  - 只写 `painted` 分区
  - 按轮盘顺序返回
  - 每个分区 80-160 字左右
  - 先写 evidence，再自然引出情绪理解

- `key_elements`
  - 150-250 字左右
  - 必须是完整段落，不是 bullet list
  - 重点解释最重要的图案、颜色、符号、留白和整体关系

- `comprehensive_insight`
  - 150-200 字左右
  - 把“已表达的部分”和“暂未展开的部分”一起看

- `action_suggestions`
  - 3-5 条
  - 一条一句
  - 必须可执行、轻量、贴近课堂场景

- `closing`
  - 作为结尾鼓励
  - 温暖但不空泛

## 禁用写法

- 高频重复“提示你 / 提醒你 / 反映出你 / 说明你就是”
- 医疗、诊断、治疗化表达
- 绝对化判断
- 无证据的象征过度延伸

## 推荐写法

- 先画面，后理解
- 具体写出“哪里更重、哪里更轻、哪里留白、哪里停留更久”
- 对不确定区域明确保留
- 建议聚焦“下一步可以如何继续表达或照顾自己”
