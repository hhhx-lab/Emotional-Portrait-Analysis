import {
  ACCEPTED_IMAGE_TYPES,
  DEFAULT_DISCLAIMER,
  DEFAULT_MODEL_TIMEOUT_MS,
  FEELING_MAX_LENGTH,
  MAX_FILE_SIZE_BYTES,
  normalizeReport,
  normalizeVisualAnalysis,
  NICKNAME_MAX_LENGTH,
  parseMaybeWrappedJson,
  reportJsonSchema,
  sanitizeFeeling,
  sanitizeNickname,
  visualAnalysisJsonSchema,
} from "@/lib/emotion-wheel";
import {
  buildReportSystemInstruction,
  buildReportUserPrompt,
  buildVisionSystemInstruction,
  buildVisionUserPrompt,
} from "@/lib/prompt-registry";
import type { ErrorResponse } from "@/types/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface ChatMessageTextPart {
  type?: string;
  text?: string;
}

interface ChatChoice {
  finish_reason?: string;
  message?: {
    content?: string | ChatMessageTextPart[];
  };
}

interface ChatResponse {
  choices?: ChatChoice[];
  error?: {
    message?: string;
  };
}

class GatewayHttpError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail || `HTTP ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

class ModelOutputError extends Error {
  rawText: string;
  finishReason: string;

  constructor(message: string, rawText: string, finishReason: string) {
    super(message);
    this.rawText = rawText;
    this.finishReason = finishReason;
  }
}

function errorJson(
  message: ErrorResponse["error"],
  code: ErrorResponse["code"],
  status: number,
) {
  return Response.json(
    {
      error: message,
      code,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function extractAssistantText(payload: ChatResponse) {
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();

    if (text) {
      return text;
    }
  }

  return "";
}

function isTransientStatus(status: number) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function isResponseFormatRejection(status: number, detail: string) {
  if (status !== 400 && status !== 404 && status !== 422) {
    return false;
  }

  const normalized = detail.toLowerCase();
  return (
    normalized.includes("response_format") ||
    normalized.includes("json_schema") ||
    normalized.includes("unsupported parameter") ||
    normalized.includes("not support") ||
    normalized.includes("invalid parameter")
  );
}

async function callGatewayJson(args: {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemInstruction: string;
  userContent: string | Array<Record<string, unknown>>;
  schemaName: string;
  schema: unknown;
  timeoutMs: number;
  temperature: number;
  maxTokens: number;
}) {
  const url = `${normalizeBaseUrl(args.baseUrl)}/chat/completions`;
  const responseFormats = [
    {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: args.schemaName,
          schema: args.schema,
          strict: true,
        },
      },
    },
    {
      response_format: {
        type: "json_object",
      },
    },
    {},
  ];
  const tokenBudgets = [args.maxTokens, Math.max(args.maxTokens + 600, Math.round(args.maxTokens * 1.25))];

  let lastError: Error | null = null;

  for (const formatVariant of responseFormats) {
    for (let attempt = 0; attempt < tokenBudgets.length; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${args.apiKey}`,
          },
          body: JSON.stringify({
            model: args.model,
            temperature: args.temperature,
            max_tokens: tokenBudgets[attempt],
            messages: [
              {
                role: "system",
                content: args.systemInstruction,
              },
              {
                role: "user",
                content: args.userContent,
              },
            ],
            ...formatVariant,
          }),
          signal: AbortSignal.timeout(args.timeoutMs),
        });

        if (!response.ok) {
          const detail = await response.text();
          const error = new GatewayHttpError(response.status, detail);

          if (isResponseFormatRejection(response.status, detail)) {
            lastError = error;
            break;
          }

          if (isTransientStatus(response.status) && attempt === 0) {
            continue;
          }

          throw error;
        }

        const payload = (await response.json()) as ChatResponse;
        const text = extractAssistantText(payload);
        const finishReason = payload.choices?.[0]?.finish_reason || "";

        if (!text) {
          throw new ModelOutputError(
            payload.error?.message || "模型返回内容为空。",
            "",
            finishReason,
          );
        }

        try {
          return JSON.parse(text);
        } catch {
          try {
            return parseMaybeWrappedJson(text);
          } catch {
            throw new ModelOutputError("Unable to parse model JSON payload.", text, finishReason);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") {
          if (attempt < tokenBudgets.length - 1) {
            continue;
          }

          lastError = error;
          break;
        }

        if (error instanceof GatewayHttpError) {
          if (isTransientStatus(error.status) && attempt < tokenBudgets.length - 1) {
            continue;
          }

          if (isResponseFormatRejection(error.status, error.detail)) {
            lastError = error;
            break;
          }

          throw error;
        }

        if (error instanceof ModelOutputError) {
          console.warn("[analyze-wheel] Model JSON parse retry", {
            model: args.model,
            schemaName: args.schemaName,
            finishReason: error.finishReason || "unknown",
            maxTokens: tokenBudgets[attempt],
            preview: error.rawText.replace(/\s+/g, " ").slice(0, 240),
          });

          lastError = error;

          if (attempt < tokenBudgets.length - 1 || error.finishReason === "length") {
            continue;
          }

          break;
        }

        if (attempt < tokenBudgets.length - 1) {
          lastError = error instanceof Error ? error : new Error("Unknown model error");
          continue;
        }

        lastError = error instanceof Error ? error : new Error("Unknown model error");
        break;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("模型没有返回可解析的 JSON 结果。");
}

export async function POST(request: Request) {
  const apiKey = process.env.LM_API_KEY;
  const baseUrl = process.env.LLM_API_BASE;
  const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const grokModel = process.env.GROK_MODEL || "grok-4-1-fast-non-reasoning";
  const sharedTimeout = Number(process.env.LLM_TIMEOUT_MS || DEFAULT_MODEL_TIMEOUT_MS);
  const geminiTimeout = Number(process.env.GEMINI_TIMEOUT_MS || sharedTimeout);
  const grokTimeout = Number(process.env.GROK_TIMEOUT_MS || sharedTimeout);

  if (!apiKey || !baseUrl) {
    return errorJson("服务端尚未配置 LM_API_KEY 或 LLM_API_BASE。", "CONFIG_ERROR", 500);
  }

  const formData = await request.formData();
  const image = formData.get("image");
  const nickname = sanitizeNickname(String(formData.get("nickname") || "匿名"));
  const feeling = sanitizeFeeling(String(formData.get("feeling") || ""));

  if (!(image instanceof File)) {
    return errorJson("请先上传一张 jpg 或 png 图片。", "INVALID_FILE", 400);
  }

  if (!ACCEPTED_IMAGE_TYPES.includes(image.type)) {
    return errorJson("目前仅支持上传 jpg 或 png 图片。", "INVALID_FILE", 400);
  }

  if (image.size > MAX_FILE_SIZE_BYTES) {
    return errorJson("图片超过 10MB，请压缩后再试。", "FILE_TOO_LARGE", 400);
  }

  if (nickname.length > NICKNAME_MAX_LENGTH || feeling.length > FEELING_MAX_LENGTH) {
    return errorJson("输入内容过长，请精简后再试。", "INVALID_FILE", 400);
  }

  let base64 = "";

  try {
    const buffer = Buffer.from(await image.arrayBuffer());
    base64 = buffer.toString("base64");
  } catch {
    return errorJson("图片读取失败，请重新上传。", "INVALID_IMAGE", 400);
  }

  const imageDataUri = `data:${image.type};base64,${base64}`;

  let visualAnalysis;

  try {
    const rawVisualAnalysis = await callGatewayJson({
      apiKey,
      baseUrl,
      model: geminiModel,
      systemInstruction: buildVisionSystemInstruction(),
      userContent: [
        {
          type: "text",
          text: buildVisionUserPrompt(nickname, feeling),
        },
        {
          type: "image_url",
          image_url: {
            url: imageDataUri,
          },
        },
      ],
      schemaName: "emotion_wheel_visual_analysis",
      schema: visualAnalysisJsonSchema,
      timeoutMs: geminiTimeout,
      temperature: 0,
      maxTokens: 3200,
    });
    visualAnalysis = normalizeVisualAnalysis(rawVisualAnalysis);
  } catch (error) {
    console.error("[analyze-wheel] Gemini stage failed", error);

    if (error instanceof Error && error.name === "TimeoutError") {
      return errorJson("Gemini 识图超时，请稍后重试或换一张更清晰的图片。", "MODEL_ERROR", 504);
    }

    if (error instanceof GatewayHttpError) {
      return errorJson(
        `Gemini 识图失败，请稍后重试。${error.detail ? `（${error.detail.slice(0, 160)}）` : ""}`,
        "MODEL_ERROR",
        502,
      );
    }

    return errorJson("Gemini 识图暂时不可用，请稍后再试。", "MODEL_ERROR", 502);
  }

  const unclearZoneCount = visualAnalysis.zones.filter((zone) => zone.status === "unclear").length;

  if (!visualAnalysis.wheelDetected || unclearZoneCount >= 6) {
    console.warn("[analyze-wheel] Wheel detection too weak", {
      wheelDetected: visualAnalysis.wheelDetected,
      unclearZoneCount,
      confidence: visualAnalysis.confidence,
    });

    return errorJson(
      `这张图片里的轮盘结构暂时不够清晰，建议重新拍摄后再试。${visualAnalysis.retakeAdvice ? `（${visualAnalysis.retakeAdvice}）` : ""}`,
      "INVALID_IMAGE",
      400,
    );
  }

  let report;

  try {
    const rawReport = await callGatewayJson({
      apiKey,
      baseUrl,
      model: grokModel,
      systemInstruction: buildReportSystemInstruction(),
      userContent: buildReportUserPrompt(nickname, feeling, visualAnalysis),
      schemaName: "emotion_wheel_report",
      schema: reportJsonSchema,
      timeoutMs: grokTimeout,
      temperature: 0.22,
      maxTokens: 2200,
    });
    report = normalizeReport(rawReport, nickname);
  } catch (error) {
    console.error("[analyze-wheel] Grok stage failed", error);

    if (error instanceof Error && error.name === "TimeoutError") {
      return errorJson("Grok 报告生成超时，请稍后重试。", "MODEL_ERROR", 504);
    }

    if (error instanceof GatewayHttpError) {
      return errorJson(
        `Grok 报告生成失败，请稍后重试。${error.detail ? `（${error.detail.slice(0, 160)}）` : ""}`,
        "MODEL_ERROR",
        502,
      );
    }

    return errorJson("Grok 报告生成暂时不可用，请稍后再试。", "MODEL_ERROR", 502);
  }

  report.disclaimer = report.disclaimer || DEFAULT_DISCLAIMER;

  return Response.json(report, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
