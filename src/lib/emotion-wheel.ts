import {
  type AnalysisConfidence,
  type EmotionWheelReport,
  type EmotionWheelVisualAnalysis,
  type WheelZoneInsight,
  type WheelZoneName,
  type WheelZoneObservation,
  WHEEL_ZONES,
} from "@/types/report";

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"];
export const NICKNAME_MAX_LENGTH = 24;
export const FEELING_MAX_LENGTH = 80;
export const DEFAULT_MODEL_TIMEOUT_MS = 45_000;
export const DEFAULT_DISCLAIMER =
  "本报告仅供自我觉察与课程反思参考，不构成医疗、心理诊断或治疗建议。";

const zoneStatusSchema = {
  type: "string",
  enum: ["painted", "blank", "unclear"],
};

export const visualAnalysisJsonSchema = {
  type: "object",
  properties: {
    wheelDetected: {
      type: "boolean",
      description: "图片中是否看到了标准情绪轮盘主体结构。",
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description: "对本次视觉判断的整体置信度。",
    },
    overallScene: {
      type: "string",
      description: "对画面整体节奏、色彩和构图的客观观察，尽量控制在1-2句。",
    },
    imageQuality: {
      type: "string",
      description: "对清晰度、角度、遮挡和光线的判断，尽量控制在1句。",
    },
    centerArea: {
      type: "string",
      description: "对轮盘中心区域的观察，尽量控制在1句；若中心无明显内容也要直说。",
    },
    zones: {
      type: "array",
      description: "必须包含8个固定分区，名称不可增删改。",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            enum: [...WHEEL_ZONES],
          },
          status: zoneStatusSchema,
          evidence: {
            type: "string",
            description: "这个分区实际看到了什么，优先写颜色、笔触、图案、留白和边界，尽量用1句短句。",
          },
        },
        required: ["name", "status", "evidence"],
      },
    },
    keyElements: {
      type: "array",
      items: {
        type: "string",
      },
      description: "颜色、线条、图案、留白、结构等可见元素，3-5条短句。",
    },
    uncertaintyNotes: {
      type: "array",
      items: {
        type: "string",
      },
      description: "需要保留不确定性的点，1-2条短句。",
    },
    retakeAdvice: {
      type: "string",
      description: "如果图片质量不足，给一句简短补拍建议；若质量较好，也可给一句确认说明。",
    },
  },
  required: [
    "wheelDetected",
    "confidence",
    "overallScene",
    "imageQuality",
    "centerArea",
    "zones",
    "keyElements",
    "uncertaintyNotes",
    "retakeAdvice",
  ],
};

export const reportJsonSchema = {
  type: "object",
  properties: {
    overallImpression: {
      type: "string",
      description: "整体视觉印象，2-4句，语气温暖克制。",
    },
    qualityNotice: {
      type: "string",
      description: "对本次识别质量、完整度与谨慎边界的提示，1-2句。",
    },
    centerReflection: {
      type: "string",
      description: "对中心区域和整体能量的解释，2-3句。",
    },
    zones: {
      type: "array",
      description: "必须包含8个固定分区，名称不可增删改。",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            enum: [...WHEEL_ZONES],
          },
          status: zoneStatusSchema,
          summary: {
            type: "string",
            description: "结合观察与情绪线索的温和解读，1-2句。",
          },
        },
        required: ["name", "status", "summary"],
      },
    },
    keyElements: {
      type: "array",
      items: {
        type: "string",
      },
      description: "颜色、结构、图案等关键元素，3-5条。",
    },
    insight: {
      type: "string",
      description: "综合情绪状态洞察，2-4句。",
    },
    suggestions: {
      type: "array",
      items: {
        type: "string",
      },
      description: "温暖建议与行动提示，2-4条，具体且柔和。",
    },
    disclaimer: {
      type: "string",
    },
  },
  required: [
    "overallImpression",
    "qualityNotice",
    "centerReflection",
    "zones",
    "keyElements",
    "insight",
    "suggestions",
    "disclaimer",
  ],
};

export function sanitizeNickname(value: string) {
  return value.trim().slice(0, NICKNAME_MAX_LENGTH) || "匿名";
}

export function sanitizeFeeling(value: string) {
  return value.trim().slice(0, FEELING_MAX_LENGTH);
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function parseMaybeWrappedJson(text: string) {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    // Ignore and continue to progressively more forgiving strategies.
  }

  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const objectSlice = withoutFence.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(objectSlice);
    } catch {
      // Ignore and continue.
    }
  }

  if (
    (withoutFence.startsWith('"') && withoutFence.endsWith('"')) ||
    (withoutFence.startsWith("'") && withoutFence.endsWith("'"))
  ) {
    const unwrapped = withoutFence.slice(1, -1);
    try {
      return JSON.parse(unwrapped);
    } catch {
      // Ignore and continue.
    }
  }

  throw new Error("Unable to parse model JSON payload.");
}

function ensureStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const cleaned = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

  return cleaned.length > 0 ? cleaned : fallback;
}

function ensureString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function ensureBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function ensureConfidence(value: unknown, fallback: AnalysisConfidence): AnalysisConfidence {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "high" || normalized === "medium" || normalized === "low"
    ? (normalized as AnalysisConfidence)
    : fallback;
}

function normalizeZoneStatus(value: unknown): WheelZoneObservation["status"] {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "painted" || normalized === "blank" || normalized === "unclear"
    ? normalized
    : "unclear";
}

function normalizeZoneInsight(zoneName: WheelZoneName, rawZone: unknown): WheelZoneInsight {
  const base: WheelZoneInsight = {
    name: zoneName,
    status: "unclear",
    summary: "这一分区的画面信息较少或不够清晰，建议结合现场感受再做补充理解。",
  };

  if (!rawZone || typeof rawZone !== "object") {
    return base;
  }

  const maybeZone = rawZone as Partial<WheelZoneInsight>;
  const status = normalizeZoneStatus(maybeZone.status);

  return {
    name: zoneName,
    status,
    summary: ensureString(maybeZone.summary, base.summary),
  };
}

function normalizeZoneObservation(
  zoneName: WheelZoneName,
  rawZone: unknown,
): WheelZoneObservation {
  const base: WheelZoneObservation = {
    name: zoneName,
    status: "unclear",
    evidence: "这一分区的画面信息较少或不够清晰，暂时无法稳定判断具体内容。",
    emotionalSignal: "这一部分更适合保留开放理解，避免过早下结论。",
  };

  if (!rawZone || typeof rawZone !== "object") {
    return base;
  }

  const maybeZone = rawZone as Partial<WheelZoneObservation>;
  const status = normalizeZoneStatus(maybeZone.status);

  return {
    name: zoneName,
    status,
    evidence: ensureString(maybeZone.evidence, base.evidence),
    emotionalSignal: ensureString(maybeZone.emotionalSignal, base.emotionalSignal),
  };
}

export function normalizeVisualAnalysis(raw: unknown): EmotionWheelVisualAnalysis {
  const fallback: EmotionWheelVisualAnalysis = {
    wheelDetected: false,
    confidence: "low",
    overallScene:
      "当前图片里仍有一些初步的画面线索，但轮盘主体或局部细节还不够稳定，建议结合更清晰的原图继续观察。",
    imageQuality: "图片存在一定角度、清晰度或细节损失，本次结果更适合做谨慎参考。",
    centerArea: "中心区域目前没有足够清晰的细节可供稳定判断。",
    zones: WHEEL_ZONES.map((zone) => ({
      name: zone,
      status: "unclear",
      evidence: "这一分区暂时看不清楚具体细节。",
      emotionalSignal: "这一部分更适合保留开放理解。",
    })),
    keyElements: [
      "画面整体已经提供了初步的情绪线索。",
      "颜色与笔触仍是主要的观察入口。",
      "留白或模糊区域同样值得被温柔地看见。",
      "建议回到原作再看一遍局部细节。",
    ],
    uncertaintyNotes: ["图片中的部分细节仍需要结合更清晰的原图再做判断。"],
    retakeAdvice: "建议使用正面、无遮挡、光线均匀的照片重新上传，以提升识别稳定性。",
  };

  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const analysis = raw as Partial<EmotionWheelVisualAnalysis>;
  const rawZones = Array.isArray(analysis.zones) ? analysis.zones : [];
  const zoneMap = new Map<WheelZoneName, unknown>();
  const orderedFallbackZones: unknown[] = [];

  for (const item of rawZones) {
    if (item && typeof item === "object") {
      const zone = item as Partial<WheelZoneObservation>;
      if (zone.name && WHEEL_ZONES.includes(zone.name)) {
        zoneMap.set(zone.name, zone);
      } else {
        orderedFallbackZones.push(zone);
      }
    }
  }

  const normalizedConfidence = ensureConfidence(analysis.confidence, fallback.confidence);

  return {
    wheelDetected: ensureBoolean(analysis.wheelDetected, normalizedConfidence !== "low"),
    confidence: normalizedConfidence,
    overallScene: ensureString(analysis.overallScene, fallback.overallScene),
    imageQuality: ensureString(analysis.imageQuality, fallback.imageQuality),
    centerArea: ensureString(analysis.centerArea, fallback.centerArea),
    zones: WHEEL_ZONES.map((zone, index) =>
      normalizeZoneObservation(zone, zoneMap.get(zone) ?? rawZones[index] ?? orderedFallbackZones[index]),
    ),
    keyElements: ensureStringArray(analysis.keyElements, fallback.keyElements).slice(0, 6),
    uncertaintyNotes: ensureStringArray(analysis.uncertaintyNotes, fallback.uncertaintyNotes).slice(0, 3),
    retakeAdvice: ensureString(analysis.retakeAdvice, fallback.retakeAdvice),
  };
}

export function normalizeReport(raw: unknown, nickname: string): EmotionWheelReport {
  const fallbackReport: EmotionWheelReport = {
    generatedAt: new Date().toISOString(),
    nickname: sanitizeNickname(nickname),
    overallImpression:
      "这幅轮盘画面已经呈现出一些值得关注的情绪线索，但其中也保留了不少模糊与开放空间，适合带着好奇心慢慢阅读。",
    qualityNotice:
      "这份报告更适合用作课堂中的自我觉察参考，若照片局部不够清晰，建议结合原作再做补充理解。",
    centerReflection:
      "轮盘中心往往像这幅画的呼吸点。即使中心内容不多，它依然在提醒我们：情绪里既有被看见的部分，也有尚未完全说清的部分。",
    zones: WHEEL_ZONES.map((zone) => ({
      name: zone,
      status: "unclear",
      summary: "这一分区暂时不适合做过于确定的判断，可以结合你的现场体验再看一看。",
    })),
    keyElements: [
      "画面整体提供了初步的情绪线索，但部分细节需要结合原作进一步观察。",
      "颜色与笔触是主要的情绪信息来源。",
      "留白或模糊区域同样值得被温柔地看见。",
    ],
    insight:
      "你当前的情绪并不一定是单一的，它可能同时包含想靠近的部分、想回避的部分，以及尚未完全说清的部分。",
    suggestions: [
      "先用一句简单的话描述此刻最明显的感受，不急着解释原因。",
      "把你最想多看一眼的分区单独拿出来，再补充一句联想到的人或事。",
      "如果愿意，可以和可信任的人分享这幅画里最触动你的一个细节。",
    ],
    disclaimer: DEFAULT_DISCLAIMER,
  };

  if (!raw || typeof raw !== "object") {
    return fallbackReport;
  }

  const report = raw as Partial<EmotionWheelReport>;
  const rawZones = Array.isArray(report.zones) ? report.zones : [];
  const zoneMap = new Map<WheelZoneName, unknown>();
  const orderedFallbackZones: unknown[] = [];

  for (const item of rawZones) {
    if (item && typeof item === "object") {
      const zone = item as Partial<WheelZoneInsight>;
      if (zone.name && WHEEL_ZONES.includes(zone.name)) {
        zoneMap.set(zone.name, zone);
      } else {
        orderedFallbackZones.push(zone);
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    nickname: sanitizeNickname(nickname),
    overallImpression: ensureString(report.overallImpression, fallbackReport.overallImpression),
    qualityNotice: ensureString(report.qualityNotice, fallbackReport.qualityNotice),
    centerReflection: ensureString(report.centerReflection, fallbackReport.centerReflection),
    zones: WHEEL_ZONES.map((zone, index) =>
      normalizeZoneInsight(zone, zoneMap.get(zone) ?? rawZones[index] ?? orderedFallbackZones[index]),
    ),
    keyElements: ensureStringArray(report.keyElements, fallbackReport.keyElements).slice(0, 5),
    insight: ensureString(report.insight, fallbackReport.insight),
    suggestions: ensureStringArray(report.suggestions, fallbackReport.suggestions).slice(0, 4),
    disclaimer: ensureString(report.disclaimer, DEFAULT_DISCLAIMER),
  };
}
