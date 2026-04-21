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

const REAL_WORLD_ZONE_SUGGESTIONS: Record<WheelZoneName, string[]> = {
  愿望: [
    "给自己 5 分钟，写下现在最想靠近的一件小事，并补上一个今天就能开始的第一步。",
  ],
  温暖: [
    "给自己安排一个温暖的小仪式，比如喝一杯热饮、抱抱自己，或给信任的人发一条问候。",
  ],
  希望: [
    "在今天结束前记下一个让你觉得还可以继续往前走的小证据，把它留给今晚的自己。",
  ],
  恐惧: [
    "先做 3 轮慢呼吸，再看看身边 5 样真实存在的东西，让身体先慢慢安定下来。",
  ],
  杂乱: [
    "花 10 分钟整理一个很小的角落，或把脑海里最乱的 3 件事写下来，只做排序，不急着解决。",
  ],
  激动: [
    "去走动 5 分钟、拉伸一下，或让自己喝点水，给这股能量一个温和的出口。",
  ],
  期待: [
    "写下一周内最想尝试的一件小事，并把它放进一个具体的时间点里。",
  ],
  注视: [
    "站在镜子前做 3 次深呼吸，然后轻声对自己说一句此刻最需要听见的话。",
  ],
};

const GENERAL_SUGGESTIONS = [
  "给自己留 5 分钟安静坐一坐，问问现在最想被照顾的是哪一部分感受。",
  "如果愿意，可以把这份报告里最触动你的一句话读出来，让自己真正听见它。",
  "今天只选一件最小、最容易做到的事完成，让情绪有一个温柔落地的地方。",
];

const DRAWING_ACTION_PATTERN =
  /(继续画|再画|补画|补一层|补色|再涂|涂色|线条|色块|轮盘|分区|图案|画面里再|纸上|画纸|重新上色|把.*画出来)/;

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

function softenReportLanguage(text: string) {
  return text
    .replace(/营造出/g, "带出")
    .replace(/传达出/g, "轻轻流露出")
    .replace(/强化了/g, "让")
    .replace(/视觉节奏/g, "画面节奏")
    .replace(/象征着/g, "像在说")
    .replace(/提示你/g, "像是在轻轻提醒你")
    .replace(/提醒你/g, "像是在轻轻提醒你")
    .replace(/反映出你/g, "让人感觉你此刻")
    .replace(/说明你就是/g, "像是在说你此刻")
    .replace(/说明你/g, "像是在说你")
    .replace(/意味着一切都/g, "不一定表示一切都")
    .replace(/过于/g, "有些")
    .replace(/仿佛/g, "像是");
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

function normalizeSuggestion(text: string) {
  return cleanParagraph(text)
    .replace(/^[\d一二三四五六七八九十]+[、.．)\s]*/, "")
    .replace(/^[-*•]\s*/, "");
}

function buildFallbackSuggestions(analysis: EmotionWheelVisualAnalysis) {
  const suggestions: string[] = [];
  const paintedZones = analysis.zones.filter((zone) => zone.status === "painted").map((zone) => zone.name);

  for (const zoneName of paintedZones) {
    for (const suggestion of REAL_WORLD_ZONE_SUGGESTIONS[zoneName]) {
      if (!suggestions.includes(suggestion)) {
        suggestions.push(suggestion);
      }
    }
  }

  if (analysis.zones.some((zone) => zone.status === "blank")) {
    suggestions.push("如果某些地方还没准备好展开，就先允许它保持安静，不急着给所有感受一个结论。");
  }

  if (analysis.confidence !== "high") {
    suggestions.push("这份报告可以当成一次轻轻的整理，如果你愿意，也可以对照原作再看看哪些部分还想补充说明。");
  }

  for (const suggestion of GENERAL_SUGGESTIONS) {
    if (!suggestions.includes(suggestion)) {
      suggestions.push(suggestion);
    }
  }

  return suggestions.slice(0, 5);
}

function clampSuggestions(items: string[], analysis: EmotionWheelVisualAnalysis) {
  const normalized = items
    .map((item) => normalizeSuggestion(item))
    .filter((item) => item && !DRAWING_ACTION_PATTERN.test(item));
  const merged = [...normalized];

  for (const suggestion of buildFallbackSuggestions(analysis)) {
    if (merged.length >= 5) {
      break;
    }

    if (!merged.includes(suggestion)) {
      merged.push(suggestion);
    }
  }

  return merged.slice(0, Math.max(3, Math.min(5, merged.length)));
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

function buildRecognitionNote(analysis: EmotionWheelVisualAnalysis) {
  const blankCount = analysis.zones.filter((zone) => zone.status === "blank").length;
  const unclearCount = analysis.zones.filter((zone) => zone.status === "unclear").length;

  if (analysis.confidence === "high" && unclearCount === 0 && blankCount === 0) {
    return "本次图像质量较高，所有分区细节清晰可辨。";
  }

  if (analysis.confidence === "high" && unclearCount === 0) {
    return "本次图像质量较高，主要分区细节清晰可辨，部分区域保持自然留白。";
  }

  if (analysis.confidence === "low" || unclearCount >= 3) {
    return "这张照片里有几处区域不够清晰，以下解读会更谨慎地围绕可见部分展开。";
  }

  if (blankCount >= 3) {
    return "图片主体基本清晰，已能看到主要分区内容，较多留白会作为自然保留的一部分来理解。";
  }

  return "图片主体基本清晰，主要分区已经可以辨认，少量模糊区域会保留谨慎说明。";
}

function buildOverallImpressionFallback(analysis: EmotionWheelVisualAnalysis) {
  const visibleZones = analysis.zones.filter((zone) => zone.status === "painted").map((zone) => zone.name);
  const zoneText = visibleZones.length
    ? `这次更容易被看见的表达，主要落在${visibleZones.join("、")}这些分区。`
    : "画面里暂时没有特别强烈地被推到前面的分区表达。";
  const keyElementText = analysis.keyElements.length
    ? `从可见线索看，${analysis.keyElements.slice(0, 3).join("，")}。`
    : "";

  return `${analysis.overallScene}${zoneText}${keyElementText}整幅作品并不是把所有感受一起推到前面，而是让一些内容先出现，另一些内容先安静地停在那里。这样的安排会让人感觉到，你正在用自己的节奏慢慢靠近内在，而不是急着一次说完所有情绪。`;
}

function buildKeyElementsFallback(analysis: EmotionWheelVisualAnalysis) {
  if (!analysis.keyElements.length) {
    return "这次画面里最值得留意的线索，主要来自不同分区之间的轻重差异、颜色停留的位置，以及哪些地方被你主动留了下来。";
  }

  return `从画面上最容易被注意到的线索来看，${analysis.keyElements.join("，")}。它们并不是孤立出现的，而是在互相呼应里慢慢把整幅作品的气氛带出来，也让某些感受更靠前，另一些感受则先留在稍远一点的位置。`;
}

function buildComprehensiveInsightFallback(analysis: EmotionWheelVisualAnalysis) {
  const painted = analysis.zones.filter((zone) => zone.status === "painted").map((zone) => zone.name);
  const blankCount = analysis.zones.filter((zone) => zone.status === "blank").length;

  if (!painted.length) {
    return "这幅作品更像是一个还在慢慢形成中的情绪现场。比起急着下结论，更重要的是允许自己承认：有些感受也许还在路上，还没有准备好立刻说清楚。";
  }

  return `综合来看，这幅作品里已经被表达出来的内容，主要围绕${painted.join("、")}展开；而保留下来的${blankCount}个留白分区，也像是在给其他暂时还没准备好靠近的感受留位置。它更像一段正在整理中的心情，而不是一个已经定型的答案。`;
}

function buildClosingFallback() {
  return "你不需要一次就把所有情绪都讲得很完整。能先把此刻真正浮出来的部分看见、放下、再慢慢靠近，已经是一种很认真也很温柔的自我照顾。";
}

function buildZoneInsightFallback(zone: WheelZoneObservation) {
  if (zone.status !== "painted") {
    return "";
  }

  return `在${zone.name}区里，你已经留下了比较明确的痕迹：${zone.evidence}。这会让人感觉到，这部分感受此刻更容易被你看见，也更像是你愿意先停下来碰一碰、听一听的内容。`;
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

  const actionSuggestions = clampSuggestions(cleanStringList(payload.action_suggestions, 5), visualAnalysis);
  const counts = formatCountSummary(visualAnalysis.zones);

  const writerOutput: EmotionWheelReportWriterOutput = {
    recognition_note: softenReportLanguage(
      softenCenterReference(
      buildRecognitionNote(visualAnalysis),
    )),
    overall_impression: softenReportLanguage(
      softenCenterReference(
        cleanParagraph(payload.overall_impression, buildOverallImpressionFallback(visualAnalysis)),
      ),
    ),
    zone_insights: zoneInsights,
    key_elements: softenReportLanguage(
      softenCenterReference(
        cleanParagraph(payload.key_elements, buildKeyElementsFallback(visualAnalysis)),
      ),
    ),
    comprehensive_insight: softenReportLanguage(
      softenCenterReference(
        cleanParagraph(
          payload.comprehensive_insight,
          buildComprehensiveInsightFallback(visualAnalysis),
        ),
      ),
    ),
    action_suggestions: actionSuggestions.map((suggestion) =>
      softenReportLanguage(softenCenterReference(suggestion)),
    ),
    closing: softenReportLanguage(
      softenCenterReference(cleanParagraph(payload.closing, buildClosingFallback())),
    ),
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
