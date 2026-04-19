export const WHEEL_ZONES = [
  "愿望",
  "温暖",
  "希望",
  "恐惧",
  "未知",
  "激动",
  "注视",
  "忽视",
] as const;

export type WheelZoneName = (typeof WHEEL_ZONES)[number];

export type ZoneStatus = "painted" | "blank" | "unclear";
export type AnalysisConfidence = "high" | "medium" | "low";

export type AnalyzeState = "idle" | "analyzing" | "ready" | "error";

export interface FileSummary {
  name: string;
  sizeLabel: string;
  mimeType: string;
}

export interface WheelZoneInsight {
  name: WheelZoneName;
  status: ZoneStatus;
  summary: string;
}

export interface WheelZoneObservation {
  name: WheelZoneName;
  status: ZoneStatus;
  evidence: string;
  emotionalSignal: string;
}

export interface EmotionWheelVisualAnalysis {
  wheelDetected: boolean;
  confidence: AnalysisConfidence;
  overallScene: string;
  imageQuality: string;
  centerArea: string;
  zones: WheelZoneObservation[];
  keyElements: string[];
  uncertaintyNotes: string[];
  retakeAdvice: string;
}

export interface EmotionWheelReport {
  generatedAt: string;
  nickname: string;
  overallImpression: string;
  qualityNotice: string;
  centerReflection: string;
  zones: WheelZoneInsight[];
  keyElements: string[];
  insight: string;
  suggestions: string[];
  disclaimer: string;
}

export interface ErrorResponse {
  error: string;
  code:
    | "INVALID_FILE"
    | "FILE_TOO_LARGE"
    | "INVALID_IMAGE"
    | "MODEL_ERROR"
    | "BAD_RESPONSE"
    | "CONFIG_ERROR";
}
