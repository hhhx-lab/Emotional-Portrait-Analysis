import { WHEEL_ZONES } from "@/types/report";
import type {
  AnalysisConfidence,
  EmotionWheelReport,
  EmotionWheelReportWriterOutput,
  EmotionWheelVisualAnalysis,
  WheelZoneName,
  WheelZoneObservation,
  ZoneStatus,
} from "@/types/report";

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"];
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const NICKNAME_MAX_LENGTH = 24;
export const FEELING_MAX_LENGTH = 80;
export const DEFAULT_MODEL_TIMEOUT_MS = 45_000;
export const DEFAULT_DISCLAIMER =
  "本报告仅供自我觉察与课程反思参考，不构成医疗、心理诊断或治疗建议。";

const ZONE_ALIASES: Record<string, WheelZoneName> = {
  愿望: "愿望",
  温暖: "温暖",
  希望: "希望",
  恐惧: "恐惧",
  杂乱: "杂乱",
  未知: "杂乱",
  混乱: "杂乱",
  激动: "激动",
  期待: "期待",
  忽视: "期待",
  注视: "注视",
};

const DEFAULT_SUGGESTIONS = [
  "先选一个最想继续表达的分区，用 3 分钟补一层颜色或线条，让情绪再往前走一点。",
  "把画面里最吸引你注意的一个元素写成一句话，看看它此刻想提醒你什么。",
  "如果有留白分区，不急着填满，只需问问自己：这里是还没准备好，还是需要更多照顾。",
];

const ZONE_STATUS_VALUES = new Set<ZoneStatus>(["painted", "blank", "unclear"]);
const CONFIDENCE_VALUES = new Set<AnalysisConfidence>(["high", "medium", "low"]);

export const visualAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "wheelDetected",
    "confidence",
    "overallScene",
    "imageQuality",
    "zones",
    "keyElements",
    "uncertaintyNotes",
    "retakeAdvice",
  ],
  properties: {
    wheelDetected: { type: "boolean" },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
    overallScene: { type: "string" },
    imageQuality: { type: "string" },
    zones: {
      type: "array",
      minItems: 8,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "status", "evidence"],
        properties: {
          name: {
            type: "string",
            enum: [...WHEEL_ZONES, "未知", "忽视", "混乱"],
          },
          status: {
            type: "string",
            enum: ["painted", "blank", "unclear"],
          },
          evidence: { type: "string" },
        },
      },
    },
    keyElements: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: { type: "string" },
    },
    uncertaintyNotes: {
      type: "array",
      minItems: 0,
      maxItems: 3,
      items: { type: "string" },
    },
    retakeAdvice: { type: "string" },
  },
} as const;

export const reportJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "recognition_note",
    "overall_impression",
    "zone_insights",
    "key_elements",
    "comprehensive_insight",
    "action_suggestions",
    "closing",
  ],
  properties: {
    recognition_note: { type: "string" },
    overall_impression: { type: "string" },
    zone_insights: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["zone_name", "insight"],
        properties: {
          zone_name: {
            type: "string",
            enum: [...WHEEL_ZONES, "未知", "忽视", "混乱"],
          },
          insight: { type: "string" },
        },
      },
    },
    key_elements: { type: "string" },
    comprehensive_insight: { type: "string" },
    action_suggestions: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: { type: "string" },
    },
    closing: { type: "string" },
  },
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanText(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = normalizeWhitespace(
    value
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .replace(/^[-*•]\s*/gm, "")
      .replace(/\u0000/g, ""),
  );

  return normalized || fallback;
}

function cleanParagraph(value: unknown, fallback = "") {
  const text = cleanText(value, fallback);
  return text.replace(/\s*([，。！？；：])\s*/g, "$1");
}

function softenCenterReference(text: string) {
  return text
    .replace(/空白的中心区|空白的中心区域/g, "画面中还想继续连接的地方")
    .replace(/中心区|中心区域|轮盘中心/g, "画面中心附近");
}

function cleanStringList(value: unknown, limit: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => cleanText(item))
    .filter(Boolean)
    .slice(0, limit);
}

function clampSuggestions(items: string[]) {
  const normalized = items.filter(Boolean).slice(0, 5);

  for (const suggestion of DEFAULT_SUGGESTIONS) {
    if (normalized.length >= 3) {
      break;
    }

    if (!normalized.includes(suggestion)) {
      normalized.push(suggestion);
    }
  }

  return normalized.slice(0, 5);
}

function normalizeZoneName(value: unknown): WheelZoneName | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeWhitespace(value);
  if (normalized in ZONE_ALIASES) {
    return ZONE_ALIASES[normalized];
  }

  return WHEEL_ZONES.find((zone) => normalized.includes(zone)) ?? null;
}

function normalizeZoneStatus(value: unknown): ZoneStatus {
  if (typeof value === "string" && ZONE_STATUS_VALUES.has(value as ZoneStatus)) {
    return value as ZoneStatus;
  }

  return "unclear";
}

function normalizeConfidence(value: unknown): AnalysisConfidence {
  if (typeof value === "string" && CONFIDENCE_VALUES.has(value as AnalysisConfidence)) {
    return value as AnalysisConfidence;
  }

  return "medium";
}

function defaultZoneEvidence(zoneName: WheelZoneName, status: ZoneStatus) {
  if (status === "blank") {
    return `${zoneName}区当前基本留白，没有看到明显的后续绘画痕迹。`;
  }

  return `${zoneName}区当前信息不足，暂时无法稳定判断更具体的绘画内容。`;
}

function buildRecognitionNote(analysis: EmotionWheelVisualAnalysis, rawNote?: unknown) {
  const explicit = cleanParagraph(rawNote);
  if (explicit) {
    return explicit;
  }

  const blankCount = analysis.zones.filter((zone) => zone.status === "blank").length;
  const unclearCount = analysis.zones.filter((zone) => zone.status === "unclear").length;

  if (analysis.confidence === "high" && unclearCount === 0) {
    return "这张作品的轮盘结构较完整，分区内容清晰可辨，以下解读可以较稳定地围绕画面线索展开。";
  }

  if (analysis.confidence === "low" || unclearCount >= 3) {
    return "本次识别已经尽量基于可见画面进行整理，但照片里仍有一些分区不够清晰，建议把留白和模糊部分一起理解为“暂未完全展开”的内容。";
  }

  if (blankCount >= 3) {
    return "这张作品里既有较明确的表达，也有一些自然保留的留白区，报告会优先围绕已经显现的部分展开，同时对未展开区域保持尊重。";
  }

  return "这张作品的主要画面线索已经能够被识别，但个别区域仍建议结合现场观察与创作者自己的感受一起理解。";
}

function buildOverallImpressionFallback(analysis: EmotionWheelVisualAnalysis) {
  const visibleZones = analysis.zones.filter((zone) => zone.status === "painted").map((zone) => zone.name);
  const zoneText = visibleZones.length
    ? `较明显被点亮的分区主要集中在${visibleZones.join("、")}。`
    : "画面里暂时没有太多高饱和、强占比的分区表达。";
  const keyElementText = analysis.keyElements.length
    ? `从可见线索看，${analysis.keyElements.slice(0, 3).join("，")}。`
    : "";

  return `${analysis.overallScene}${zoneText}${keyElementText}整幅作品更像是在用画面的轻重、疏密和留白来安排情绪的出现顺序，而不是一次性把所有感受都说满。`;
}

function buildKeyElementsFallback(analysis: EmotionWheelVisualAnalysis) {
  if (!analysis.keyElements.length) {
    return "这次画面中最重要的线索，主要来自不同分区之间的疏密差异、颜色停留的位置以及哪些地方被主动保留为空白。";
  }

  return `从画面上最容易被注意到的线索来看，${analysis.keyElements.join("，")}。这些元素并不是孤立出现的，它们一起决定了作品给人的节奏感，也让某些分区显得更靠前、另一些分区则更安静。`;
}

function buildComprehensiveInsightFallback(analysis: EmotionWheelVisualAnalysis) {
  const painted = analysis.zones.filter((zone) => zone.status === "painted").map((zone) => zone.name);
  const blankCount = analysis.zones.filter((zone) => zone.status === "blank").length;

  if (!painted.length) {
    return "这幅作品更像是一个还在形成中的情绪现场。比起急着下结论，更重要的是允许自己承认：此刻也许还没有准备好把每一部分都说清楚。";
  }

  return `综合来看，这幅作品里已经被表达出来的情绪主要围绕${painted.join("、")}展开，而保留下来的${blankCount}个留白分区，则像是在替其他尚未完全展开的感受留位置。它传递出的不是单一结论，而是一种仍在流动、仍可继续被整理的内在状态。`;
}

function buildClosingFallback() {
  return "你不需要一次就把所有情绪都讲得很完整。能把当下真实出现的部分画出来、看见它、再慢慢补充它，本身就已经是一种很有力量的自我照顾。";
}

function buildZoneInsightFallback(zone: WheelZoneObservation) {
  if (zone.status !== "painted") {
    return "";
  }

  return `${zone.name}区里已经出现了比较明确的绘画痕迹：${zone.evidence}。这说明在这张轮盘里，这部分感受更容易被看见，也更像是你此刻愿意先放到台前、先和自己碰一碰的内容。`;
}

function formatCountSummary(zones: WheelZoneObservation[]) {
  return {
    identified_zones: zones.filter((zone) => zone.status === "painted").length,
    blank_zones: zones.filter((zone) => zone.status === "blank").length,
    caution: zones.filter((zone) => zone.status === "unclear").length,
  };
}

export function sanitizeNickname(value: string) {
  const cleaned = normalizeWhitespace(value).replace(/\s+/g, "");
  if (!cleaned) {
    return "匿名";
  }

  return cleaned.slice(0, NICKNAME_MAX_LENGTH);
}

export function sanitizeFeeling(value: string) {
  return cleanParagraph(value).slice(0, FEELING_MAX_LENGTH);
}

export function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatReportGenerateTime(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(/\//g, "/");
}

export function parseMaybeWrappedJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    }

    throw new Error("Unable to parse JSON payload.");
  }
}

export function normalizeVisualAnalysis(raw: unknown): EmotionWheelVisualAnalysis {
  const payload = asRecord(raw);
  const zoneMap = new Map<WheelZoneName, WheelZoneObservation>();

  for (const entry of Array.isArray(payload.zones) ? payload.zones : []) {
    const zoneRecord = asRecord(entry);
    const zoneName = normalizeZoneName(zoneRecord.name);
    if (!zoneName) {
      continue;
    }

    const status = normalizeZoneStatus(zoneRecord.status);
    zoneMap.set(zoneName, {
      name: zoneName,
      status,
      evidence: cleanParagraph(zoneRecord.evidence, defaultZoneEvidence(zoneName, status)),
    });
  }

  const confidence = normalizeConfidence(payload.confidence);
  const wheelDetected = typeof payload.wheelDetected === "boolean" ? payload.wheelDetected : confidence !== "low";
  const zones = WHEEL_ZONES.map((zoneName) => {
    const existing = zoneMap.get(zoneName);
    if (existing) {
      return existing;
    }

    return {
      name: zoneName,
      status: wheelDetected ? "unclear" : "blank",
      evidence: defaultZoneEvidence(zoneName, wheelDetected ? "unclear" : "blank"),
    } satisfies WheelZoneObservation;
  });

  const keyElements = cleanStringList(payload.keyElements, 6);
  const uncertaintyNotes = cleanStringList(payload.uncertaintyNotes, 3);
  const overallScene = cleanParagraph(
    payload.overallScene,
    "整幅作品保留了较明显的手工痕迹和分区差异，能够看出创作者在不同情绪位置上的停留轻重并不相同。",
  );
  const imageQuality = cleanParagraph(
    payload.imageQuality,
    wheelDetected
      ? "图片主体基本可辨，但个别细节仍建议结合现场原作一起理解。"
      : "当前照片中的轮盘结构不够完整，建议补拍更正面、更清晰的版本。",
  );
  const retakeAdvice = cleanParagraph(
    payload.retakeAdvice,
    wheelDetected
      ? "如果希望识别更稳定，可以尽量正面拍摄并完整拍到轮盘外边界。"
      : "请尽量正面拍摄、完整拍到轮盘边界，并保证画面清晰无遮挡。",
  );

  return {
    wheelDetected,
    confidence,
    overallScene,
    imageQuality,
    zones,
    keyElements,
    uncertaintyNotes,
    retakeAdvice,
  };
}

export function normalizeReport(
  raw: unknown,
  nickname: string,
  visualAnalysis: EmotionWheelVisualAnalysis,
): EmotionWheelReport {
  const payload = asRecord(raw);
  const paintedZoneNames = new Set(
    visualAnalysis.zones.filter((zone) => zone.status === "painted").map((zone) => zone.name),
  );

  const normalizedZoneInsights = (Array.isArray(payload.zone_insights) ? payload.zone_insights : [])
    .map((entry) => {
      const zoneRecord = asRecord(entry);
      const zoneName = normalizeZoneName(zoneRecord.zone_name);
      const insight = cleanParagraph(zoneRecord.insight);

      if (!zoneName || !insight || !paintedZoneNames.has(zoneName)) {
        return null;
      }

      return {
        zone_name: zoneName,
        insight,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const fallbackZoneInsights = visualAnalysis.zones
    .filter((zone) => zone.status === "painted")
    .map((zone) => ({
      zone_name: zone.name,
      insight: buildZoneInsightFallback(zone),
    }));

  const zoneInsights =
    normalizedZoneInsights.length > 0
      ? WHEEL_ZONES.flatMap((zoneName) =>
          normalizedZoneInsights.filter((item) => item.zone_name === zoneName),
        )
      : fallbackZoneInsights;

  const actionSuggestions = clampSuggestions(cleanStringList(payload.action_suggestions, 5));
  const counts = formatCountSummary(visualAnalysis.zones);

  const writerOutput: EmotionWheelReportWriterOutput = {
    recognition_note: softenCenterReference(
      buildRecognitionNote(visualAnalysis, payload.recognition_note),
    ),
    overall_impression: softenCenterReference(
      cleanParagraph(payload.overall_impression, buildOverallImpressionFallback(visualAnalysis)),
    ),
    zone_insights: zoneInsights,
    key_elements: softenCenterReference(
      cleanParagraph(payload.key_elements, buildKeyElementsFallback(visualAnalysis)),
    ),
    comprehensive_insight: softenCenterReference(
      cleanParagraph(payload.comprehensive_insight, buildComprehensiveInsightFallback(visualAnalysis)),
    ),
    action_suggestions: actionSuggestions.map((suggestion) => softenCenterReference(suggestion)),
    closing: softenCenterReference(cleanParagraph(payload.closing, buildClosingFallback())),
  };

  return {
    header: {
      title: "你的情绪轮盘解读报告",
      generate_time: formatReportGenerateTime(),
      nickname: sanitizeNickname(nickname),
      ...counts,
    },
    recognition_note: writerOutput.recognition_note,
    disclaimer: DEFAULT_DISCLAIMER,
    overall_impression: writerOutput.overall_impression,
    zone_insights: writerOutput.zone_insights,
    key_elements: writerOutput.key_elements,
    comprehensive_insight: writerOutput.comprehensive_insight,
    action_suggestions: writerOutput.action_suggestions,
    closing: writerOutput.closing,
  };
}
