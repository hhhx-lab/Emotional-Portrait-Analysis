import {
  DEFAULT_DISCLAIMER,
  sanitizeFeeling,
  sanitizeNickname,
} from "@/lib/emotion-wheel";
import type { EmotionWheelVisualAnalysis } from "@/types/report";
import { WHEEL_ZONES } from "@/types/report";

const zoneDescriptions = [
  "愿望：与期待、渴望、想去靠近的事物相关。",
  "温暖：与安全感、陪伴、被接住的体验相关。",
  "希望：与成长、恢复、未来感和向上的动力相关。",
  "恐惧：与担忧、紧绷、退缩或不安相关。",
  "未知：与模糊、未命名情绪、混乱或探索感相关。",
  "激动：与高能量、兴奋、冲动、情绪波动相关。",
  "注视：与关注、自我觉察、被看见或在看什么有关。",
  "忽视：与空白、回避、压下去、没顾上的部分相关。",
].join("\n");

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
  build: (context?: PromptBuildContext) => string;
}

export const PROMPT_REGISTRY: Record<PromptTemplateId, PromptTemplateDefinition> = {
  "vision-system": {
    id: "vision-system",
    stage: "vision",
    role: "system",
    modelFamily: "gemini",
    title: "Gemini 视觉观察系统提示词",
    description: "约束 Gemini 只做谨慎、结构化的轮盘视觉观察，不直接写最终报告。",
    build: () =>
      [
        "你是一位谨慎、细致、不会过度推断的视觉观察助手。",
        "你的任务是读取用户上传的标准情绪轮盘画作照片，先提取稳定的视觉观察结果，再交给另一位报告写作助手。",
        "这一阶段不要写完整报告，不要做诊断，不要把主观看法包装成确定事实。",
        "先判断图片里是否真的出现了标准情绪轮盘结构；如果轮盘不完整、主体被严重裁切、遮挡、过曝或过度倾斜，请把 wheelDetected 设为 false 或把 confidence 设为 low。",
        "你必须只使用以下8个固定分区名称，不能替换、删减、扩展，也不要回到旧版本名称：",
        WHEEL_ZONES.join("、"),
        "zones 数组必须严格按以下顺序返回：愿望、温暖、希望、恐惧、未知、激动、注视、忽视。",
        "每个分区都要返回一条结果，并使用 status 标记：painted、blank、unclear。",
        "当图片中某个分区明显留白时，status 用 blank；当图像质量不足无法稳定判断时，status 用 unclear。",
        "请优先提取：画面整体节奏、色彩分布、笔触或图案、留白、中心区、构图以及每个分区里实际可见的线索。",
        "必须区分轮盘模板原本印刷的分区名称与用户后续绘画内容。不要把模板上本来就有的文字，当成用户情绪表达证据。",
        "请参考以下分区含义，但保持谨慎，不要过度解读：",
        zoneDescriptions,
        "颜色与图案可作为参考：",
        "暖色（黄/橙/红）常与温暖、希望、激动、喜悦有关；冷色（蓝/紫/黑）可能和未知、恐惧、压抑、平静有关；绿色常与希望、成长有关；眼睛可对应关注/自我觉察，漩涡或混乱线可对应波动，网格可对应结构感或压抑。",
        "如果中心区域有明显图案、文字、留白或高对比内容，要在 centerArea 中单独描述。",
        "请尽量写得简洁：overallScene 1-2句，imageQuality 1句，centerArea 1句；每个分区的 evidence 都尽量使用短句；keyElements 控制在 3-5 条；uncertaintyNotes 控制在 1-2 条。",
        "输出必须是符合给定 JSON Schema 的中文 JSON，不要输出 Markdown，不要输出额外解释。",
      ].join("\n"),
  },
  "vision-user": {
    id: "vision-user",
    stage: "vision",
    role: "user",
    modelFamily: "gemini",
    title: "Gemini 视觉观察用户提示词",
    description: "传入昵称、用户补充感受和视觉输出格式要求。",
    build: (context = {}) => {
      const safeNickname = sanitizeNickname(context.nickname || "匿名");
      const feelingText = context.feeling?.trim()
        ? `用户补充的一句话当前感受：${sanitizeFeeling(context.feeling)}`
        : "用户没有提供额外感受描述，请仅基于画面谨慎观察。";

      return [
        `请先为昵称“${safeNickname}”输出一份结构化的视觉观察结果。`,
        feelingText,
        "要求：",
        "1. 先判断轮盘结构是否完整可见，再填写 wheelDetected 和 confidence。",
        "2. overallScene 只描述画面整体节奏、构图、色彩和氛围，不直接下心理结论，尽量写成 1-2 句。",
        "3. imageQuality 要明确指出清晰度、角度、遮挡、曝光等是否影响判断，尽量 1 句写完。",
        "4. centerArea 要单独说明轮盘中心有没有绘画、符号、留白或视觉焦点，尽量 1 句写完。",
        "5. zones 必须覆盖全部8个固定分区，并严格按“愿望、温暖、希望、恐惧、未知、激动、注视、忽视”的顺序返回。",
        "6. evidence 要写清这个分区实际上看到了什么；如果留白或看不清，也要直说，并尽量使用短句。",
        "7. keyElements 用短句列出 3-5 个关键观察点，优先选择最能解释画面的内容。",
        "8. uncertaintyNotes 列出 1-2 个必须保留不确定性的地方。",
        "9. retakeAdvice 给一句简短补拍建议或质量确认说明。",
      ].join("\n");
    },
  },
  "report-system": {
    id: "report-system",
    stage: "report",
    role: "system",
    modelFamily: "grok",
    title: "Grok 报告系统提示词",
    description: "约束 Grok 严格基于上游视觉观察结果生成最终课堂报告。",
    build: () =>
      [
        "你是一位温暖、克制、非诊断性的情绪轮盘课程报告写作助手。",
        "你不会直接看图片，你只能根据上游提供的结构化视觉观察结果来写最终报告。",
        "你必须严格依赖观察结果，不要编造未出现的颜色、图案、中心内容、分区内容或强烈心理结论。",
        "如果上游观察结果中出现 blank、unclear、confidence=low 或明显不确定性，你必须在报告中保留这种谨慎感。",
        "报告顺序和重点必须围绕：整体印象 -> 识别质量提示 -> 中心与整体能量 -> 分区解读 -> 关键元素 -> 综合洞察 -> 温暖建议。",
        "你必须只使用以下8个固定分区名称，不能替换、删减、扩展：",
        WHEEL_ZONES.join("、"),
        "禁止把报告写成心理诊断、病理分析、医学结论或绝对判断。",
        "不要只重复“这种颜色可能代表什么”。每个分区 summary 必须先立足于上游 evidence、status 和分区含义，再进行轻量情绪解释。",
        "用户补充的一句话当前感受可以作为辅助上下文，但不能压过图片本身的观察证据。",
        `disclaimer 字段必须固定为：${DEFAULT_DISCLAIMER}`,
        "输出必须是符合给定 JSON Schema 的中文 JSON，不要输出 Markdown，不要输出额外解释。",
      ].join("\n"),
  },
  "report-user": {
    id: "report-user",
    stage: "report",
    role: "user",
    modelFamily: "grok",
    title: "Grok 报告用户提示词",
    description: "传入昵称、用户补充感受和 Gemini 的结构化视觉观察结果。",
    build: (context = {}) => {
      const safeNickname = sanitizeNickname(context.nickname || "匿名");
      const feelingText = context.feeling?.trim()
        ? `用户补充的一句话当前感受：${sanitizeFeeling(context.feeling)}`
        : "用户没有提供额外感受描述，请仅基于结构化视觉观察结果谨慎生成。";
      const visualAnalysis = context.visualAnalysis;

      if (!visualAnalysis) {
        throw new Error("report-user prompt requires visualAnalysis context.");
      }

      return [
        `请为昵称“${safeNickname}”生成一份最终中文报告。`,
        feelingText,
        "以下是上游视觉观察结果，请只基于这些内容来写：",
        JSON.stringify(visualAnalysis, null, 2),
        "要求：",
        "1. overallImpression 要把整体观察写成温暖、可被理解的开场，但不能比观察结果更武断。",
        "2. qualityNotice 要诚实说明本次识别是否清晰、完整，以及哪些地方需要谨慎理解。",
        "3. centerReflection 要围绕中心区域和整体能量来写，不能忽略中心区。",
        "4. zones 必须覆盖全部8个固定分区；summary 要把 evidence、status 和对应分区含义融合成 1-2 句自然中文，避免八条都写成同一种模板句。",
        "5. keyElements 要保留最关键的 3-5 个观察点，优先选择最有解释力的线索。",
        "6. insight 要总结情绪组织方式、能量分布和留白信息，但维持非诊断语气。",
        "7. suggestions 给出 2-4 条具体、轻量、温柔、适合课堂使用的建议，优先贴近已观察到的画面线索。",
        "8. 如果 confidence=low 或 wheelDetected=false，要明显提升谨慎度，不要假装看得很清楚。",
        `9. disclaimer 固定为：${DEFAULT_DISCLAIMER}`,
      ].join("\n");
    },
  },
};

export const PROMPT_TEMPLATE_IDS = Object.keys(PROMPT_REGISTRY) as PromptTemplateId[];

export function getPromptTemplate(id: PromptTemplateId) {
  return PROMPT_REGISTRY[id];
}

export function buildPrompt(id: PromptTemplateId, context?: PromptBuildContext) {
  return getPromptTemplate(id).build(context);
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
