"use client";

import Image from "next/image";
import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
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
  EmotionWheelReportZoneInsight,
  ErrorResponse,
  FileSummary,
  WheelZoneName,
} from "@/types/report";

const ACCEPTED_EXTENSIONS = ".jpg,.jpeg,.png";
const MAX_DIMENSION = 1680;
const TARGET_UPLOAD_BYTES = 2.2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 90_000;

const PROCESS_STEPS = [
  {
    index: "01",
    title: "上传轮盘作品",
    description: "支持拖拽、点击上传或粘贴图片，上传后会立刻看到预览。",
  },
  {
    index: "02",
    title: "AI智能解读",
    description: "系统会分析 8 个分区里的颜色与图案，生成温暖、具体的个性化报告。",
  },
  {
    index: "03",
    title: "导出解读报告",
    description: "报告生成后可一键打印或保存为 PDF，适合展示、分享与回顾。",
  },
] as const;

const ANALYZING_STEPS = [
  {
    title: "已收到作品",
    detail: "系统正在检查图片清晰度，并确认轮盘是否完整进入画面。",
  },
  {
    title: "正在识别画面",
    detail: "系统正在读取颜色、图案、留白和每个分区里的主要线索。",
  },
  {
    title: "正在生成报告",
    detail: "系统正在整理一份温暖、具体、适合回看的中文解读。",
  },
  {
    title: "正在完成校验",
    detail: "系统正在完成最后校对，并准备导出版式。",
  },
] as const;

const PHOTO_TIPS = [
  "尽量正面拍摄，完整拍到轮盘外边界。",
  "保持光线均匀，减少阴影、反光和局部过曝。",
  "如果画面里有文字、符号或细节，请尽量让它们保持清晰。",
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
  杂乱: {
    card: "from-sky-50 via-white to-indigo-50",
    accent: "text-sky-700",
    dot: "bg-sky-400",
  },
  激动: {
    card: "from-violet-50 via-white to-fuchsia-50",
    accent: "text-violet-700",
    dot: "bg-violet-400",
  },
  期待: {
    card: "from-orange-50 via-white to-yellow-50",
    accent: "text-orange-700",
    dot: "bg-orange-400",
  },
  注视: {
    card: "from-fuchsia-50 via-white to-pink-50",
    accent: "text-fuchsia-700",
    dot: "bg-fuchsia-400",
  },
};

type NoticeTone = "info" | "error" | "success";

interface NoticeState {
  tone: NoticeTone;
  text: string;
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
  const minSide = Math.max(1, Math.min(width, height));
  const aspectRatio = maxSide / minSide;

  if (maxSide < 900) {
    return "图片分辨率偏小，建议换一张更清晰的原图，能更稳地看见分区与细节。";
  }

  if (aspectRatio > 1.8) {
    return "这张图片比例偏长，请确认轮盘主体是否完整入镜，避免只拍到局部。";
  }

  if (fileSize > 4 * 1024 * 1024) {
    return "图片体积较大，系统会先自动压缩后再上传，通常不会影响主要解读质量。";
  }

  return "这张图片的基础尺寸和比例看起来可用，继续保持正面、无遮挡、光线均匀的拍摄方式会更稳。";
}

function isLikelyMobileExportEnvironment() {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent.toLowerCase();
  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;

  return (
    /android|iphone|ipad|ipod|mobile|micromessenger|qqbrowser|qq\//.test(userAgent) ||
    (coarsePointer && window.innerWidth < 1100)
  );
}

function buildPdfFileName(nickname: string) {
  const baseName = (nickname || "匿名").trim().replace(/[\\/:*?"<>|]/g, "_");
  return `${baseName || "匿名"}-情绪轮盘解读报告.pdf`;
}

async function waitForLayoutStability() {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

async function deliverPdfBlob(blob: Blob, filename: string) {
  const pdfFile = new File([blob], filename, { type: "application/pdf" });

  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      if (navigator.canShare?.({ files: [pdfFile] })) {
        await navigator.share({
          files: [pdfFile],
          title: filename,
          text: "情绪轮盘解读报告",
        });

        return "shared" as const;
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        throw error;
      }
    }
  }

  const blobUrl = URL.createObjectURL(blob);

  try {
    if (isLikelyMobileExportEnvironment()) {
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      return "previewed" as const;
    }

    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();

    return "downloaded" as const;
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }
}

async function exportElementAsPdf(element: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  await waitForLayoutStability();

  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    imageTimeout: 0,
    logging: false,
    scale: Math.min(window.devicePixelRatio || 1, 2),
    useCORS: true,
    windowWidth: document.documentElement.clientWidth,
    onclone: (clonedDocument) => {
      clonedDocument.body.style.background = "#ffffff";
      clonedDocument.documentElement.style.background = "#ffffff";

      clonedDocument.querySelectorAll<HTMLElement>(".no-print").forEach((node) => {
        node.style.display = "none";
      });

      const clonedRoot = clonedDocument.getElementById("report-section");
      if (clonedRoot instanceof HTMLElement) {
        clonedRoot.classList.remove("animate-fade-up");
        clonedRoot.style.marginTop = "0";
        clonedRoot.style.boxShadow = "none";
      }
    },
  });

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const printableWidth = pageWidth - margin * 2;
  const printableHeight = pageHeight - margin * 2;
  const pixelsPerMillimeter = canvas.width / printableWidth;
  const pageHeightPixels = Math.max(1, Math.floor(printableHeight * pixelsPerMillimeter));

  // Split the captured report into A4-height slices so long reports export cleanly on mobile.
  for (let offsetY = 0, pageIndex = 0; offsetY < canvas.height; offsetY += pageHeightPixels, pageIndex += 1) {
    const sliceHeightPixels = Math.min(pageHeightPixels, canvas.height - offsetY);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeightPixels;

    const pageContext = pageCanvas.getContext("2d");
    if (!pageContext) {
      throw new Error("当前浏览器暂时无法生成 PDF，请换一个浏览器后再试。");
    }

    pageContext.fillStyle = "#ffffff";
    pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    pageContext.drawImage(
      canvas,
      0,
      offsetY,
      canvas.width,
      sliceHeightPixels,
      0,
      0,
      canvas.width,
      sliceHeightPixels,
    );

    if (pageIndex > 0) {
      pdf.addPage();
    }

    pdf.addImage(
      pageCanvas.toDataURL("image/jpeg", 0.96),
      "JPEG",
      margin,
      margin,
      printableWidth,
      sliceHeightPixels / pixelsPerMillimeter,
      undefined,
      "FAST",
    );
  }

  return deliverPdfBlob(pdf.output("blob"), filename);
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

function ZoneCard({ zone }: { zone: EmotionWheelReportZoneInsight }) {
  const tone = ZONE_STYLES[zone.zone_name];

  return (
    <article
      className={`card-break rounded-[1.5rem] border border-white/80 bg-gradient-to-br ${tone.card} p-4 shadow-[0_14px_38px_rgba(210,194,176,0.12)]`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-1 h-3 w-3 rounded-full ${tone.dot}`} />
        <div>
          <h4 className={`text-lg font-semibold ${tone.accent}`}>{zone.zone_name}区</h4>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">Emotion Insight</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-7 text-slate-700">{zone.insight}</p>
    </article>
  );
}

export function EmotionWheelTool() {
  const [nickname, setNickname] = useState("");
  const [feeling, setFeeling] = useState("");
  const [state, setState] = useState<AnalyzeState>("idle");
  const [isExportingPdf, setIsExportingPdf] = useState(false);
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
    const file = imageItem?.getAsFile();

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

  const activeLoadingStep = ANALYZING_STEPS[Math.min(loadingStepIndex, ANALYZING_STEPS.length - 1)];
  const progressPercentage = [18, 46, 74, 92][Math.min(loadingStepIndex, ANALYZING_STEPS.length - 1)];
  const canAnalyze = Boolean(selectedFile) && state !== "analyzing";

  const reportSummary = useMemo(() => {
    if (!report) {
      return null;
    }

    return {
      paintedCount: report.header.identified_zones,
      blankCount: report.header.blank_zones,
      cautionCount: report.header.caution,
      zones: report.zone_insights,
    };
  }, [report]);

  function scrollToReport() {
    window.setTimeout(() => {
      document.getElementById("report-section")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
  }

  function openUploadDialog() {
    if (state !== "analyzing") {
      inputRef.current?.click();
    }
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
      text: "系统正在轻轻阅读你的作品，请稍候。",
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
          text: "报告已经生成好了，你现在可以直接阅读，也可以保存为 PDF。",
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

  async function handlePrintReport(filename: string) {
    if (!report) {
      return;
    }

    const previousTitle = document.title;
    document.title = filename.replace(/\.pdf$/i, "");

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    window.print();

    window.setTimeout(() => {
      document.title = previousTitle;
    }, 600);
  }

  async function handleExportReport() {
    if (!report || isExportingPdf) {
      return;
    }

    const filename = buildPdfFileName(report.header.nickname || "匿名");
    const shouldGeneratePdf = isLikelyMobileExportEnvironment();

    setIsExportingPdf(true);
    setNotice({
      tone: "info",
      text: shouldGeneratePdf
        ? "正在生成 PDF，请稍候，完成后会自动打开保存或分享入口。"
        : "正在准备导出内容，系统会唤起浏览器打印面板。",
    });

    try {
      if (!shouldGeneratePdf) {
        await handlePrintReport(filename);
        setNotice({
          tone: "success",
          text: "打印面板已经打开，你可以直接选择“另存为 PDF”。",
        });
        return;
      }

      const reportElement = document.getElementById("report-section");
      if (!(reportElement instanceof HTMLElement)) {
        throw new Error("报告区域还没有准备好，请稍候再试。");
      }

      const delivery = await exportElementAsPdf(reportElement, filename);
      setNotice({
        tone: "success",
        text:
          delivery === "shared"
            ? "PDF 已准备好，系统分享面板已经打开。"
            : delivery === "previewed"
              ? "PDF 已生成，浏览器会尝试打开预览页；若已打开，可在系统菜单里保存或分享。"
              : "PDF 已生成并开始下载。",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "导出失败，请稍后再试。",
      });
    } finally {
      setIsExportingPdf(false);
    }
  }

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
                <span className="inline-flex items-center rounded-full border border-orange-100 bg-orange-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">
                  Emotion Wheel Lab
                </span>
                <span className="rounded-full border border-white/70 bg-white/80 px-3 py-2 text-xs text-slate-500">
                  课堂现场友好 · 浏览器即开即用
                </span>
              </div>

              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700">
                  Emotion Wheel Portrait
                </p>
                <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 sm:text-[3.6rem]">
                  上传你的情绪轮盘画作，
                  <span className="font-display italic text-emerald-800">聆听内心的声音</span>
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
                  用颜色、符号、线条和图案，把此刻的感受轻轻放进轮盘里。上传作品后，你会收到一份温柔、具体、适合回看的解读报告。
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
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
                          你可以自由使用颜色、符号、线条和图案表达感受。系统会围绕固定的 8 个分区，优先读取分区里的绘画痕迹、留白和整体节奏，生成一份更容易理解和回看的报告。
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {["愿望", "温暖", "希望", "恐惧", "杂乱", "激动", "期待", "注视"].map((zone) => (
                          <span
                            key={zone}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
                          >
                            {zone}
                          </span>
                        ))}
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
                    上传图片后立刻预览 → 点击开始解读 → 系统自动生成解读报告 → 支持一键导出 PDF。
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
                    openUploadDialog();
                  }}
                  onKeyDown={(event) => {
                    if ((event.key === "Enter" || event.key === " ") && state !== "analyzing") {
                      event.preventDefault();
                      openUploadDialog();
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

                  {previewUrl ? (
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
                  ) : (
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
                        <button
                          type="button"
                          className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                          onClick={(event) => {
                            event.stopPropagation();
                            openUploadDialog();
                          }}
                        >
                          上传
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
                    onClick={() => void handleAnalyze()}
                    className="inline-flex min-w-[196px] items-center justify-center rounded-full bg-[linear-gradient(135deg,#f08f74,#eda985)] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(240,143,116,0.24)] transition hover:brightness-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
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
                        onClick={() => resetSession({ preserveIdentity: false })}
                      >
                        清空本页
                      </button>
                    </>
                  )}
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
                      大多数情况下，解读会在 10-40 秒内完成。等待时不需要重复点击。
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
                  图片只用于本次解读，不做历史记录或云端留存。若你想长期保存，可在报告生成后直接使用“保存为 PDF”导出。
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
                  {report.header.title}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                  <span>生成时间：{report.header.generate_time}</span>
                  <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:inline-block" />
                  <span>昵称：{report.header.nickname || "匿名"}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <span className="rounded-full border border-white/80 bg-white/80 px-4 py-2 text-sm text-slate-700">
                  已识别分区 {report.header.identified_zones}/8
                </span>
                <span className="rounded-full border border-white/80 bg-white/80 px-4 py-2 text-sm text-slate-700">
                  留白分区 {report.header.blank_zones}
                </span>
                <span className="rounded-full border border-white/80 bg-white/80 px-4 py-2 text-sm text-slate-700">
                  谨慎判断 {report.header.caution}
                </span>
                <button
                  type="button"
                  className="no-print inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  onClick={() => void handleExportReport()}
                  disabled={isExportingPdf}
                >
                  {isExportingPdf ? "正在导出..." : "保存为 PDF"}
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
                  <p className="mt-3 text-sm leading-7 text-slate-700">{report.recognition_note}</p>
                </div>

                <div className="card-break rounded-[1.6rem] border border-amber-100 bg-amber-50/85 p-5 text-sm leading-7 text-amber-900">
                  <p className="font-semibold">报告说明</p>
                  <p className="mt-2">{report.disclaimer}</p>
                </div>
              </aside>

              <div className="space-y-6">
                <article className="card-break rounded-[1.6rem] border border-white/80 bg-[linear-gradient(135deg,rgba(255,245,242,0.95),rgba(255,255,255,0.92))] p-5 shadow-[0_16px_36px_rgba(218,195,174,0.12)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">
                    整体视觉印象
                  </p>
                  <p className="mt-4 text-base leading-8 text-slate-700">{report.overall_impression}</p>
                </article>

                <section className="space-y-4">
                  <div>
                    <h3 className="text-2xl font-semibold text-slate-900">重点分区解读</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      仅展示已经出现明显绘画痕迹的重点分区，其余留白和不清晰部分通过头部统计与识别提示共同说明。
                    </p>
                  </div>

                  {reportSummary?.zones.length ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {reportSummary.zones.map((zone) => (
                        <ZoneCard key={zone.zone_name} zone={zone} />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/85 p-5 text-sm leading-7 text-slate-600">
                      这次作品里暂时没有足够明显的重点分区可单独展开，报告会更多从整体画面、关键元素和留白节奏来理解这幅作品。
                    </div>
                  )}
                </section>

                <div className="grid gap-6 lg:grid-cols-[0.96fr_1.04fr]">
                  <article className="card-break rounded-[1.6rem] border border-white/80 bg-white p-5 shadow-[0_16px_36px_rgba(211,197,180,0.12)]">
                    <h3 className="text-2xl font-semibold text-slate-900">关键元素分析</h3>
                    <p className="mt-4 text-sm leading-8 text-slate-700">{report.key_elements}</p>
                  </article>

                  <article className="card-break rounded-[1.6rem] border border-white/80 bg-white p-5 shadow-[0_16px_36px_rgba(211,197,180,0.12)]">
                    <h3 className="text-2xl font-semibold text-slate-900">综合情绪状态洞察</h3>
                    <p className="mt-4 text-sm leading-8 text-slate-700">{report.comprehensive_insight}</p>
                  </article>
                </div>

                <article className="card-break rounded-[1.6rem] border border-emerald-100 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(255,255,255,0.95))] p-5 shadow-[0_16px_36px_rgba(189,217,201,0.14)]">
                  <h3 className="text-2xl font-semibold text-slate-900">温暖建议与行动提示</h3>
                  <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
                    {report.action_suggestions.map((item) => (
                      <li key={item} className="flex gap-3">
                        <span className="mt-2 h-2.5 w-2.5 rounded-full bg-emerald-400" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </article>

                <article className="card-break rounded-[1.6rem] border border-rose-100 bg-[linear-gradient(135deg,rgba(255,247,245,0.98),rgba(255,255,255,0.95))] p-5 shadow-[0_16px_36px_rgba(224,198,188,0.12)]">
                  <h3 className="text-2xl font-semibold text-slate-900">结尾鼓励</h3>
                  <p className="mt-4 text-sm leading-8 text-slate-700">{report.closing}</p>
                </article>
              </div>
            </div>

            <div className="no-print mt-8 flex flex-wrap items-center justify-end gap-4 rounded-[1.6rem] border border-white/80 bg-white/84 px-4 py-4 text-sm leading-7 text-slate-600">
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
                  className="rounded-full bg-slate-900 px-4 py-2 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  onClick={() => void handleExportReport()}
                  disabled={isExportingPdf}
                >
                  {isExportingPdf ? "正在导出..." : "导出这份报告"}
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
