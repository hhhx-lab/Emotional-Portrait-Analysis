export const WHEEL_ZONES = [
  "愿望",
  "温暖",
  "希望",
  "恐惧",
  "杂乱",
  "激动",
  "期待",
  "注视",
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

export interface WheelZoneObservation {
  name: WheelZoneName;
  status: ZoneStatus;
  evidence: string;
}

export interface EmotionWheelVisualAnalysis {
  wheelDetected: boolean;
  confidence: AnalysisConfidence;
  overallScene: string;
  imageQuality: string;
  zones: WheelZoneObservation[];
  keyElements: string[];
  uncertaintyNotes: string[];
  retakeAdvice: string;
}

export interface EmotionWheelReportHeader {
  title: string;
  generate_time: string;
  nickname: string;
  identified_zones: number;
  blank_zones: number;
  caution: number;
}

export interface EmotionWheelReportZoneInsight {
  zone_name: WheelZoneName;
  insight: string;
}

export interface EmotionWheelReportWriterOutput {
  recognition_note: string;
  overall_impression: string;
  zone_insights: EmotionWheelReportZoneInsight[];
  key_elements: string;
  comprehensive_insight: string;
  action_suggestions: string[];
  closing: string;
}

export interface EmotionWheelReport {
  header: EmotionWheelReportHeader;
  recognition_note: string;
  disclaimer: string;
  overall_impression: string;
  zone_insights: EmotionWheelReportZoneInsight[];
  key_elements: string;
  comprehensive_insight: string;
  action_suggestions: string[];
  closing: string;
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
