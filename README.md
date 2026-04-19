# 情绪轮盘画作解读工具

一个基于 Next.js App Router 的情绪轮盘画作解读工具：

- 上传标准情绪轮盘画作
- 预览图片并填写昵称 / 当前感受
- 先调用 Gemini 多模态模型做视觉观察
- 再调用 Grok 生成结构化中文报告
- 响应式适配手机与桌面
- 使用浏览器打印保存为 PDF

## 技术栈

- Next.js 16
- React 19
- Tailwind CSS 4
- App Router Route Handler
- OpenAI 兼容网关调用
- Gemini `gemini-2.5-flash`
- Grok `grok-4-1-fast-non-reasoning`

## 本地启动

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

```bash
cp .env.example .env.local
```

在 `.env.local` 中填写：

```bash
LM_API_KEY=your_llm_gateway_key
LLM_API_BASE=https://aihubmix.com/v1
GEMINI_MODEL=gemini-2.5-flash
GROK_MODEL=grok-4-1-fast-non-reasoning
```

3. 启动开发服务

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 功能说明

- 固定 8 个分区名称：愿望、温暖、希望、恐惧、未知、激动、注视、忽视
- 上传限制：`jpg/png`，小于 `10MB`
- 服务端不保存图片与报告，只做当次分析
- 双模型链路：
  - `Gemini` 先输出结构化视觉观察结果
  - `Grok` 再基于观察结果生成最终报告
- 对网关做了结构化输出、响应格式降级和一次自动重试，提升课堂现场稳定性
- 报告结构：
  - 整体视觉印象
  - 分区情绪解读
  - 关键元素分析
  - 综合情绪状态洞察
  - 温暖建议与行动提示

## 验证命令

```bash
npm run lint
npm run build
```

## 部署

### 推荐方案：公网部署到 Vercel

如果课堂现场需要每个同学都能直接打开网页使用，最省心的做法是部署到 **Vercel**：

- Next.js 前后端一体，部署链路最短
- 给学生发一个公网链接即可进入
- 环境变量可直接在项目里配置
- 这个项目只有一个 API 路由，很适合 Vercel Functions 承载

环境变量：

- `LM_API_KEY`
- `LLM_API_BASE`
- `GEMINI_MODEL`（可选，默认 `gemini-2.5-flash`）
- `GROK_MODEL`（可选，默认 `grok-4-1-fast-non-reasoning`）
- `LLM_TIMEOUT_MS` / `GEMINI_TIMEOUT_MS` / `GROK_TIMEOUT_MS`（可选，默认 `45000`）

部署后前端页面和 `/api/analyze-wheel` 接口可一起工作。

### 备选方案

- **云服务器自托管**：适合后续要加账号、数据留存、教师后台和更细粒度日志监控。
- **教室局域网部署**：适合没有公网条件时临时使用，但手机接入和网络稳定性通常不如公网部署。

如果只是课堂现场多人访问和后续快速迭代，优先建议 Vercel；如果后面要扩成更重的业务系统，再迁到自有服务器会更合适。
