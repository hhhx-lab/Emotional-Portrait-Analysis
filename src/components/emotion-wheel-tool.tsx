"use client";

import Image from "next/image";
import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  ACCEPTED_IMAGE_TYPES,
  FEELING_MAX_LENGTH,
  formatFileSize,
  MAX_FILE_SIZE_BYTES,
  NICKNAME_MAX_LENGTH,
  sanitizeFeeling,
  sanitizeNickname,
} from "@/lib/emotion-wheel";
import type {
  AnalyzeState,
  EmotionWheelReport,
  ErrorResponse,
  FileSummary,
  WheelZoneInsight,
  WheelZoneName,
} from "@/types/report";

const ACCEPTED_EXTENSIONS = ".jpg,.jpeg,.png";
const MAX_DIMENSION = 1680;
const TARGET_UPLOAD_BYTES = 2.2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 85_000;

const PROCESS_STEPS = [
  {
    index: "01",
    title: "上传轮盘作品",
    description: "支持拖拽、点击上传与桌面端粘贴截图，图片会先本地预览再送审。",
  },
  {
    index: "02",
    title: "AI 双模型识读",
    description: "Gemini 先做视觉观察，Grok 再把观察结果整理成温暖、克制的课程报告。",
  },
  {
    index: "03",
    title: "导出与分享",
    description: "报告生成后可直接打印或保存为 PDF，适合课堂投影、回顾与交流。",
  },
] as const;

const ANALYZING_STEPS = [
  {
    title: "已收到作品",
    detail: "正在整理图片尺寸，并检查轮盘边界是否完整进入画面。",
  },
  {
    title: "Gemini 正在读图",
    detail: "颜色、笔触、中心区域和留白正在被结构化整理。",
  },
  {
    title: "Grok 正在写报告",
    detail: "系统会把视觉观察转换成一份适合课程使用的温暖中文报告。",
  },
  {
    title: "正在完成润色",
    detail: "正在做最后的字段校验和排版准备，请稍候片刻。",
  },
] as const;

const PHOTO_TIPS = [
  "尽量正面拍摄，完整拍到轮盘外边界。",
  "保持光线均匀，减少阴影、反光和局部过曝。",
  "如果中心区域有图案或文字，请尽量保证它清晰可见。",
] as const;

const ZONE_STYLES: Record<
  WheelZoneName,
  {
    card: string;
    accent: string;
    dot: string;
  }
> = {
  愿望: {
    card: "from-amber-50 via-white to-orange-50",
    accent: "text-amber-700",
    dot: "bg-amber-400",
  },
  温暖: {
    card: "from-rose-50 via-white to-orange-50",
    accent: "text-rose-700",
    dot: "bg-rose-400",
  },
  希望: {
    card: "from-emerald-50 via-white to-lime-50",
    accent: "text-emerald-700",
    dot: "bg-emerald-400",
  },
  恐惧: {
    card: "from-cyan-50 via-white to-sky-50",
    accent: "text-cyan-700",
    dot: "bg-cyan-400",
  },
  未知: {
    card: "from-sky-50 via-white to-indigo-50",
    accent: "text-sky-700",
    dot: "bg-sky-400",
  },
  激动: {
    card: "from-violet-50 via-white to-fuchsia-50",
    accent: "text-violet-700",
    dot: "bg-violet-400",
  },
  注视: {
    card: "from-fuchsia-50 via-white to-pink-50",
    accent: "text-fuchsia-700",
    dot: "bg-fuchsia-400",
  },
  忽视: {
    card: "from-orange-50 via-white to-stone-50",
    accent: "text-orange-700",
    dot: "bg-orange-400",
  },
};

type NoticeTone = "info" | "error" | "success";

interface NoticeState {
  tone: NoticeTone;
  text: string;
}

function formatDate(iso: string) {
  const value = new Date(iso);
  return value.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function zoneStatusLabel(status: WheelZoneInsight["status"]) {
  if (status === "painted") return "已有绘画";
  if (status === "blank") return "留白";
  return "需谨慎判断";
}

function zoneStatusClass(status: WheelZoneInsight["status"]) {
  if (status === "painted") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "blank") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function noticeClass(tone: NoticeTone) {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50/90 text-emerald-900";
  }

  if (tone === "error") {
    return "border-rose-200 bg-rose-50/90 text-rose-800";
  }

  return "border-sky-200 bg-sky-50/90 text-sky-800";
}

function summarizeZones(zones: WheelZoneInsight[]) {
  return {
    painted: zones.filter((zone) => zone.status === "painted"),
    quiet: zones.filter((zone) => zone.status !== "painted"),
    paintedCount: zones.filter((zone) => zone.status === "painted").length,
    blankCount: zones.filter((zone) => zone.status === "blank").length,
    unclearCount: zones.filter((zone) => zone.status === "unclear").length,
  };
}

async function loadImageElement(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function buildUploadHint(width: number, height: number, fileSize: number) {
  const maxSide = Math.max(width, height);
  const aspectRatio = maxSide / Math.max(1, Math.min(width, height));

  if (maxSide < 900) {
    return "图片分辨率偏小，建议使用更清晰的原图，能明显提升轮盘边界和细节的识别稳定性。";
  }

  if (aspectRatio > 1.8) {
    return "这张图片比例偏长，请确认轮盘主体是否完整入镜，避免只拍到局部。";
  }

  if (fileSize > 4 * 1024 * 1024) {
    return "图片体积较大，系统会先自动压缩后再上传，通常不会影响主要解读质量。";
  }

  return "画面尺寸初步可用，建议继续保持正面、无遮挡、光线均匀的拍摄方式。";
}

async function optimizeImage(file: File) {
  const image = await loadImageElement(file);
  const ratio = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));
  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("当前浏览器无法处理图片，请更换浏览器后再试。");
  }

  context.fillStyle = "#fffaf6";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  let quality = file.size > 6 * 1024 * 1024 ? 0.8 : 0.88;
  let blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });

  if (!blob) {
    throw new Error("图片压缩失败，请重新上传。");
  }

  while (blob.size > TARGET_UPLOAD_BYTES && quality > 0.58) {
    quality -= 0.08;
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });

    if (!blob) {
      throw new Error("图片压缩失败，请重新上传。");
    }
  }

  const name = file.name.replace(/\.[^.]+$/, "") || `emotion-wheel-${Date.now()}`;

  return {
    width,
    height,
    file: new File([blob], `${name}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    }),
  };
}

function ProcessCard({
  index,
  title,
  description,
}: {
  index: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[1.6rem] border border-white/70 bg-white/72 p-4 shadow-[0_18px_42px_rgba(204,182,160,0.1)] backdrop-blur">
      <p className="font-display text-2xl leading-none text-emerald-700">{index}</p>
      <h3 className="mt-3 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-slate-600">{description}</p>
    </div>
  );
}

function ZoneCard({ zone }: { zone: WheelZoneInsight }) {
  const tone = ZONE_STYLES[zone.name];

  return (
    <article
      className={`card-break rounded-[1.5rem] border border-white/80 bg-gradient-to-br ${tone.card} p-4 shadow-[0_14px_38px_rgba(210,194,176,0.12)]`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`mt-1 h-3 w-3 rounded-full ${tone.dot}`} />
          <div>
            <h4 className={`text-lg font-semibold ${tone.accent}`}>{zone.name}区</h4>
            <p className="mt-1 text-xs tracking-[0.18em] text-slate-400 uppercase">Zone Insight</p>
          </div>
        </div>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${zoneStatusClass(zone.status)}`}
        >
          {zoneStatusLabel(zone.status)}
        </span>
      </div>
      <p className="mt-4 text-sm leading-7 text-slate-700">{zone.summary}</p>
    </article>
  );
}

export function EmotionWheelTool() {
  const [nickname, setNickname] = useState("");
  const [feeling, setFeeling] = useState("");
  const [state, setState] = useState<AnalyzeState>("idle");
  const [report, setReport] = useState<EmotionWheelReport | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileSummary, setFileSummary] = useState<FileSummary | null>(null);
  const [imageHint, setImageHint] = useState("");
  const [imageDimensions, setImageDimensions] = useState("");
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  const clipboardSupported = useSyncExternalStore(
    () => () => {},
    () => Boolean(navigator.clipboard?.read),
    () => false,
  );

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      requestControllerRef.current?.abort();
    };
  }, [previewUrl]);

  useEffect(() => {
    if (state !== "analyzing") {
      return;
    }

    const timer = window.setInterval(() => {
      setLoadingStepIndex((current) => Math.min(current + 1, ANALYZING_STEPS.length - 1));
    }, 2600);

    return () => window.clearInterval(timer);
  }, [state]);

  function scrollToReport() {
    window.setTimeout(() => {
      document.getElementById("report-section")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
  }

  function resetSession(options?: { preserveIdentity?: boolean }) {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    requestControllerRef.current?.abort();
    requestControllerRef.current = null;

    setState("idle");
    setReport(null);
    setNotice(null);
    setPreviewUrl("");
    setDragging(false);
    setSelectedFile(null);
    setFileSummary(null);
    setImageHint("");
    setImageDimensions("");
    setLoadingStepIndex(0);

    if (!options?.preserveIdentity) {
      setNickname("");
      setFeeling("");
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function validateFile(file: File) {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return "请上传 JPG 或 PNG 格式的图片。";
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return "图片超过 10MB，请压缩后再试。";
    }

    return "";
  }

  async function applyFile(file: File) {
    const validation = validateFile(file);
    if (validation) {
      setState("error");
      setNotice({
        tone: "error",
        text: validation,
      });
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(nextPreviewUrl);
    setSelectedFile(file);
    setReport(null);
    setNotice(null);
    setState("idle");
    setLoadingStepIndex(0);

    setFileSummary({
      name: file.name,
      sizeLabel: formatFileSize(file.size),
      mimeType: file.type.replace("image/", "").toUpperCase(),
    });

    try {
      const image = await loadImageElement(file);
      setImageDimensions(`${image.width} × ${image.height}`);
      setImageHint(buildUploadHint(image.width, image.height, file.size));
    } catch {
      setImageDimensions("");
      setImageHint("图片已选择成功，如有需要你仍可直接开始解读。");
    }
  }

  const handleWindowPaste = useEffectEvent(async (event: ClipboardEvent) => {
    if (state === "analyzing") {
      return;
    }

    const activeElement = document.activeElement;
    const isTypingTarget =
      activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;

    if (isTypingTarget) {
      return;
    }

    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => ACCEPTED_IMAGE_TYPES.includes(item.type));

    if (!imageItem) {
      return;
    }

    const file = imageItem.getAsFile();
    if (!file) {
      return;
    }

    event.preventDefault();
    await applyFile(
      new File([file], `clipboard-${Date.now()}.${file.type === "image/png" ? "png" : "jpg"}`, {
        type: file.type,
        lastModified: Date.now(),
      }),
    );
  });

  useEffect(() => {
    window.addEventListener("paste", handleWindowPaste);

    return () => {
      window.removeEventListener("paste", handleWindowPaste);
    };
  }, []);

  async function handleAnalyze() {
    if (!selectedFile) {
      setState("error");
      setNotice({
        tone: "error",
        text: "请先上传一张情绪轮盘图片，再开始解读。",
      });
      return;
    }

    requestControllerRef.current?.abort();

    const controller = new AbortController();
    requestControllerRef.current = controller;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    setLoadingStepIndex(0);
    setState("analyzing");
    setReport(null);
    setNotice({
      tone: "info",
      text: "系统正在读取颜色、线条、中心区域和分区细节，请稍候。",
    });

    try {
      const optimized = await optimizeImage(selectedFile);
      const formData = new FormData();
      formData.append("image", optimized.file);
      formData.append("nickname", sanitizeNickname(nickname));
      formData.append("feeling", sanitizeFeeling(feeling));

      const response = await fetch("/api/analyze-wheel", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ErrorResponse | null;
        throw new Error(payload?.error || "解读失败，请稍后再试。");
      }

      const nextReport = (await response.json()) as EmotionWheelReport;
      clearTimeout(timeoutId);
      requestControllerRef.current = null;

      startTransition(() => {
        setReport(nextReport);
        setState("ready");
        setNotice({
          tone: "success",
          text: "报告已生成，已为你整理成适合课堂展示与导出的版式。",
        });
      });

      scrollToReport();
    } catch (error) {
      clearTimeout(timeoutId);
      requestControllerRef.current = null;

      if (error instanceof DOMException && error.name === "AbortError") {
        setState("idle");
        setNotice({
          tone: timedOut ? "error" : "info",
          text: timedOut
            ? "本次解读等待时间过长，建议换一张更清晰的照片后再试。"
            : "本次解读已取消，你可以重新调整图片后再次提交。",
        });
        return;
      }

      setState("error");
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "解读失败，请稍后再试。",
      });
    }
  }

  async function handleClipboardUpload() {
    if (!clipboardSupported) {
      setState("error");
      setNotice({
        tone: "error",
        text: "当前浏览器暂不支持直接读取剪贴板图片，请改用上传。",
      });
      return;
    }

    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => ACCEPTED_IMAGE_TYPES.includes(type));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        await applyFile(
          new File(
            [blob],
            `clipboard-${Date.now()}.${imageType === "image/png" ? "png" : "jpg"}`,
            {
              type: imageType,
              lastModified: Date.now(),
            },
          ),
        );
        return;
      }

      setState("error");
      setNotice({
        tone: "error",
        text: "剪贴板里暂时没有可用的图片，请复制截图后再试。",
      });
    } catch {
      setState("error");
      setNotice({
        tone: "error",
        text: "读取剪贴板失败，请改用拖拽或点击上传。",
      });
    }
  }

  async function handlePrintReport() {
    if (!report) {
      return;
    }

    const previousTitle = document.title;
    document.title = `${report.nickname || "匿名"}-情绪轮盘解读报告`;

    await document.fonts.ready;
    window.print();

    window.setTimeout(() => {
      document.title = previousTitle;
    }, 600);
  }

  const canAnalyze = !!selectedFile && state !== "analyzing";
  const activeLoadingStep = ANALYZING_STEPS[Math.min(loadingStepIndex, ANALYZING_STEPS.length - 1)];
  const progressPercentage = [18, 44, 72, 92][Math.min(loadingStepIndex, ANALYZING_STEPS.length - 1)];
  const reportSummary = useMemo(() => (report ? summarizeZones(report.zones) : null), [report]);

  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float-drift absolute left-[-6rem] top-24 h-52 w-52 rounded-full bg-rose-200/35 blur-3xl" />
        <div className="animate-float-drift absolute right-[-4rem] top-20 h-64 w-64 rounded-full bg-emerald-200/35 blur-3xl [animation-delay:1.2s]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
        <div className="absolute bottom-8 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-amber-100/55 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <section className="rounded-[2.25rem] border border-white/70 bg-[rgba(255,255,255,0.68)] px-5 py-6 shadow-[var(--shadow-soft)] backdrop-blur-xl md:px-8 md:py-8">
          <div className="grid gap-8 xl:grid-cols-[1.16fr_0.84fr]">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center rounded-full border border-rose-100 bg-rose-50 px-4 py-2 text-xs font-semibold tracking-[0.2em] text-rose-700 uppercase">
                  Emotion Wheel Lab
                </span>
                <span className="rounded-full border border-white/70 bg-white/80 px-3 py-2 text-xs text-slate-500">
                  课堂现场友好 · 浏览器即开即用
                </span>
              </div>

              <div className="space-y-4">
                <p className="font-display text-3xl leading-none text-slate-700 sm:text-4xl">
                  Hear The Inner Weather
                </p>
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                  上传你的绘画，
                  <span className="block bg-gradient-to-r from-slate-900 via-emerald-700 to-cyan-700 bg-clip-text text-transparent">
                    聆听内心的声音。
                  </span>
                </h1>
                <p className="max-w-3xl text-base leading-8 text-slate-600 sm:text-lg">
                  这是一个为课程现场、自我觉察与温柔交流设计的网页工具。上传标准情绪轮盘画作后，系统会围绕固定的
                  8 个分区，生成一份结构化、支持性、非诊断的中文报告，并支持直接导出为
                  PDF。
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                {PROCESS_STEPS.map((step) => (
                  <ProcessCard
                    key={step.index}
                    index={step.index}
                    title={step.title}
                    description={step.description}
                  />
                ))}
              </div>

              <div className="grid gap-4 2xl:grid-cols-[1.08fr_0.92fr]">
                <article className="rounded-[1.8rem] border border-white/75 bg-white/78 p-5 shadow-[0_18px_42px_rgba(214,194,173,0.12)] backdrop-blur">
                  <div className="flex flex-col gap-5 sm:flex-row">
                    <div className="w-full max-w-[240px] rounded-[1.4rem] border border-rose-100 bg-[radial-gradient(circle_at_top,_rgba(255,243,236,0.95),_rgba(255,255,255,0.95)_70%)] p-3 shadow-sm">
                      <Image
                        src="/emotion-wheel-template.svg"
                        alt="标准情绪轮盘示意图"
                        width={240}
                        height={240}
                        className="mx-auto h-auto w-full"
                        priority
                      />
                    </div>

                    <div className="flex-1 space-y-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                          活动说明
                        </p>
                        <h2 className="mt-2 text-xl font-semibold text-slate-900">
                          标准模板 + 自由绘画 + 结构化解读
                        </h2>
                        <p className="mt-2 text-sm leading-7 text-slate-600">
                          你可以在标准轮盘模板中自由使用颜色和图案表达感受，系统会优先读取分区里的绘画痕迹、中心区域、留白和整体节奏，而不是只看模板文字。
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {[
                          "愿望",
                          "温暖",
                          "希望",
                          "恐惧",
                          "未知",
                          "激动",
                          "注视",
                          "忽视",
                        ].map((zone) => (
                          <span
                            key={zone}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
                          >
                            {zone}
                          </span>
                        ))}
                      </div>

                      <div className="rounded-[1.3rem] border border-amber-100 bg-amber-50/80 p-4 text-sm leading-7 text-amber-900">
                        轮盘中心也可以自由绘画。若照片角度过斜、轮盘边界缺失、局部模糊或反光严重，系统会主动降低确定性并提示补拍。
                      </div>
                    </div>
                  </div>
                </article>

                <article className="rounded-[1.8rem] border border-white/75 bg-[linear-gradient(180deg,rgba(236,251,244,0.92),rgba(255,255,255,0.86))] p-5 shadow-[0_18px_42px_rgba(186,216,200,0.12)] backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                    上传前检查
                  </p>
                  <div className="mt-4 space-y-3">
                    {PHOTO_TIPS.map((tip, index) => (
                      <div
                        key={tip}
                        className="rounded-[1.2rem] border border-white/80 bg-white/80 px-4 py-3 text-sm leading-7 text-slate-700"
                      >
                        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
                          {index + 1}
                        </span>
                        {tip}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-[1.2rem] border border-slate-200 bg-white/80 px-4 py-3 text-sm leading-7 text-slate-600">
                    报告仅供自我觉察与课程讨论参考，非医疗或心理诊断建议。图片只用于本次解读，不做历史留存。
                  </div>
                </article>
              </div>
            </div>

            <section className="rounded-[2rem] border border-white/75 bg-[rgba(255,255,255,0.84)] p-5 shadow-[0_18px_48px_rgba(191,203,193,0.14)] backdrop-blur-xl md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    上传与解读
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">一个顺手、自然的使用流程</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    上传成功后会立即预览原图；点击开始解读时，系统会先自动优化图片，再进入双模型分析流程。
                  </p>
                </div>
                <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                  {selectedFile ? (state === "analyzing" ? "分析中" : "准备就绪") : "等待上传"}
                </span>
              </div>

              <div className="mt-6 space-y-5">
                <div
                  role="button"
                  tabIndex={0}
                  aria-busy={state === "analyzing"}
                  className={`relative overflow-hidden rounded-[1.75rem] border-2 border-dashed transition ${
                    dragging
                      ? "border-emerald-400 bg-emerald-50/90"
                      : "border-rose-200 bg-[linear-gradient(180deg,rgba(255,247,245,0.95),rgba(255,255,255,0.95))]"
                  } ${state === "analyzing" ? "pointer-events-none opacity-85" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (state !== "analyzing") {
                      setDragging(true);
                    }
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    const file = event.dataTransfer.files?.[0];
                    if (file) {
                      void applyFile(file);
                    }
                  }}
                  onClick={() => {
                    if (state !== "analyzing") {
                      inputRef.current?.click();
                    }
                  }}
                  onKeyDown={(event) => {
                    if ((event.key === "Enter" || event.key === " ") && state !== "analyzing") {
                      event.preventDefault();
                      inputRef.current?.click();
                    }
                  }}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPTED_EXTENSIONS}
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void applyFile(file);
                      }
                    }}
                  />

                  {!previewUrl ? (
                    <div className="flex min-h-[290px] flex-col items-center justify-center gap-5 px-6 py-10 text-center">
                      <div className="flex h-18 w-18 items-center justify-center rounded-full bg-rose-100/90 text-3xl shadow-sm">
                        🎨
                      </div>
                      <div className="space-y-2">
                        <p className="text-xl font-semibold text-slate-900">拖拽图片到这里，或点击上传</p>
                        <p className="mx-auto max-w-md text-sm leading-7 text-slate-600">
                          支持 JPG / PNG，小于 10MB。建议使用拍摄完整、正面、清晰的标准轮盘照片。
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 text-xs text-slate-500">
                        <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1.5">
                          拖拽上传
                        </span>
                        <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1.5">
                          点击选择
                        </span>
                        <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1.5">
                          桌面端粘贴截图
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 p-4">
                      <div className="overflow-hidden rounded-[1.35rem] border border-white/80 bg-white">
                        <Image
                          src={previewUrl}
                          alt="已上传画作预览"
                          width={960}
                          height={960}
                          className="h-auto max-h-[360px] w-full object-contain"
                          unoptimized
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                          {fileSummary ? (
                            <>
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                                {fileSummary.mimeType}
                              </span>
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                                {fileSummary.sizeLabel}
                              </span>
                            </>
                          ) : null}
                          {imageDimensions ? (
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                              {imageDimensions}
                            </span>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                          onClick={(event) => {
                            event.stopPropagation();
                            resetSession({ preserveIdentity: true });
                          }}
                        >
                          更换图片
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {fileSummary ? (
                  <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/85 px-4 py-4 text-sm leading-7 text-slate-600">
                    <p className="font-medium text-slate-800">已选择：{fileSummary.name}</p>
                    <p className="mt-1">{imageHint}</p>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-[0.88fr_1.12fr]">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">昵称（默认匿名）</span>
                    <input
                      value={nickname}
                      onChange={(event) => setNickname(event.target.value.slice(0, NICKNAME_MAX_LENGTH))}
                      maxLength={NICKNAME_MAX_LENGTH}
                      placeholder="例如：小林"
                      className="w-full rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                    />
                    <span className="block text-right text-xs text-slate-400">
                      {nickname.length}/{NICKNAME_MAX_LENGTH}
                    </span>
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">一句话当前感受（选填）</span>
                    <textarea
                      value={feeling}
                      onChange={(event) => setFeeling(event.target.value.slice(0, FEELING_MAX_LENGTH))}
                      maxLength={FEELING_MAX_LENGTH}
                      rows={3}
                      placeholder="例如：今天有点期待，也有点乱"
                      className="w-full rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                    />
                    <span className="block text-right text-xs text-slate-400">
                      {feeling.length}/{FEELING_MAX_LENGTH}
                    </span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={!canAnalyze}
                    onClick={handleAnalyze}
                    className="inline-flex min-w-[196px] items-center justify-center rounded-full bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {state === "analyzing" ? "AI 正在温柔解读你的情绪…" : "开始解读"}
                  </button>

                  {state === "analyzing" ? (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      onClick={() => {
                        requestControllerRef.current?.abort();
                      }}
                    >
                      取消本次解读
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        onClick={() => resetSession()}
                      >
                        重新上传新作品
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        onClick={() => resetSession({ preserveIdentity: false })}
                      >
                        清空本页
                      </button>
                    </>
                  )}

                  {clipboardSupported ? (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-5 py-3.5 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
                      onClick={handleClipboardUpload}
                    >
                      粘贴截图上传
                    </button>
                  ) : null}
                </div>

                {state === "analyzing" ? (
                  <div
                    aria-live="polite"
                    className="rounded-[1.4rem] border border-emerald-100 bg-[linear-gradient(180deg,rgba(236,253,245,0.95),rgba(255,255,255,0.92))] px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-emerald-900">{activeLoadingStep.title}</p>
                        <p className="mt-1 text-sm leading-7 text-emerald-800/85">
                          {activeLoadingStep.detail}
                        </p>
                      </div>
                      <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-emerald-700">
                        {progressPercentage}%
                      </span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-emerald-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 transition-all duration-700"
                        style={{ width: `${progressPercentage}%` }}
                      />
                    </div>
                    <p className="mt-3 text-xs leading-6 text-emerald-900/80">
                      课程现场多人一起使用时，解读通常在 10-40 秒内完成。期间请不要重复提交。
                    </p>
                  </div>
                ) : null}

                {notice ? (
                  <div
                    aria-live="polite"
                    className={`rounded-[1.3rem] border px-4 py-4 text-sm leading-7 ${noticeClass(notice.tone)}`}
                  >
                    {notice.text}
                  </div>
                ) : null}

                <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/85 px-4 py-4 text-sm leading-7 text-slate-600">
                  图片只用于本次解读，不做历史记录或云端留存。若你想长期保存，可在报告生成后直接使用“保存为
                  PDF”导出。
                </div>
              </div>
            </section>
          </div>
        </section>

        {report ? (
          <section
            id="report-section"
            className="print-root animate-fade-up mt-8 rounded-[2.1rem] border border-white/70 bg-[rgba(255,255,255,0.84)] px-5 py-6 shadow-[var(--shadow-soft)] backdrop-blur-xl md:px-8 md:py-8 print:mt-0 print:rounded-none print:border-none print:bg-white print:px-0 print:py-0 print:shadow-none"
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                  Emotion Wheel Report
                </p>
                <h2 className="mt-2 text-3xl font-semibold text-slate-900 sm:text-[2.1rem]">
                  你的情绪轮盘解读报告
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                  <span>生成时间：{formatDate(report.generatedAt)}</span>
                  <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:inline-block" />
                  <span>昵称：{report.nickname || "匿名"}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {reportSummary ? (
                  <>
                    <span className="rounded-full border border-white/80 bg-white/80 px-4 py-2 text-sm text-slate-700">
                      已识别绘画分区 {reportSummary.paintedCount}
                    </span>
                    <span className="rounded-full border border-white/80 bg-white/80 px-4 py-2 text-sm text-slate-700">
                      留白分区 {reportSummary.blankCount}
                    </span>
                    <span className="rounded-full border border-white/80 bg-white/80 px-4 py-2 text-sm text-slate-700">
                      谨慎判断 {reportSummary.unclearCount}
                    </span>
                  </>
                ) : null}
                <button
                  type="button"
                  className="no-print inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  onClick={handlePrintReport}
                >
                  保存为 PDF
                </button>
              </div>
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
                <div className="card-break overflow-hidden rounded-[1.6rem] border border-white/80 bg-white shadow-[0_14px_36px_rgba(211,197,180,0.12)]">
                  {previewUrl ? (
                    <Image
                      src={previewUrl}
                      alt="轮盘原图"
                      width={960}
                      height={960}
                      className="h-auto w-full object-contain"
                      unoptimized
                    />
                  ) : null}
                </div>

                <div className="card-break rounded-[1.6rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.92))] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    识别提示
                  </p>
                  <p className="mt-3 text-sm leading-7 text-slate-700">{report.qualityNotice}</p>
                </div>

                <div className="card-break rounded-[1.6rem] border border-amber-100 bg-amber-50/85 p-5 text-sm leading-7 text-amber-900">
                  <p className="font-semibold">报告说明</p>
                  <p className="mt-2">{report.disclaimer}</p>
                </div>
              </aside>

              <div className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                  <article className="card-break rounded-[1.6rem] border border-white/80 bg-[linear-gradient(135deg,rgba(255,245,242,0.95),rgba(255,255,255,0.92))] p-5 shadow-[0_16px_36px_rgba(218,195,174,0.12)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">
                      整体视觉印象
                    </p>
                    <p className="mt-4 text-base leading-8 text-slate-700">{report.overallImpression}</p>
                  </article>

                  <article className="card-break rounded-[1.6rem] border border-white/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(255,255,255,0.92))] p-5 shadow-[0_16px_36px_rgba(188,214,200,0.12)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                      中心与整体能量
                    </p>
                    <p className="mt-4 text-sm leading-8 text-slate-700">{report.centerReflection}</p>
                  </article>
                </div>

                {reportSummary?.painted.length ? (
                  <section className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-2xl font-semibold text-slate-900">重点分区解读</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          优先展示有明显绘画痕迹的分区，便于课堂讨论和对照查看。
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {reportSummary.painted.map((zone) => (
                        <ZoneCard key={zone.name} zone={zone} />
                      ))}
                    </div>
                  </section>
                ) : null}

                {reportSummary?.quiet.length ? (
                  <article className="card-break rounded-[1.6rem] border border-white/80 bg-white p-5 shadow-[0_16px_36px_rgba(211,197,180,0.12)]">
                    <h3 className="text-2xl font-semibold text-slate-900">留白与谨慎区</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-500">
                      这些分区可能是留白、尚未触达，或当前照片不足以稳定判断的部分，它们同样值得被温柔看见。
                    </p>
                    <div className="mt-5 grid gap-3 lg:grid-cols-2">
                      {reportSummary.quiet.map((zone) => (
                        <div
                          key={zone.name}
                          className="card-break rounded-[1.25rem] border border-slate-200 bg-slate-50/85 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <h4 className="text-base font-semibold text-slate-900">{zone.name}区</h4>
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${zoneStatusClass(zone.status)}`}
                            >
                              {zoneStatusLabel(zone.status)}
                            </span>
                          </div>
                          <p className="mt-3 text-sm leading-7 text-slate-700">{zone.summary}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                ) : null}

                <div className="grid gap-6 lg:grid-cols-[0.96fr_1.04fr]">
                  <article className="card-break rounded-[1.6rem] border border-white/80 bg-white p-5 shadow-[0_16px_36px_rgba(211,197,180,0.12)]">
                    <h3 className="text-2xl font-semibold text-slate-900">关键元素分析</h3>
                    <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
                      {report.keyElements.map((item) => (
                        <li key={item} className="flex gap-3">
                          <span className="mt-2 h-2.5 w-2.5 rounded-full bg-rose-300" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </article>

                  <article className="card-break rounded-[1.6rem] border border-white/80 bg-white p-5 shadow-[0_16px_36px_rgba(211,197,180,0.12)]">
                    <h3 className="text-2xl font-semibold text-slate-900">综合情绪状态洞察</h3>
                    <p className="mt-4 text-sm leading-8 text-slate-700">{report.insight}</p>
                  </article>
                </div>

                <article className="card-break rounded-[1.6rem] border border-emerald-100 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(255,255,255,0.95))] p-5 shadow-[0_16px_36px_rgba(189,217,201,0.14)]">
                  <h3 className="text-2xl font-semibold text-slate-900">温暖建议与行动提示</h3>
                  <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
                    {report.suggestions.map((item) => (
                      <li key={item} className="flex gap-3">
                        <span className="mt-2 h-2.5 w-2.5 rounded-full bg-emerald-400" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              </div>
            </div>

            <div className="no-print mt-8 flex flex-wrap items-center justify-between gap-4 rounded-[1.6rem] border border-white/80 bg-white/84 px-4 py-4 text-sm leading-7 text-slate-600">
              <p>每一幅画都值得被认真阅读。如果你愿意，可以重新上传一张新的作品，观察此刻是否有了新的变化。</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  onClick={() => resetSession()}
                >
                  重新上传新作品
                </button>
                <button
                  type="button"
                  className="rounded-full bg-slate-900 px-4 py-2 font-semibold text-white transition hover:bg-slate-800"
                  onClick={handlePrintReport}
                >
                  导出这份报告
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
