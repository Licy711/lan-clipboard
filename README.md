<div align="center">
  <img src="./public/logo.jpg" alt="PeerClip logo" width="112" style="border-radius:24px;background:#fff;padding:8px;box-shadow:0 8px 24px rgba(59,130,246,.25)" />
  <h1>PeerClip · 跨设备剪贴板同步</h1>
  <p>文本 &amp; 图片跨设备即时同步 · 房间制 + 设备审批 · 扫码秒进 · R2 预签名直传大图</p>
  <p>
    <a href="#-功能特性"><img src="https://img.shields.io/badge/✨-功能特性-2563eb?style=flat-square"/></a>
    <a href="#-技术栈"><img src="https://img.shields.io/badge/🛠-技术栈-16a34a?style=flat-square"/></a>
    <a href="#-快速开始"><img src="https://img.shields.io/badge/🚀-快速开始-d97706?style=flat-square"/></a>
    <a href="#%EF%B8%8F-部署到-vercel"><img src="https://img.shields.io/badge/☁️-Vercel部署-0ea5e9?style=flat-square"/></a>
    <a href="#-cloudflare-r2-图床配置"><img src="https://img.shields.io/badge/🪣-R2配置-f472b6?style=flat-square"/></a>
    <a href="#-english-version"><img src="https://img.shields.io/badge/🌐-English-64748b?style=flat-square"/></a>
  </p>
  <p><em>🇨🇳 中文 · <a href="#-english-version">🇬🇧 Jump to English</a></em></p>
</div>

---

> 一次部署，多端通用。把你的 PC、Mac、iPhone、Android、平板都拉进同一个「房间」，随手粘贴文本 / 图片，轮询 + 乐观更新保证秒出不闪烁，图片走 Cloudflare R2 预签名直传。

## ✨ 功能特性

- 🔗 **房间机制**：首次打开自动生成唯一房间号（URL 带 `?room=xxx`），分享 URL 或扫码即可加入
- 📱 **二维码进房间**：页面内置二维码，手机浏览器扫码秒进，不用手动输入房间号
- ✅ **设备审批**：第一个进入房间的设备自动成为管理员，其他新设备默认 `pending`，需要管理员手动 approve / reject，防止陌生人蹭房间
- 📝 **文本秒传**：任意一端输入 / 粘贴文本，所有已批准设备都能看到并一键复制到剪贴板
- 🖼️ **多图三维轮播**：支持一次选择多张图片，聊天窗口以 **卡片三维轮播** 形式展示（左右按钮/手势滑动/圆点跳转/中心卡全屏预览）
- 📎 **通用文件上传**：除图片外还支持任意类型文件（压缩包、文档、视频等），气泡内以文件卡片形式展示（类型图标 + 大小 + 下载按钮）
- 🌐 **R2 预签名直传**：上传先从后端拿 5 分钟有效的 **presigned PUT URL**，浏览器直接 PUT 到 Cloudflare R2
  - 绕开 Vercel Serverless Functions 4.5MB 请求体上限（图片 ≤ 10MB，文件 ≤ 50MB）
  - Access Key 永远只在 Vercel 服务器签名，不暴露给前端
- 🧹 **R2 生命周期自动清理**：可在 Cloudflare R2 控制台配置 **Object Lifecycle Rules**，自动删除 N 天前的文件，免费空间不爆仓
- 👀 **手机图片预览手势**：双击放大 / 双击还原、单指拖动平移、双指捏合缩放
- 💡 **发送不闪烁**：消息/图片发送采用「乐观更新 + 轮询按 id 合并」，不会出现「发送 → 消失 → 又出现」的跳动
- 🧹 **无变化不渲染**：轮询按 id 列表 + 长度比较，结果和上次一致直接跳过 `setState`，CPU / 渲染开销低
- 🤖 **设备在线状态**：30 秒无心跳自动踢掉线，设备列表实时干净
- 📦 **持久化**：房间消息 + 设备列表存 Redis，Vercel 冷重启不丢数据

## 🛠 技术栈

| 层 | 选型 | 版本 | 说明 |
|---|---|---|---|
| 框架 | **Next.js** | 16.x | App Router，前端页面 + API Routes 一体 |
| UI 库 | **React** | 19.x | Hooks + function component |
| 样式 | **Tailwind CSS** | v4 | `@tailwindcss/postcss`，原子化 CSS |
| 语言 | **TypeScript** | 5.x | 全链路类型安全 |
| 图标 | **lucide-react** | 1.x | 轻量 SVG 图标 |
| 二维码 | **qrcode.react** | 4.x | 纯前端渲染房间二维码 |
| 存储（会话+消息） | **Redis**（`ioredis`）| 6.x | 自建 / Upstash 都行 |
| 存储（图床）| **Cloudflare R2**（S3 兼容）| - | `@aws-sdk/client-s3` + `s3-request-presigner` |
| 部署 | **Vercel** | - | Serverless Functions + Edge Network |
| 其他 | `undici` / `form-data` | - | 历史兼容依赖（可按需移除）|

## 🚀 快速开始

### 前置要求

- Node.js **≥ 20**（Next 16 要求）
- npm / pnpm / yarn 任选
- 一个可访问的 Redis（本地 Docker 或者云 Redis 都行）
- 一个 Cloudflare 账号 + R2 存储桶（免费额度 10GB / 月，够用）

### 1. 克隆 & 安装依赖

```bash
git clone <你的仓库地址>
cd peerclip
npm install
```

### 2. 配置环境变量

复制模板并填写你自己的值：

```bash
cp .env.example .env.local
```

然后用编辑器打开 `.env.local`，按注释把 `REDIS_URL` 和 5 个 R2 变量填完整。具体怎么获取每一个值，见：

- [☁️ 部署到 Vercel](#%EF%B8%8F-部署到-vercel)
- [🪣 Cloudflare R2 图床配置](#-cloudflare-r2-图床配置)

### 3. 启动开发服务器

```bash
npm run dev
```

打开浏览器访问：[http://localhost:3000](http://localhost:3000)
首次打开会自动生成房间号，手机扫页面侧边栏的二维码即可加入。

### 4. 生产构建

```bash
npm run build
npm start
```

## 🔧 环境变量总览

> 所有变量都**必须**配置。没有任何默认值兜底，缺了会直接报错，防止误操作。

| 变量名 | 类型 | 必须 | 说明 | 示例（**不要直接抄**，换成你自己的）|
|---|---|---|---|---|
| `REDIS_URL` | string | ✅ | Redis 连接串（带密码）| `redis://:mypassword@1.2.3.4:6379` |
| `R2_ACCOUNT_ID` | string | ✅ | Cloudflare 账号 ID（32 位十六进制）| `f5736c29d5fccde4284c001b0cd4b54b` |
| `R2_ACCESS_KEY_ID` | string | ✅ | R2 API Token 的 Access Key ID | `550112...cc236` |
| `R2_SECRET_ACCESS_KEY` | string | ✅ | R2 API Token 的 Secret | `ab382a...57feb` |
| `R2_BUCKET` | string | ✅ | R2 桶名 | `lcv` |
| `R2_PUBLIC_DOMAIN` | string | ✅ | 桶的公网域名（**末尾不带 /**）| `https://pub-xxx.r2.dev` 或 `https://i.you.com` |

## ☁️ 部署到 Vercel

本项目 100% 为 Vercel Serverless 优化，推荐直接部署：

### 方式 A：一键 Import

1. 先把代码推到你自己的 GitHub 仓库（public / private 都行）
2. 登录 [Vercel Dashboard](https://vercel.com/new) → **Import** 你的仓库
3. Framework Preset：**Next.js**（Vercel 会自动识别）
4. Root Directory：`/`（保持默认）
5. Build Command：`next build`（默认）
6. **Environment Variables** 选项卡，按照 [🔧 环境变量总览](#-环境变量总览) 里的 6 个变量逐一添加，每个都勾选 `Production / Preview / Development` 三个环境
7. 点 **Deploy**，等 1~2 分钟构建完成

### 方式 B：Vercel CLI

```bash
npm i -g vercel
vercel           # 首次登录并部署到 Preview
vercel --prod    # 发布到生产
```

部署成功后，先在 **Vercel → Settings → Domains** 绑定你的自定义域名（例如 `lcv.odkkk.com`），绑定完成后用自定义域名访问即可。

## 🪣 Cloudflare R2 图床配置

这一步做 4 件事：**建桶 → 开公网访问 → 建 R2 API Token → 配 CORS**。

### 1. 建存储桶

1. Cloudflare 左侧菜单 → **R2** → **Create bucket**
2. Bucket name：写 `lcv`（或者其他，记得和 `R2_BUCKET` 变量一致）
3. 位置：Auto 即可
4. Create bucket

### 2. 开公网访问（必须做！不然图片别人看不了）

进入刚建好的桶 → **Settings** 标签 → 两种方式二选一：

- **方式 A · R2.dev 子域名（免域名，最快）**：
  在 `Public bucket access` 区域 → **Allow Access** → 系统会给你一个 `https://pub-<hash>.r2.dev`，填到 `R2_PUBLIC_DOMAIN`。

- **方式 B · 自定义域名（推荐，速度更快 + 可缓存规则）**：
  在 `Custom Domains` → **Connect Domain** → 填 `i.你的域名.com`，Cloudflare 会自动帮你配好 CNAME + SSL，解析生效后把 `https://i.你的域名.com` 填到 `R2_PUBLIC_DOMAIN`。

### 3. 建 R2 API Token（Access Key）

回到 R2 总览页（不要在桶内）→ **Manage R2 API Tokens** → **Create API Token**：

- **Token Name**：随意，比如 `peerclip-rw`
- **Permissions**：**Object Read & Write**（⚠️  **不要选 Admin Read & Write**，权限太大违反最小权限原则）
- **Specify bucket(s)**：**Only select buckets** → 只勾你刚才那个桶 `lcv`
- **TTL**：默认（不指定）即可
- 点 **Create API Token**

⚠️  **这一步只显示一次 Secret！立刻复制 `Access Key ID` 和 `Secret Access Key`，分别填到 `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`，关掉页面就再也看不到了。**

### 4. 配置 CORS 策略（⚠️  必须做！不然浏览器直传会被拦截）

进入桶 → **Settings** → 拉到 **CORS Policy** → **Add CORS policy** → 选 **JSON 编辑器**，粘贴（内容和上传报错时提示的完全一致）：

```
AllowedOrigins: ["*"]
AllowedMethods: ["GET","PUT","HEAD"]
AllowedHeaders: ["*"]
ExposeHeaders: ["ETag"]
MaxAgeSeconds: 3600
```

**Save policy**，等 30 秒生效。如果要严格限制来源，把 `AllowedOrigins` 改成只放行你的部署域名 + 本地调试：`["https://lcv.odkkk.com", "http://localhost:3000"]`。

### 5. （强烈推荐）配置 Object Lifecycle 自动清理文件（R2 免费空间不够用？每天自动删）

R2 免费版只有 10GB，PeerClip 会频繁上传图片/文件，时间久了会爆仓。用 **Lifecycle Rules** 让 Cloudflare 帮你自动删除 N 天前的文件，一劳永逸。

进入桶 → **Settings** → 找到 **Object Lifecycle Rules** → **Add rule**：

| 配置项 | 填什么 | 说明 |
|---|---|---|
| **Rule name** | `auto-delete-after-1-day`（或你喜欢的名字）| 一眼能看懂就行 |
| **Rule scope** | ✅ **Apply to all objects in bucket** | 全桶生效，简单粗暴 |
| **Action** | 勾选 **Expire current version of object**（过期删除当前版本） | 只要这一个动作 |
| **After (days from object creation)** | `1`（或你需要的天数，比如 `7`） | **上传后第 1 天自动删除** |

然后 **Create rule** 即可。规则创建后 24 小时内生效，Cloudflare 会在后台自动清理，不用你手动删，也不额外收费。

> 💡 小贴士：如果你想让重要文件保留得更久，可以把 **Rule scope** 改成 **Custom prefix**，然后为不同路径设置不同的过期天数。PeerClip 默认按 `YYYY/MM/DD/` 分目录存文件，你也可以针对具体日期前缀单独设置。

## 📱 使用方法

### 打开后会发生什么

1. 第一个打开 URL 的设备自动成为「房间创建者」，状态是 `approved`，可以管理其他设备
2. 把 URL **发给别人** 或 **让对方扫页面上的二维码** → 对方进入房间
3. 新设备状态默认为 `pending`，创建者的侧边栏会出现一个绿色 Approve 按钮
4. 点 Approve → 对方变成 `approved`，**之后双方发的消息/图片彼此才能看到**

### 发送文本

输入框打字 → 点蓝色 Send / 回车 → 立即发到房间所有已批准设备。
任意一条消息右侧的「复制」按钮可以一键复制到剪贴板。

### 发送图片

三种方式都可以：
- 点输入框右侧的 **图片图标** → 选本地文件
- 直接在页面内 **Ctrl+V / ⌘+V 粘贴截图**
- （PC 端 Chrome 权限允许时）点 **剪贴板图标** 自动读取系统剪贴板里的图片

选完图片后会先在输入框内显示预览 + 上传状态，上传完成后按 Send 即可发成图片消息。

### 图片预览

- **点图片** → 全屏预览
- **快速双击** → 在 1x / 2.5x 之间切换
- **放大后单指拖动** → 平移查看细节
- **双指捏合** → 0.5x ~ 8x 连续缩放
- **点空白处** → 退出预览

## 🏗 项目结构

```
peerclip/
├─ app/
│  ├─ page.tsx              ← 主页面（UI / 轮询 / 消息合并 / 手势 / 上传）
│  ├─ layout.tsx            ← Root Layout
│  ├─ globals.css           ← Tailwind 入口
│  ├─ favicon.ico
│  └─ api/
│     ├─ clipboard/route.ts ← GET 轮询（devices + messages）/ POST 心跳 发消息 审批
│     └─ upload/route.ts    ← R2 presigned PUT URL 生成（5min 有效）
├─ public/
│  └─ logo.jpg              ← 项目 Logo（README + 网页头部共用）
├─ .env.example             ← 环境变量模板（无密钥，clone 下来复制用）
├─ next.config.ts           ← Next 配置
├─ postcss.config.mjs
├─ eslint.config.mjs
├─ tsconfig.json
├─ package.json
└─ README.md
```

## ⚠️ 注意事项

1. **最小权限原则**：R2 API Token 一定要选 **Object Read & Write** 并**只授权给单个桶**；不要用 Account-wide / Admin 权限。
2. **密钥泄露急救**：如果你怀疑 `.env.local` 或 Redis 密码被提交到 GitHub，即使删了历史也要：
   - 立即去 Cloudflare R2 → **撤销旧 Token 并重新生成一套**
   - Redis 改密码（服务器 + Vercel env 同步更新）
   - 再执行 Git 历史清理
3. **Vercel Hobby 4.5MB**：本项目用了 presigned PUT URL 上传，所以完全绕开了 Vercel 的 body 限制，但 `@vercel/kv` / `Redis payload` 单条消息还是建议 < 1MB。
4. **HTTPS 环境**：Chrome 读取剪贴板 (`navigator.clipboard.read`) 只在 `https://` 或 `localhost` 生效。部署后必须用 HTTPS 域名（Vercel 自带，自定义域名也有免费证书）。
5. **不要把 .env.local commit**：已经被 `.gitignore` 忽略，放心填；如果看到 `git status` 里出现 `.env.local` 说明你动了 .gitignore，立刻 `git rm --cached .env.local`。

## 🤝 协议

MIT License. 随便用，随便改，Fork 到自己仓库里部署即可。

<br />

---

# 🌐 English Version

<p align="right"><em><a href="#readme">⬆ Back to Top · 返回顶部</a></em></p>

<div align="center">
  <h3>PeerClip · Cross-Device Clipboard Sync</h3>
  <p>Instant text &amp; image sharing across devices · room-based with device approval · QR-code onboarding · R2 presigned direct uploads for large images</p>
  <p>
    <a href="#-features"><img src="https://img.shields.io/badge/✨-Features-2563eb?style=flat-square"/></a>
    <a href="#-tech-stack"><img src="https://img.shields.io/badge/🛠-Tech_Stack-16a34a?style=flat-square"/></a>
    <a href="#-quick-start"><img src="https://img.shields.io/badge/🚀-Quick_Start-d97706?style=flat-square"/></a>
    <a href="#%EF%B8%8F-deploy-on-vercel"><img src="https://img.shields.io/badge/☁️-Deploy_Vercel-0ea5e9?style=flat-square"/></a>
    <a href="#-cloudflare-r2-image-storage"><img src="https://img.shields.io/badge/🪣-R2_Setup-f472b6?style=flat-square"/></a>
  </p>
</div>

---

> Deploy once, use everywhere. Drop your PC, Mac, iPhone, Android and tablet into the same **room**, paste text or images on any device and it appears on all the others. Images are uploaded directly to Cloudflare R2 via presigned URLs.

## ✨ Features

- 🔗 **Rooms**: each browser session auto-generates a unique room id in the URL (`?room=xxx`); share the link or the QR code to invite people.
- 📱 **QR-code onboarding**: the sidebar renders a QR for the current room so phones can join without typing the id.
- ✅ **Device approval**: the first device to open a room becomes the admin. Every new device lands in `pending` and must be **approved / rejected** by the admin before they can see or post anything — prevents strangers from joining accidentally.
- 📝 **Instant text sync**: type or paste text → every approved device sees it with a **one-click copy** button.
- 🖼️ **Multi-image 3D carousel**: select multiple images at once, they render inside a single chat bubble as a **3D card carousel** (arrow buttons / swipe gestures / dot indicators / center-card → full-screen preview).
- 📎 **Generic file upload**: not just images — send archives, docs, videos, anything. Files render as cards inside the bubble (type icon + size + download button).
- 🌐 **R2 presigned direct upload**: everything goes through a **two-step flow** — backend signs a 5-minute **presigned PUT URL** → the browser PUTs the file directly to Cloudflare R2.
  - Bypasses the Vercel Serverless **4.5 MB body limit** (images ≤ 10 MB, files ≤ 50 MB).
  - The R2 Access Key is **never exposed to the browser**, it only signs URLs server-side on Vercel.
- 🧹 **Auto-expire via R2 Lifecycle Rules**: free-tier R2 is only 10 GB. Configure **Object Lifecycle Rules** in the R2 dashboard so Cloudflare auto-deletes files older than N days — storage never fills up.
- 👀 **Touch gestures**: double-tap to zoom (1× ⇄ 2.5×), single-finger pan when zoomed, two-finger pinch from 0.5× to 8×.
- 💡 **No flicker on send**: optimistic insert + per-id poll-merging means you never see the "sent, disappears, re-appears" glitch.
- 🧹 **Skip re-renders when nothing changed**: the polling layer compares message id lists & length before calling `setState`, saving CPU and re-paints.
- 🤖 **Online/offline housekeeping**: devices that miss heartbeats for > 30 s are auto-pruned.
- 📦 **Persistence**: rooms, devices and messages live in Redis — survives Vercel cold restarts.

## 🛠 Tech Stack

| Layer | Choice | Version | Notes |
|---|---|---|---|
| Framework | **Next.js** | 16.x | App Router — pages + API Routes in one tree. |
| UI | **React** | 19.x | Hooks & function components. |
| Styling | **Tailwind CSS** | v4 | Atomic CSS via `@tailwindcss/postcss`. |
| Language | **TypeScript** | 5.x | End-to-end type safety. |
| Icons | **lucide-react** | 1.x | Lightweight SVG icon set. |
| QR codes | **qrcode.react** | 4.x | Pure client-side QR rendering. |
| Storage (sessions/messages) | **Redis** via `ioredis` | 6.x | Self-hosted or Upstash/Valkey. |
| Storage (images) | **Cloudflare R2** (S3-compatible) | — | `@aws-sdk/client-s3` + `s3-request-presigner`. |
| Hosting | **Vercel** | — | Serverless Functions + Edge Network. |
| Misc | `undici`, `form-data` | — | Legacy compat dependencies (safe to remove if unused). |

## 🚀 Quick Start

### Prerequisites

- Node.js **≥ 20** (required by Next 16).
- npm / pnpm / yarn — any works.
- A reachable Redis (Docker local or a managed provider like Upstash).
- A Cloudflare account with an R2 bucket (free tier = 10 GB storage + 10M class A / 100M class B ops / mo — plenty).

### 1. Clone & install

```bash
git clone <your-repo-url>
cd peerclip
npm install
```

### 2. Environment variables

Copy the template and fill in your own values:

```bash
cp .env.example .env.local   # Windows users: copy .env.example .env.local
```

Open `.env.local` in an editor and populate `REDIS_URL` + the 5 R2 variables. Step-by-step for each value is in:

- [☁️ Deploy on Vercel](#%EF%B8%8F-deploy-on-vercel)
- [🪣 Cloudflare R2 Image Storage](#-cloudflare-r2-image-storage)

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — a room id is auto-generated. Scan the QR code in the sidebar with your phone to join.

### 4. Production build

```bash
npm run build
npm start
```

## 🔧 Environment Variables

> All variables are **required**. No defaults are applied — fail-fast if anything is missing to avoid silent misbehavior.

| Name | Type | Required | Purpose | Example (**don't copy-paste**, replace with your own) |
|---|---|---|---|---|
| `REDIS_URL` | string | ✅ | Redis connection string including password. | `redis://:mypassword@1.2.3.4:6379` |
| `R2_ACCOUNT_ID` | string | ✅ | 32-hex Cloudflare Account ID (from any zone dashboard / R2 URL). | `f5736c29d5fccde4284c001b0cd4b54b` |
| `R2_ACCESS_KEY_ID` | string | ✅ | R2 API Token — Access Key ID. | `550112...cc236` |
| `R2_SECRET_ACCESS_KEY` | string | ✅ | R2 API Token — Secret. | `ab382a...57feb` |
| `R2_BUCKET` | string | ✅ | R2 bucket name. | `lcv` |
| `R2_PUBLIC_DOMAIN` | string | ✅ | Public bucket domain (**NO trailing slash**). | `https://pub-xxx.r2.dev` or `https://i.you.com` |

## ☁️ Deploy on Vercel

The app is 100 % optimized for Vercel Serverless. Recommended path:

### Option A · Import via dashboard

1. Push the repo to your own GitHub (public or private).
2. Go to [Vercel → New Project](https://vercel.com/new) → **Import** the repository.
3. Framework preset → **Next.js** (auto-detected).
4. Root Directory → `/` (keep default).
5. Build Command → `next build` (default).
6. Open the **Environment Variables** tab and add all 6 variables from [🔧 Environment Variables](#-environment-variables-en). Tick **Production / Preview / Development** for each.
7. Click **Deploy**. Build completes in ~1–2 minutes.

### Option B · Vercel CLI

```bash
npm i -g vercel
vercel           # First-time login + preview deploy
vercel --prod    # Promote to production
```

You can then bind a custom domain in **Vercel → Project → Settings → Domains** (free auto-HTTPS included).

## 🪣 Cloudflare R2 Image Storage

Four steps to set it up: **create bucket → enable public access → create API token → add CORS policy**.

### 1) Create the bucket

1. Cloudflare sidebar → **R2** → **Create bucket**.
2. Bucket name: e.g. `lcv` (must match `R2_BUCKET`).
3. Location: Auto is fine.
4. **Create bucket**.

### 2) Enable public access (required — otherwise no one can see the images!)

Inside your new bucket → the **Settings** tab → choose **one** of:

- **Option A · R2.dev subdomain (fastest, no custom domain needed)**:
  In `Public bucket access` → **Allow Access**. Copy the assigned `https://pub-<hash>.r2.dev` URL as `R2_PUBLIC_DOMAIN`.

- **Option B · Custom domain (recommended, faster + cache rules)**:
  In `Custom Domains` → **Connect Domain**, e.g. `i.yourdomain.com`. Cloudflare auto-creates the CNAME + SSL. Once validated use `https://i.yourdomain.com` as `R2_PUBLIC_DOMAIN`.

### 3) Create an R2 API Token (Access Key)

Back at the R2 overview level (**not inside the bucket**) → **Manage R2 API Tokens** → **Create API Token**:

- **Token Name**: e.g. `peerclip-rw`.
- **Permissions**: **Object Read & Write** only. ⚠️  **Never use Admin Read & Write** — follows least-privilege.
- **Specify bucket(s)**: **Only select buckets** → check only `lcv`.
- **TTL**: default (no expiration).
- Click **Create API Token**.

⚠️  **Secret is shown ONLY ONCE!** Copy both `Access Key ID` and `Secret Access Key` immediately into `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`. Close the page and they are gone forever.

### 4) Add a CORS policy (⚠️  MANDATORY — otherwise browsers block direct PUT uploads)

Inside bucket → **Settings** → scroll to **CORS Policy** → **Add CORS policy** → **JSON editor**, paste (matches exactly what the in-app error shows):

```
AllowedOrigins: ["*"]
AllowedMethods: ["GET","PUT","HEAD"]
AllowedHeaders: ["*"]
ExposeHeaders: ["ETag"]
MaxAgeSeconds: 3600
```

**Save policy** → wait ~30 s. For stricter security replace `AllowedOrigins` to only allow your deployed domain + local dev:

```json
["https://lcv.odkkk.com", "http://localhost:3000"]
```

### 5) (Highly recommended) Object Lifecycle Rule — auto-delete old files so R2 never runs out of space

Free-tier R2 gives you 10 GB. PeerClip uploads images & files constantly, so storage will fill up eventually. Use **Lifecycle Rules** to tell Cloudflare to auto-delete files older than N days — set it and forget it.

Inside your bucket → **Settings** → find **Object Lifecycle Rules** → **Add rule**:

| Field | Value | Notes |
|---|---|---|
| **Rule name** | `auto-delete-after-1-day` (or whatever) | Just pick something descriptive |
| **Rule scope** | ✅ **Apply to all objects in bucket** | Applies to the whole bucket — simplest |
| **Action** | Check **Expire current version of object** | This is the only action you need |
| **After (days from object creation)** | `1` (or `7`, whatever works for you) | **Files auto-delete 1 day after upload** |

Click **Create rule**. The rule kicks in within ~24 hours and Cloudflare prunes in the background — no manual cleanup, no extra cost.

> 💡 Tip: If you want certain files to live longer, switch **Rule scope** to **Custom prefix** and add multiple rules with different prefixes / days. PeerClip stores files under `YYYY/MM/DD/` directories so you can even target specific date prefixes.

## 📱 How to use

### Flow on first open

1. The first device opening any room URL automatically becomes the **room owner** (status `approved`) and manages approvals.
2. **Share the URL** or have the guest **scan the QR code in the sidebar** → they join.
3. A new guest starts as `pending`. The owner sees a green **Approve** button in the device list.
4. Click **Approve** → the guest becomes `approved`. **Only approved devices can read & send messages/images.**

### Sending text

Type → click **Send** (or press Enter). Appears on all approved devices instantly. The copy button on the right of each bubble copies the content to your clipboard in one click.

### Sending attachments (images + files)

Three ways, **all support multi-select + mixing images and generic files**:
- Click the **image/file icon** on the left of the input → pick one or more files (images, ZIPs, PDFs, videos, …).
- Press **Ctrl/⌘+V inside the page** → pastes a screenshot/image/files from clipboard.
- **Drag & drop** files anywhere onto the input bar — drop zone highlights blue.
- (Desktop Chrome, permission granted) Click the **clipboard icon** in the header to auto-read the system clipboard.

After you pick files, a horizontal preview strip appears inside the input bar showing each card:
- 🖼️ **Images**: thumbnail + upload progress + green check when done
- 📄 **Files**: file-type icon (archive/doc/video/…) + name + size
- ❌ Click the `×` on any card to remove it before sending
- ➕ Click the dashed "Add file" card at the end to pick more

Wait until every card shows the green check (all uploaded), then hit **Send**.
- Multiple images in one message → **3D card carousel** with arrow buttons / swipe / dots / tap-center to preview
- Generic files → file cards inside the same bubble, click to download
- You can also type text at the same time — it all ships in one message.

### Image preview

- **Tap the image** → full-screen preview.
- **Double-tap quickly** → toggle between 1× / 2.5× zoom.
- **Drag with one finger (when zoomed)** → pan.
- **Pinch with two fingers** → zoom continuously 0.5× → 8×.
- **Tap the dark backdrop** → exit preview.

## 🏗 Project Layout

```
peerclip/
├─ app/
│  ├─ page.tsx              ← Main UI: render / polling / message-merge / touch gestures / upload
│  ├─ layout.tsx            ← Root layout
│  ├─ globals.css           ← Tailwind entry
│  ├─ favicon.ico
│  └─ api/
│     ├─ clipboard/route.ts ← GET: poll (devices + messages) · POST: heartbeat / message / approve+reject
│     └─ upload/route.ts    ← Returns a 5-min R2 presigned PUT URL + public URL
├─ public/
│  └─ logo.jpg              ← Project logo (shared by README & the in-app header)
├─ .env.example             ← Env var template (NO secrets; copy → .env.local to fill in)
├─ next.config.ts           ← Next config
├─ postcss.config.mjs
├─ eslint.config.mjs
├─ tsconfig.json
├─ package.json
└─ README.md
```

## ⚠️ Important notes

1. **Least privilege R2 tokens**: always create tokens with **Object Read & Write** scoped to **a single bucket** — never use account-wide / Admin roles.
2. **If you suspect secrets leaked** (`.env.local` / Redis password ever pushed to GitHub — even if you rewrote history):
   - Immediately go to Cloudflare R2 → **revoke the old token and generate a brand-new pair**.
   - Rotate the Redis password (update your server + Vercel env).
   - Then clean history / force-push.
3. **Vercel Hobby 4.5 MB body cap**: this project uses **presigned PUT URLs for uploads**, so images bypass the body-size limit entirely. Still, keep individual messages / Redis payloads under 1 MB.
4. **HTTPS-only clipboard APIs**: `navigator.clipboard.read` only works on `https://` or `localhost`. Always use HTTPS in production (Vercel gives it to you for free, custom domains also auto-issue certs).
5. **Never commit `.env.local`**: it's listed in `.gitignore`. If it ever shows up in `git status`, run `git rm --cached .env.local` **and rotate the secrets inside**.

## 🤝 License

MIT License — fork, self-host, modify freely.

---

<div align="center">
  <sub>Made with ❤️ using Next.js + Tailwind CSS</sub>
</div>
