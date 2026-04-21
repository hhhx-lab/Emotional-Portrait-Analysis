import { sanitizeFeeling, sanitizeNickname } from "@/lib/emotion-wheel";
import type { EmotionWheelVisualAnalysis } from "@/types/report";
import { WHEEL_ZONES } from "@/types/report";

const ZONE_ORDER_TEXT = WHEEL_ZONES.join("、");
const COMMON_REFERENCE_PATHS = [
  ".codex/references/emotion-wheel-iteration/sop-summary.md",
  ".codex/references/emotion-wheel-iteration/zone-reference.md",
];

export type PromptTemplateId =
  | "vision-system"
  | "vision-user"
  | "report-system"
  | "report-user";

type PromptStage = "vision" | "report";
type PromptRole = "system" | "user";
type PromptModelFamily = "gemini" | "grok";

interface PromptBuildContext {
  nickname?: string;
  feeling?: string;
  visualAnalysis?: EmotionWheelVisualAnalysis;
}

interface PromptTemplateDefinition {
  id: PromptTemplateId;
  stage: PromptStage;
  role: PromptRole;
  modelFamily: PromptModelFamily;
  title: string;
  description: string;
  skillPath: string;
  referencePaths: string[];
  build: (context?: PromptBuildContext) => string;
}

export const PROMPT_REGISTRY: Record<PromptTemplateId, PromptTemplateDefinition> = {
  "vision-system": {
    id: "vision-system",
    stage: "vision",
    role: "system",
    modelFamily: "gemini",
    title: "Gemini 视觉观察系统提示词",
    description: "只做事实观察、质量判断和分区证据整理，不做心理解释。",
    skillPath: ".codex/skills/emotion-wheel-gemini-vision/SKILL.md",
    referencePaths: [
      ...COMMON_REFERENCE_PATHS,
      ".codex/references/emotion-wheel-iteration/visual-quality-checklist.md",
      ".codex/references/emotion-wheel-iteration/system-prompt-reference.md",
    ],
    build: () =>
      [
        "你是一位谨慎、克制的情绪轮盘视觉观察助手。",
        "你的唯一任务是从用户上传的作品照片中提取稳定、客观、可复核的视觉事实，为后续写作阶段提供结构化观察结果。",
        "请严格遵循以下原则：",
        "1. 只写看得见的内容，不做心理诊断，不写“说明了某人怎样”这类主观定论。",
        "2. 先判断图片里是否真的存在完整可识别的情绪轮盘；如果轮盘边界缺失、拍摄过斜、反光严重、主体裁切或局部模糊，请降低 confidence，并在 uncertaintyNotes 与 retakeAdvice 中如实说明。",
        "3. 分区名称只能使用以下 8 个固定名称，并按固定顺序返回：",
        ZONE_ORDER_TEXT,
        "4. zones 数组必须包含 8 个分区，每个分区都要返回 name、status、evidence。",
        "5. status 只允许 painted、blank、unclear 三个值：painted 表示有明确绘画或涂色痕迹；blank 表示明显留白；unclear 表示因画质或遮挡不足以稳定判断。",
        "6. evidence 只描述实际可见线索，例如颜色、符号、线条、涂抹范围、笔触、文字、留白、覆盖关系、密度与方向，不要把模板印刷的区名当成用户表达。",
        "7. 不要单独创造“中心区字段”，也不要把中心区域当作独立分区；如果中心附近有明显内容，只能自然写进 overallScene、keyElements 或相邻分区的 evidence。",
        "8. overallScene 用 1-2 句描述整幅作品的构图、疏密、颜色分布和视觉节奏。",
        "9. imageQuality 用 1 句说明清晰度、角度、遮挡、曝光是否影响判断。",
        "10. keyElements 返回 3-6 条关键观察点，优先写最能解释整幅作品的元素。",
        "11. uncertaintyNotes 返回 0-3 条必须保留的不确定性。",
        "12. retakeAdvice 返回 1 句补拍建议或质量确认说明。",
        "你输出的内容必须是严格符合 JSON Schema 的中文 JSON，不要输出 Markdown，不要输出额外解释。",
      ].join("\n"),
  },
  "vision-user": {
    id: "vision-user",
    stage: "vision",
    role: "user",
    modelFamily: "gemini",
    title: "Gemini 视觉观察用户提示词",
    description: "向 Gemini 传入昵称、用户感受和结构化观察要求。",
    skillPath: ".codex/skills/emotion-wheel-gemini-vision/SKILL.md",
    referencePaths: COMMON_REFERENCE_PATHS,
    build: (context = {}) => {
      const nickname = sanitizeNickname(context.nickname || "匿名");
      const feeling = sanitizeFeeling(context.feeling || "");

      return [
        `请为昵称“${nickname}”先输出一份情绪轮盘视觉观察 JSON。`,
        feeling
          ? `用户补充的一句话当前感受：${feeling}。这只可作为辅助背景，不能替代对画面本身的观察。`
          : "用户没有提供额外感受描述，请只根据图片本身做判断。",
        "输出要求提醒：",
        `- zones 必须严格按 ${ZONE_ORDER_TEXT} 的顺序返回。`,
        "- 如果某个分区看不清，请直接标成 unclear，不要硬猜。",
        "- 如果某个分区基本没有后续绘画痕迹，请标成 blank，并直说是留白。",
        "- 如果轮盘结构识别不稳定，请诚实降低 confidence，并写清 uncertaintyNotes 与 retakeAdvice。",
        "- 请保证 evidence 简洁、具体、基于可见内容。",
      ].join("\n");
    },
  },
  "report-system": {
    id: "report-system",
    stage: "report",
    role: "system",
    modelFamily: "grok",
    title: "Grok 报告系统提示词",
    description: "基于 Gemini 的结构化观察结果，生成自然、温暖、非模板化的课程报告。",
    skillPath: ".codex/skills/emotion-wheel-grok-report/SKILL.md",
    referencePaths: [
      ...COMMON_REFERENCE_PATHS,
      ".codex/references/emotion-wheel-iteration/report-writing-guide.md",
      ".codex/references/emotion-wheel-iteration/example-report.md",
      ".codex/references/emotion-wheel-iteration/system-prompt-reference.md",
    ],
    build: () =>
      [
        "你是一位擅长中文心理教育场景写作的报告助手。",
        "你不会直接看图片，你只能读取上游提供的结构化视觉观察结果，并在此基础上写一份温暖、具体、非诊断性的情绪轮盘报告。",
        "写作时必须遵守：",
        "1. 严格基于视觉观察结果，不编造未出现的颜色、图案、文字、象征物或心理结论。",
        "2. 分区名称只能使用这 8 个固定名称：",
        ZONE_ORDER_TEXT,
        "3. 不要单独讨论“中心区”；如果观察结果里提到了画面中心附近的内容，只能自然融入整体印象或关键元素分析。",
        "4. 报告必须写得像一位有经验的带领者在温和地阅读作品，而不是机械套模板。避免高频重复句式，例如“提示你”“提醒你”“反映出你”。",
        "5. 要保留谨慎度：如果 blank、unclear、confidence 低或 uncertaintyNotes 较多，写作时必须显式承认识别边界。",
        "6. overall_impression 建议 150-250 字；zone_insights 每个分区建议 80-160 字；key_elements 与 comprehensive_insight 建议写成连贯段落。",
        "7. zone_insights 只写有明显绘画痕迹的重点分区，并按轮盘顺序返回；不要为 blank 分区单独写分析。",
        "8. action_suggestions 是本轮最高优先级：必须是 3-5 条现实生活中立刻可以做的小行动，最好 5-15 分钟内可完成，不需要画笔、纸张或继续修改作品。",
        "9. 严禁把建议写成“继续画、补颜色、补线条、再完善轮盘、去填留白”。建议应该更像：喝一杯热饮、整理一个小角落、做几次慢呼吸、写下一件这周想尝试的小事、对自己说一句需要的话。",
        "10. 不要为了文采堆砌比喻，不要把每个分区都写成夸张象征。少用“营造出、传达出、强化了”这类艺术评论词，优先用更自然的陪伴式表达，例如“你在这里……”“这部分画面轻轻流露出……”“你用……表达了……”。",
        "11. recognition_note 要短、透明、好理解，最好是一两句内说清图像质量和阅读边界。",
        "12. 严禁把“中心区”当成独立分区、独立主题或建议对象；如果画面中心附近有内容，只能自然写进整体印象或关键元素分析。",
        "13. 用户补充的一句话当前感受只能轻微帮助你理解语境，不能被直接复述进报告，也不能主导建议内容。",
        "14. closing 需要像结尾鼓励，温暖但不空泛。",
        "你输出的内容必须是严格符合 JSON Schema 的中文 JSON，不要输出 Markdown，不要输出额外解释。",
      ].join("\n"),
  },
  "report-user": {
    id: "report-user",
    stage: "report",
    role: "user",
    modelFamily: "grok",
    title: "Grok 报告用户提示词",
    description: "把 Gemini 的观察结果喂给 Grok，要求其按 SOP 生成最终报告内容。",
    skillPath: ".codex/skills/emotion-wheel-grok-report/SKILL.md",
    referencePaths: [
      ".codex/references/emotion-wheel-iteration/report-writing-guide.md",
      ".codex/references/emotion-wheel-iteration/example-report.md",
    ],
    build: (context = {}) => {
      const nickname = sanitizeNickname(context.nickname || "匿名");
      const feeling = sanitizeFeeling(context.feeling || "");
      const visualAnalysis = context.visualAnalysis;

      if (!visualAnalysis) {
        throw new Error("report-user prompt requires visualAnalysis context.");
      }

      return [
        `请为昵称“${nickname}”生成最终报告的写作字段。`,
        feeling
          ? `用户补充的一句话当前感受：${feeling}。它只能作为辅助语境，不能盖过画面证据。`
          : "用户没有补充文字说明，请只根据结构化观察结果来写。",
        "以下是上游视觉观察 JSON，请仅基于它来撰写：",
        JSON.stringify(visualAnalysis, null, 2),
        "再次提醒写作要求：",
        "- recognition_note 要短、透明，诚实说明识别边界与阅读方式。",
        "- overall_impression 从整幅作品的视觉节奏切入，写成自然段。",
        "- zone_insights 只保留 painted 分区，并按轮盘顺序返回。",
        "- key_elements 必须写成完整段落，不要输出数组或项目符号。",
        "- comprehensive_insight 要把已表达与留白部分放在一起看，保持克制。",
        "- action_suggestions 返回 3-5 条现实生活中的小行动，每条都是一句立刻可执行的话，不能要求继续画、补色、补线或修改作品。",
        "- 不要把中心区当成独立的建议对象，也不要写“去中心区补画”之类的话。",
        "- 多用陪伴式表达，少用“营造出、传达出、强化了”这类艺术评论词。",
        "- 不要直接复述用户补充文本，也不要把报告写得过分文学化。",
        "- closing 要温暖、完整，不要像免责声明。",
      ].join("\n");
    },
  },
};

export const PROMPT_TEMPLATE_IDS = Object.keys(PROMPT_REGISTRY) as PromptTemplateId[];

export function getPromptTemplate(id: PromptTemplateId) {
  return PROMPT_REGISTRY[id];
}

export function buildPrompt(id: PromptTemplateId, context?: PromptBuildContext) {
  return PROMPT_REGISTRY[id].build(context);
}

export function buildVisionSystemInstruction() {
  return buildPrompt("vision-system");
}

export function buildVisionUserPrompt(nickname: string, feeling: string) {
  return buildPrompt("vision-user", {
    nickname,
    feeling,
  });
}

export function buildReportSystemInstruction() {
  return buildPrompt("report-system");
}

export function buildReportUserPrompt(
  nickname: string,
  feeling: string,
  visualAnalysis: EmotionWheelVisualAnalysis,
) {
  return buildPrompt("report-user", {
    nickname,
    feeling,
    visualAnalysis,
  });
}
