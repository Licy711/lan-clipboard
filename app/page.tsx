'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Image from 'next/image';
import {
  Monitor, Smartphone, Tablet,
  Copy, Check, Send, ClipboardPaste, QrCode, Shield, Users, CheckCircle2, XCircle, Menu, X, Image as ImageIcon,
  ChevronLeft, ChevronRight, FileText, FileArchive, FileSpreadsheet, FileVideo, File as FileIcon, Loader2, Download, Trash2
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface ClientDevice {
  id: string;
  name: string;
  type: string;
  status: 'pending' | 'approved';
  updatedAt: number;
}

interface Attachment {
  url: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  kind: 'image' | 'file';
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  contentType: 'text' | 'image' | 'images' | 'file';
  attachments?: Attachment[];
  timestamp: number;
}

// =============================
// 轮询消息合并：避免乐观更新 temp 消息被轮询整个替换时冲掉
// =============================
function isTempFromMeSame(msg: ChatMessage, serverMsg: ChatMessage, meId: string): boolean {
  if (!msg.id.startsWith('temp_')) return false;
  if (msg.senderId !== meId) return false;
  if (serverMsg.senderId !== meId) return false;
  if (serverMsg.contentType !== msg.contentType) return false;

  // 附件消息：比对第一个附件的 name / sizeBytes / mimeType + 时间差
  const ma = msg.attachments?.[0];
  const sa = serverMsg.attachments?.[0];
  if (ma && sa) {
    if (ma.name === sa.name && ma.sizeBytes === sa.sizeBytes && ma.mimeType === sa.mimeType) {
      return Math.abs(serverMsg.timestamp - msg.timestamp) < 15_000;
    }
    return false;
  }
  // 纯文本/旧兼容：比对 content
  if (serverMsg.content !== msg.content) return false;
  return Math.abs(serverMsg.timestamp - msg.timestamp) < 10_000;
}

function mergeMessages(prev: ChatMessage[], server: ChatMessage[] | undefined, meId: string): ChatMessage[] {
  const serverMsgs = Array.isArray(server) ? server : [];

  const pendingTemps: ChatMessage[] = [];
  for (const p of prev) {
    if (!p.id.startsWith('temp_') || p.senderId !== meId) continue;
    const alreadyOnServer = serverMsgs.some((s) => isTempFromMeSame(p, s, meId));
    if (!alreadyOnServer) pendingTemps.push(p);
  }

  const merged = [...serverMsgs, ...pendingTemps].sort((a, b) => a.timestamp - b.timestamp);

  if (prev.length === merged.length) {
    let same = true;
    for (let i = 0; i < prev.length; i++) {
      if (prev[i].id !== merged[i].id) { same = false; break; }
    }
    if (same) return prev;
  }

  return merged;
}

function devicesSame(a: ClientDevice[], b: ClientDevice[] | undefined): boolean {
  const bb = Array.isArray(b) ? b : [];
  if (a.length !== bb.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = bb[i];
    if (x.id !== y.id || x.status !== y.status || x.updatedAt !== y.updatedAt || x.name !== y.name || x.type !== y.type) {
      return false;
    }
  }
  return true;
}

// =============================
// 工具函数
// =============================
function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

async function parseJsonOrText(res: Response): Promise<{ success: boolean; error?: string; url?: string; uploadUrl?: string; publicUrl?: string; objectKey?: string; [k: string]: any }> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try { return await res.json(); } catch { /* 用 text 兜底 */ }
  }
  const text = (await res.text()).trim();
  const short = text.length > 300 ? text.slice(0, 300) + '...' : text;
  return { success: false, error: short || `HTTP ${res.status}` };
}

function extOfName(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  const v = bytes / Math.pow(k, i);
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}

function FileTypeIcon({ kind, name, mimeType }: { kind: 'image' | 'file'; name: string; mimeType: string; className?: string }, { className = 'w-4 h-4' }: { className?: string } = {}) {
  if (kind === 'image') return <ImageIcon className={className} />;
  const ext = extOfName(name);
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return <FileArchive className={className} />;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet className={className} />;
  if (['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) return <FileVideo className={className} />;
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'ppt', 'pptx'].includes(ext) || mimeType.startsWith('text/')) return <FileText className={className} />;
  return <FileIcon className={className} />;
}

// 把"老消息 / 新消息"统一转成 attachments 数组 + 展示 content（兼容）
function normalizeAttachments(msg: ChatMessage): Attachment[] {
  if (Array.isArray(msg.attachments) && msg.attachments.length > 0) return msg.attachments;
  if (msg.contentType === 'image' && msg.content && msg.content.startsWith('http')) {
    return [{ url: msg.content, name: `image-${msg.timestamp}.png`, sizeBytes: 0, mimeType: 'image/*', kind: 'image' }];
  }
  return [];
}

const CORS_TIP_BLOCK =
  `上传被浏览器拦截（CORS）。请在 R2 桶 Settings → CORS 新增一条：\n` +
  `AllowedOrigins: ["*"]\nAllowedMethods: ["GET","PUT","HEAD"]\nAllowedHeaders: ["*"]\nExposeHeaders: ["ETag"]\nMaxAgeSeconds: 3600`;

// =============================
// 三维多图轮播（preserve-3d）
// =============================
function Carousel3D({ images, onOpen }: { images: Attachment[]; onOpen: (url: string) => void }) {
  const [cur, setCur] = useState(0);
  const len = images.length;
  const dragXRef = useRef<number | null>(null);
  if (len === 0) return null;

  const goto = (step: number) => setCur((c) => ((((c + step) % len) + len) % len));
  const onTouchStart = (e: React.TouchEvent) => { dragXRef.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (dragXRef.current == null) return;
    const dx = e.changedTouches[0].clientX - dragXRef.current;
    dragXRef.current = null;
    if (Math.abs(dx) > 40) goto(dx < 0 ? 1 : -1);
  };
  const onMouseDown = (e: React.MouseEvent) => { dragXRef.current = e.clientX; };
  const onMouseUp = (e: React.MouseEvent) => {
    if (dragXRef.current == null) return;
    const dx = e.clientX - dragXRef.current;
    dragXRef.current = null;
    if (Math.abs(dx) > 60) goto(dx < 0 ? 1 : -1);
  };

  return (
    <div className="relative w-full mx-auto select-none" style={{ maxWidth: 420 }}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown} onMouseUp={onMouseUp} onMouseLeave={() => { dragXRef.current = null; }}
    >
      <div
        className="relative mx-auto mb-3 flex items-center justify-center"
        style={{ perspective: '1400px', height: 280 }}
      >
        <div
          className="relative w-[260px] h-[260px]"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {images.map((img, i) => {
            let d = i - cur;
            if (d > len / 2) d -= len;
            if (d < -len / 2) d += len;
            const absD = Math.abs(d);
            const rotateY = d * 38;
            const translateX = d * 70;
            const translateZ = -absD * 200;
            const opacity = absD === 0 ? 1 : (absD === 1 ? 0.7 : absD === 2 ? 0.38 : 0);
            const scale = absD === 0 ? 1 : (absD === 1 ? 0.84 : 0.62);
            const zIndex = 100 - absD;
            const isCenter = absD === 0;
            return (
              <div
                key={i}
                className="absolute inset-0 rounded-2xl overflow-hidden border border-black/10 bg-zinc-900 shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
                style={{
                  transform: `rotateY(${rotateY}deg) translateX(${translateX}px) translateZ(${translateZ}px) scale(${scale})`,
                  opacity, zIndex,
                  transition: 'all 420ms cubic-bezier(.22,1,.36,1)',
                  pointerEvents: absD <= 2 ? 'auto' : 'none',
                  backfaceVisibility: 'hidden',
                }}
                onClick={(e) => { e.stopPropagation(); if (isCenter) onOpen(img.url); else setCur(i); }}
              >
                <img src={img.url} alt={img.name} className="w-full h-full object-cover" draggable={false} />
                {isCenter && (
                  <button
                    className="absolute bottom-2 right-2 px-2 py-1 text-[10px] rounded-md bg-black/60 text-white backdrop-blur"
                    onClick={(e) => { e.stopPropagation(); onOpen(img.url); }}
                  >全屏预览</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 左右按钮 + 页数圆点 */}
      <div className="flex items-center justify-between px-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); goto(-1); }}
          className="p-1.5 rounded-full bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 shrink-0"
          aria-label="上一张"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          {images.map((_, i) => (
            <button
              key={i}
              aria-label={`第 ${i + 1} 张`}
              onClick={(e) => { e.stopPropagation(); setCur(i); }}
              className={`rounded-full transition-all ${
                i === cur ? 'w-5 h-2 bg-blue-500' : 'w-2 h-2 bg-zinc-700 hover:bg-zinc-600'
              }`}
            />
          ))}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); goto(1); }}
          className="p-1.5 rounded-full bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 shrink-0"
          aria-label="下一张"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 当前索引 */}
      <div className="text-center text-[11px] font-mono text-zinc-500 mt-2">
        {images[cur].name || `image-${cur + 1}`} · {cur + 1} / {len}
      </div>
    </div>
  );
}

// =============================
// 文件卡片列表（支持通用文件下载）
// =============================
function AttachmentFileList({ attachments, theme }: { attachments: Attachment[]; theme: 'me' | 'other' }) {
  return (
    <div className="flex flex-col gap-2 min-w-[240px]">
      {attachments.map((a, i) => {
        const isImg = a.kind === 'image';
        return (
          <a
            key={i}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            download={a.name}
            onClick={(e) => { if (isImg) e.preventDefault(); /* 图片交给外层预览 */ }}
            className={`flex items-center gap-3 p-2.5 rounded-xl border transition
              ${theme === 'me'
                ? 'bg-white/90 border-zinc-200 hover:bg-white text-zinc-800'
                : 'bg-zinc-900/95 border-zinc-800 hover:bg-zinc-800/95 text-zinc-200'}
              ${isImg ? 'cursor-pointer' : ''}`}
          >
            <div className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center
              ${theme === 'me' ? 'bg-zinc-100 text-zinc-700' : 'bg-zinc-800 text-zinc-300'}`}>
              <FileTypeIcon kind={a.kind} name={a.name} mimeType={a.mimeType} className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate">{a.name}</div>
              <div className={`text-[10px] font-mono mt-0.5 ${theme === 'me' ? 'text-zinc-500' : 'text-zinc-500'}`}>
                {a.sizeBytes > 0 ? formatBytes(a.sizeBytes) : (a.mimeType || 'file')}
              </div>
            </div>
            <div className={`shrink-0 p-1.5 rounded-lg
              ${theme === 'me' ? 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'}`}>
              {isImg ? <ChevronRight className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            </div>
          </a>
        );
      })}
    </div>
  );
}

// =============================
// 主页面
// =============================
export default function Home() {
  const [room, setRoom] = useState<string>('');
  const [myId, setMyId] = useState<string>('');
  const [allDevices, setAllDevices] = useState<ClientDevice[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputContent, setInputContent] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 全屏图片预览（点单图 / 点三维轮播中心卡触发）
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // 待发送附件（多图 + 文件 统一 pending 队列）
  type PendingAttachment = {
    id: string;
    name: string;
    sizeBytes: number;
    mimeType: string;
    kind: 'image' | 'file';
    previewBase64?: string;
    state: 'uploading' | 'done' | 'error';
    error?: string;
    publicUrl?: string;
  };
  const [pending, setPending] = useState<PendingAttachment[]>([]);

  const [dragActive, setDragActive] = useState(false); // 拖拽进入输入框时的视觉提示
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);

  const deviceInfo = useMemo<{ name: string; type: string }>(() => {
    if (typeof navigator === 'undefined') return { name: '未知', type: 'desktop' };
    const ua = navigator.userAgent || '';
    let t: string = 'desktop';
    if (/Android/i.test(ua) || /iPhone|iPad|iPod/i.test(ua) || /Mobile/i.test(ua)) t = /iPhone|iPad|iPod/i.test(ua) ? 'ios' : 'android';
    const name = /iPad|iPhone/.test(ua) ? 'iPhone / iPad' : /Android/.test(ua) ? 'Android 手机' : /Mac OS X/.test(ua) ? 'MacBook' : /Windows/.test(ua) ? 'Windows PC' : /Linux/.test(ua) ? 'Linux' : '桌面浏览器';
    return { name, type: t };
  }, []);
  const deviceTypeIcon = deviceInfo.type === 'ios' ? Smartphone : deviceInfo.type === 'android' ? Smartphone : Monitor;

  // ---- 房间 & 我的 ID 初始化 ----
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    let r = urlParams.get('room');
    if (!r) {
      r = 'room_' + Date.now() + '_' + Math.random().toString(36).slice(2, 14);
      const u = new URL(window.location.href);
      u.searchParams.set('room', r);
      window.history.replaceState({}, '', u.toString());
    }
    setRoom(r);

    let id = localStorage.getItem('peerclip_id');
    if (!id) {
      id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      localStorage.setItem('peerclip_id', id);
    }
    setMyId(id);
  }, []);

  // ---- 发送动作统一入口：心跳 + 发消息 + 审批 ----
  const sendAction = async (action: 'heartbeat' | 'message' | 'approve' | 'reject', extra: Record<string, any> = {}) => {
    try {
      await fetch('/api/clipboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: myId,
          name: deviceInfo.name,
          type: deviceInfo.type,
          room,
          action,
          ...extra,
        }),
      });
    } catch { /* 忽略网络抖动 */ }
  };

  // ---- 心跳（30s 一次，45s 过期就会被服务器踢下线）----
  useEffect(() => {
    if (!myId || !room) return;
    sendAction('heartbeat');
    heartbeatTimerRef.current = setInterval(() => sendAction('heartbeat'), 30_000);
    return () => { if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current); };
  }, [myId, room]);

  // ---- 轮询（1.5s 一次，devices + messages 一起拉）----
  useEffect(() => {
    if (!room || !myId) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/clipboard?room=${encodeURIComponent(room)}&t=${Date.now()}`);
        const data = await parseJsonOrText(res);
        if (!res.ok) return;
        setAllDevices((prev) => (devicesSame(prev, data.devices) ? prev : (Array.isArray(data.devices) ? data.devices : [])));
        setMessages((prev) => mergeMessages(prev, data.messages, myId));
      } catch { /* 忽略 */ }
    };
    poll();
    pollTimerRef.current = setInterval(poll, 1500);
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [room, myId]);

  // ---- 有新消息自动滚到底 ----
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  };

  // ---- 审批设备 ----
  const handleApproveDevice = async (targetId: string, approve: boolean) => {
    await sendAction(approve ? 'approve' : 'reject', { targetId });
  };

  // =============================
  // 上传：单文件 R2 presign → PUT（返回 publicUrl 或 throw Error）
  // =============================
  const uploadOneToR2 = async (file: File): Promise<string> => {
    const presignRes = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: file.type || 'application/octet-stream', ext: extOfName(file.name) || undefined }),
    });
    const presignData = await parseJsonOrText(presignRes);
    if (!presignRes.ok || !presignData.success) throw new Error(presignData.error || `Presign 失败 HTTP ${presignRes.status}`);
    if (!presignData.uploadUrl || !presignData.publicUrl) throw new Error('后端 presign 返回缺少 uploadUrl/publicUrl');

    const putRes = await fetch(presignData.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!putRes.ok) {
      const err = await parseJsonOrText(putRes);
      const msg = err.error || `R2 上传失败 HTTP ${putRes.status}`;
      if (/CORS|Access-Control|NetworkError|Failed to fetch/i.test(msg)) throw new Error(CORS_TIP_BLOCK);
      if (/SignatureDoesNotMatch|AccessDenied|InvalidAccessKey|ExpiredToken/i.test(msg))
        throw new Error(`R2 签名失败：${msg}（请核对 env 中 R2 凭据）`);
      throw new Error(msg);
    }
    return presignData.publicUrl;
  };

  const updatePending = (id: string, patch: Partial<PendingAttachment>) => {
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  // =============================
  // 批量处理文件：选了 N 张图 / N 个文件 → 并发（限制 3 个）全部 presign+PUT
  // =============================
  const handleFilesSelected = async (inputFiles: FileList | File[] | null | undefined) => {
    if (!inputFiles) return;
    const files: File[] = Array.from(inputFiles);
    if (files.length === 0) return;

    // ---- 1) 大小与容量限制（因为你 R2 免费 + 每天会自动删，仍要单张/总上限）----
    const MAX_IMG_MB = 10;
    const MAX_FILE_MB = 50;
    const MAX_TOTAL_MB = 150;
    const totalBytes = files.reduce((s, f) => s + f.size, 0);
    if (totalBytes / 1024 / 1024 > MAX_TOTAL_MB) {
      alert(`单次上传总大小不能超过 ${MAX_TOTAL_MB}MB（当前 ${(totalBytes / 1024 / 1024).toFixed(1)}MB）`);
      return;
    }

    // ---- 2) 为每个文件生成 pending 条目（图片额外读 base64 预览）----
    const newPending: PendingAttachment[] = [];
    const prepareTasks = files.map(async (file, idx) => {
      const isImage = file.type.startsWith('image/');
      if (isImage && file.size / 1024 / 1024 > MAX_IMG_MB)
        throw new Error(`图片「${file.name}」超过 ${MAX_IMG_MB}MB`);
      if (!isImage && file.size / 1024 / 1024 > MAX_FILE_MB)
        throw new Error(`文件「${file.name}」超过 ${MAX_FILE_MB}MB`);

      let previewBase64: string | undefined;
      if (isImage) previewBase64 = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = (e) => resolve(e.target?.result as string || '');
        r.readAsDataURL(file);
      });
      const item: PendingAttachment = {
        id: `pend_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        name: file.name || (isImage ? `image-${Date.now()}.${extOfName(file.type.split('/')[1] || 'png')}` : `file-${Date.now()}`),
        sizeBytes: file.size,
        mimeType: file.type || (isImage ? 'image/*' : 'application/octet-stream'),
        kind: isImage ? 'image' : 'file',
        previewBase64,
        state: 'uploading',
      };
      newPending.push(item);
      return { file, item };
    });
    const settled = await Promise.allSettled(prepareTasks);
    const rejectedReasons = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected').map((s) => s.reason?.message || '');
    const readyList = settled
      .filter((s): s is PromiseFulfilledResult<{ file: File; item: PendingAttachment }> => s.status === 'fulfilled')
      .map((s) => s.value);
    if (newPending.length > 0) setPending((prev) => [...prev, ...newPending]);
    if (rejectedReasons.length) alert(rejectedReasons.join('\n'));

    // ---- 3) 并发 3 个上传 ----
    const concurrency = 3;
    let ptr = 0;
    const worker = async () => {
      while (ptr < readyList.length) {
        const cur = ptr++;
        const { file, item } = readyList[cur];
        try {
          const url = await uploadOneToR2(file);
          updatePending(item.id, { state: 'done', publicUrl: url });
        } catch (e: any) {
          const m = String(e?.message || e || '上传失败');
          const finalMsg = /Failed to fetch|NetworkError|CORS|Access-Control/i.test(m) ? (CORS_TIP_BLOCK + '\n（保存后等 30 秒再试）') : m;
          updatePending(item.id, { state: 'error', error: finalMsg });
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  };

  // ---- 处理老的单图 base64（来自剪贴板 read() / 粘贴图片 / 单图 input 的遗留路径）----
  const handleImageSelectedLegacy = (base64: string, fileName?: string) => {
    const blob = dataURLtoBlob(base64);
    const ext = blob.type.split('/')[1] || 'png';
    const f = new File([blob], fileName || `clipboard-${Date.now()}.${ext}`, { type: blob.type });
    return handleFilesSelected([f]);
  };

  const removePending = (id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
  };

  // 粘贴事件：同时支持剪贴板的图片、多文件、多图
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        e.preventDefault();
        handleFilesSelected(files);
        return;
      }
      // 兼容：纯文本图片（base64）就走旧路径
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of Array.from(items)) {
          if (item.type && item.type.startsWith('image/')) {
            const f = item.getAsFile();
            if (f) { e.preventDefault(); handleFilesSelected([f]); return; }
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // 拖拽事件（整个输入框区）
  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const onDropZone = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer?.files;
    if (f && f.length > 0) handleFilesSelected(f);
  };

  // =============================
  // 发送消息（文本 + 附件同一条）
  // =============================
  const handleSendMessage = async () => {
    const textContent = inputContent.trim();
    const done = pending.filter((p) => p.state === 'done');
    if (!textContent && done.length === 0) return;
    const anyUploading = pending.some((p) => p.state === 'uploading');
    if (anyUploading) return;

    const attachments: Attachment[] = done.map((p) => ({
      url: p.publicUrl as string,
      name: p.name,
      sizeBytes: p.sizeBytes,
      mimeType: p.mimeType,
      kind: p.kind,
    }));

    const images = attachments.filter((a) => a.kind === 'image');
    const nonImages = attachments.filter((a) => a.kind === 'file');
    let contentType: ChatMessage['contentType'] = 'text';
    if (attachments.length > 0) {
      if (nonImages.length > 0) contentType = 'file';
      else if (images.length === 1) contentType = 'image';
      else contentType = 'images';
    }
    // 向后兼容 content：旧消息单图时 content = url，其它情况 content 就是文本
    const content = textContent || (contentType === 'image' && images[0] ? images[0].url : '');

    const tempMsg: ChatMessage = {
      id: 'temp_' + Date.now(),
      senderId: myId,
      senderName: deviceInfo.name,
      content,
      contentType,
      attachments,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, tempMsg]);
    scrollToBottom();

    // 清空输入 + 清空已完成的 pending
    setInputContent('');
    setPending((prev) => prev.filter((p) => p.state !== 'done'));

    await sendAction('message', { content, contentType, attachments });
  };

  // ---- 剪贴板手动读取 ----
  const readAndSyncClipboard = async () => {
    try {
      if (!navigator?.clipboard?.read) return;
      const items = await navigator.clipboard.read();
      const collectedFiles: File[] = [];
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const f = new File([blob], `clipboard-${Date.now()}.${imageType.split('/')[1] || 'png'}`, { type: imageType });
          collectedFiles.push(f);
          continue;
        }
        if (item.types.includes('text/plain')) {
          const blob = await item.getType('text/plain');
          const text = await blob.text();
          if (text) setInputContent((prev) => (prev ? `${prev}\n${text}` : text));
        }
      }
      if (collectedFiles.length > 0) handleFilesSelected(collectedFiles);
    } catch { /* 权限拒绝就忽略 */ }
  };

  // =============================
  // 全屏图片预览（支持鼠标滚轮/双指手势/拖动/双击缩放）
  // =============================
  const [imgScale, setImgScale] = useState(1);
  const [imgTrans, setImgTrans] = useState({ x: 0, y: 0 });
  const lastTapRef = useRef<number>(0);
  const touchStartRef = useRef<{ x: number; y: number; transX: number; transY: number; twoDist: number; twoCenterX: number; twoCenterY: number; scale: number } | null>(null);
  const mouseDragRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  useEffect(() => {
    if (previewImageUrl) { setImgScale(1); setImgTrans({ x: 0, y: 0 }); }
  }, [previewImageUrl]);

  const twoFingersDistance = (t: React.TouchList | TouchList) => {
    const t0 = t.item(0)!;
    const t1 = t.item(1)!;
    const dx = t0.clientX - t1.clientX, dy = t0.clientY - t1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handlePreviewTouchStart = (e: React.TouchEvent) => {
    const now = Date.now();
    if (e.touches.length === 1 && now - lastTapRef.current < 320
      && Math.abs(e.touches[0].clientX - (touchStartRef.current?.x ?? 0)) < 24
      && Math.abs(e.touches[0].clientY - (touchStartRef.current?.y ?? 0)) < 24) {
      // 双击
      setImgScale((s) => (s <= 1 ? 2.5 : 1));
      setImgTrans({ x: 0, y: 0 });
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;

    if (e.touches.length === 2) {
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      touchStartRef.current = {
        x: cx, y: cy,
        transX: imgTrans.x, transY: imgTrans.y,
        twoDist: twoFingersDistance(e.touches),
        twoCenterX: cx, twoCenterY: cy,
        scale: imgScale,
      };
    } else if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX, y: e.touches[0].clientY,
        transX: imgTrans.x, transY: imgTrans.y,
        twoDist: 0, twoCenterX: 0, twoCenterY: 0, scale: imgScale,
      };
    }
  };

  const handlePreviewTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (!touchStartRef.current) return;
    if (e.touches.length === 2 && touchStartRef.current.twoDist > 0) {
      const dist = twoFingersDistance(e.touches);
      let s = touchStartRef.current.scale * (dist / touchStartRef.current.twoDist);
      s = Math.min(8, Math.max(0.5, s));
      setImgScale(s);
    } else if (e.touches.length === 1 && imgScale > 1.001) {
      const dx = e.touches[0].clientX - touchStartRef.current.x;
      const dy = e.touches[0].clientY - touchStartRef.current.y;
      setImgTrans({
        x: touchStartRef.current.transX + dx,
        y: touchStartRef.current.transY + dy,
      });
    }
  };

  // 预览鼠标拖动（PC）
  const onPreviewMouseDown = (e: React.MouseEvent) => {
    if (imgScale <= 1.001) return;
    mouseDragRef.current = { startX: e.clientX, startY: e.clientY, tx: imgTrans.x, ty: imgTrans.y };
  };
  const onPreviewMouseMove = (e: React.MouseEvent) => {
    if (!mouseDragRef.current) return;
    setImgTrans({
      x: mouseDragRef.current.tx + (e.clientX - mouseDragRef.current.startX),
      y: mouseDragRef.current.ty + (e.clientY - mouseDragRef.current.startY),
    });
  };
  const onPreviewMouseUp = () => { mouseDragRef.current = null; };
  const onPreviewWheel = (e: React.WheelEvent) => {
    const delta = -e.deltaY * 0.0015;
    setImgScale((s) => Math.min(8, Math.max(1, s + delta)));
    if (imgScale + delta <= 1.001) setImgTrans({ x: 0, y: 0 });
  };

  // ---- 计算：我是不是管理员 ----
  const isApprover = useMemo(() => {
    if (allDevices.length === 0) return true;
    return allDevices.find((d) => d.id === myId)?.status === 'approved' &&
      allDevices.every((d) => (d.updatedAt ?? 0) <= (allDevices.find(x => x.id === myId)?.updatedAt ?? 0))
      ? true
      : allDevices.find((d) => d.id === myId && d.status === 'approved') !== undefined;
  }, [allDevices, myId]);
  const approvedCount = allDevices.filter((d) => d.status === 'approved').length;

  const myApproved = allDevices.find((d) => d.id === myId)?.status === 'approved';
  const qrUrl = useMemo(() => {
    const u = new URL(window.location.href);
    return u.toString();
  }, [room]);

  // =============================
  // 消息渲染：归一化附件 -> 三维轮播 / 单图 / 文件卡 + 文本同气泡
  // =============================
  const approvedIdsSet = useMemo(() => new Set(allDevices.filter((d) => d.status === 'approved').map((d) => d.id)), [allDevices]);

  const themeClass = (mine: boolean) => mine
    ? 'bg-zinc-100 text-zinc-900 border-zinc-200 rounded-tr-sm selection:bg-zinc-800 selection:text-zinc-100'
    : 'bg-zinc-900/90 text-zinc-200 border-zinc-800 rounded-tl-sm selection:bg-zinc-700 selection:text-zinc-100';

  return (
    <main className="h-screen w-screen bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.16),_transparent_60%),#07070a] text-zinc-100 flex flex-col overflow-hidden font-sans antialiased">

      {/* 顶部导航栏 */}
      <header className="border-b border-zinc-800/80 bg-[#09090b]/90 backdrop-blur-md px-4 md:px-6 py-3 flex items-center justify-between gap-4 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-zinc-200 shadow-sm overflow-hidden shrink-0">
            <Image src="/logo.jpg" alt="Clipboard Sync Logo" width={28} height={28} priority className="object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-sm tracking-wide text-zinc-100">PeerClip</h1>
              <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-900 text-zinc-400 border border-zinc-800">
                跨设备剪贴板
              </span>
            </div>
            <p className="text-[10px] md:text-[11px] font-mono text-zinc-500 truncate max-w-[180px] sm:max-w-none">ROOM: {room}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={readAndSyncClipboard}
            className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800 transition disabled:opacity-50"
            title="读取系统剪贴板（浏览器需要 HTTPS 授权）"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            读取剪贴板
          </button>

          <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono border
            ${myApproved ? 'bg-emerald-900/30 text-emerald-300 border-emerald-800' : 'bg-amber-900/30 text-amber-300 border-amber-800'}`}>
            {myApproved ? <CheckCircle2 className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
            {myApproved ? '已授权' : '审批中'}
          </div>

          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-2 rounded-lg border border-zinc-800 text-zinc-300 hover:bg-zinc-900"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 左：聊天主区 */}
        <section className="flex-1 flex flex-col px-3 md:px-6 py-4 md:py-6 gap-3 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-zinc-400" />
              <span className="text-xs font-mono text-zinc-400">
                设备 {allDevices.length}（已授权 {approvedCount}）
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-900/70 border border-zinc-800 text-[10px] font-mono text-zinc-400">
              <Shield className="w-3 h-3 text-blue-400" />
              新设备需审批后才能收发
            </div>
          </div>

          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-4">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-3">
                <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                  <ClipboardPaste className="w-6 h-6 text-zinc-600" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm text-zinc-300 font-medium">还没有任何内容</p>
                  <p className="text-xs text-zinc-500 max-w-xs">
                    在下方输入文字、粘贴图片，或选择文件/多张图片后按发送。
                  </p>
                </div>
              </div>
            )}

            {messages.map((msg) => {
              const isMyMessage = msg.senderId === myId;
              const canSee = isMyMessage || (approvedIdsSet.has(msg.senderId) && myApproved);
              if (!canSee) return null;

              const attachments = normalizeAttachments(msg);
              const images = attachments.filter((a) => a.kind === 'image');
              const nonImageFiles = attachments.filter((a) => a.kind === 'file');
              const hasFileCards = nonImageFiles.length > 0 || (images.length > 0 && msg.contentType === 'file');
              const onlyMultiImages = msg.contentType === 'images' && images.length >= 2 && nonImageFiles.length === 0;
              const onlySingleImage = msg.contentType === 'image' && images.length === 1;
              const showText = !!msg.content && !(onlySingleImage && msg.content === images[0]?.url);

              return (
                <div key={msg.id} className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex gap-2 max-w-[90%] md:max-w-[70%] ${isMyMessage ? 'flex-row-reverse' : ''}`}>
                    <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 overflow-hidden">
                      {(() => {
                        const IC = msg.senderId === myId ? deviceTypeIcon
                          : /android|ios|mobile|phone/.test(msg.senderName.toLowerCase()) ? Smartphone
                          : /mac|pc|windows|linux|desktop/.test(msg.senderName.toLowerCase()) ? Monitor
                          : Monitor;
                        return <IC className="w-4 h-4 text-zinc-400" />;
                      })()}
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className={`text-[10px] font-mono text-zinc-500 ${isMyMessage ? 'text-right' : 'text-left'}`}>
                        {msg.senderName} · {new Date(msg.timestamp).toLocaleTimeString()}
                      </div>

                      <div className={`rounded-2xl px-4 py-3 text-xs font-mono leading-relaxed shadow-sm border min-w-[180px] ${themeClass(isMyMessage)}`}>
                        {showText && (
                          <div className="whitespace-pre-wrap break-all mb-2">{msg.content}</div>
                        )}

                        {onlySingleImage && (
                          <div className="cursor-pointer" onClick={() => setPreviewImageUrl(images[0].url)}>
                            <img src={images[0].url} alt={images[0].name || 'Sync Image'} className="max-h-60 rounded-lg object-contain hover:opacity-95 transition-opacity mx-auto" />
                          </div>
                        )}

                        {onlyMultiImages && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <Carousel3D images={images} onOpen={(u) => setPreviewImageUrl(u)} />
                          </div>
                        )}

                        {hasFileCards && (
                          <AttachmentFileList
                            attachments={attachments}
                            theme={isMyMessage ? 'me' : 'other'}
                          />
                        )}
                      </div>

                      {/* 消息操作：复制（仅文本 + 图片 URL/文件链接） */}
                      <div className={`flex gap-1.5 ${isMyMessage ? 'justify-end' : 'justify-start'}`}>
                        <CopyButton text={
                          msg.content ||
                          (attachments.length === 1 ? attachments[0].url : attachments.map((a, i) => `[${i + 1}] ${a.name}\n${a.url}`).join('\n\n'))
                        } />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* 底部输入区：支持拖拽 + pending 附件滚动预览 */}
          <div
            className={`relative shrink-0 bg-zinc-900/40 border rounded-2xl p-2 flex flex-col gap-2 mt-2 shadow-lg transition-colors
              ${dragActive ? 'border-blue-500 ring-2 ring-blue-500/30 bg-blue-500/5' : 'border-zinc-800/80'}`}
            onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDropZone}
          >
            {dragActive && (
              <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-blue-400/70 flex items-center justify-center bg-blue-400/5 z-10 pointer-events-none">
                <span className="text-sm text-blue-300 font-mono">松开以上传文件 / 图片</span>
              </div>
            )}

            {/* Pending 附件水平预览条（多图多文件） */}
            {pending.length > 0 && (
              <div className="flex gap-2 items-stretch overflow-x-auto custom-scrollbar py-1 px-0.5">
                {pending.map((p) => {
                  const isImg = p.kind === 'image';
                  return (
                    <div
                      key={p.id}
                      className={`shrink-0 w-28 h-36 rounded-xl border relative flex flex-col overflow-hidden
                        ${p.state === 'error'
                          ? 'bg-red-500/10 border-red-500/50'
                          : p.state === 'done'
                            ? 'bg-emerald-500/10 border-emerald-500/30'
                            : 'bg-zinc-900/90 border-zinc-800 animate-pulse'}`}
                    >
                      <div className="flex-1 min-h-0 p-2 flex items-center justify-center">
                        {isImg && p.previewBase64 ? (
                          <img src={p.previewBase64} alt={p.name} className="max-w-full max-h-full object-cover rounded-lg" />
                        ) : (
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center
                            ${isImg ? 'bg-blue-500/10 text-blue-300' : 'bg-zinc-800 text-zinc-300'}`}>
                            <FileTypeIcon kind={p.kind} name={p.name} mimeType={p.mimeType} className="w-6 h-6" />
                          </div>
                        )}
                      </div>
                      <div className="px-2 pb-2 pt-1 space-y-0.5 min-w-0">
                        <div className="text-[10px] text-zinc-200 truncate font-semibold" title={p.name}>{p.name}</div>
                        <div className="text-[10px] font-mono text-zinc-400">
                          {p.state === 'done' && <>
                            <span className="text-emerald-400">上传完成 · </span>{formatBytes(p.sizeBytes)}
                          </>}
                          {p.state === 'uploading' && <>
                            <Loader2 className="w-3 h-3 inline animate-spin mr-1" />上传中 {formatBytes(p.sizeBytes)}
                          </>}
                          {p.state === 'error' && <>
                            <span className="text-red-400 font-semibold">失败</span>
                          </>}
                        </div>
                        {p.state === 'error' && (
                          <div className="text-[9px] font-mono text-red-300 line-clamp-2 break-all" title={p.error}>{p.error}</div>
                        )}
                      </div>
                      <button
                        onClick={() => removePending(p.id)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 hover:bg-red-500/80 text-zinc-100 flex items-center justify-center"
                        title="移除该附件"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      {p.state === 'done' && (
                        <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-emerald-500/90 text-white flex items-center justify-center">
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 w-28 h-36 rounded-xl border border-dashed border-zinc-700 hover:border-zinc-500 flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-zinc-200"
                  title="继续添加图片 / 文件"
                >
                  <ImageIcon className="w-5 h-5" />
                  <span className="text-[10px] font-mono">+ 添加文件</span>
                </button>
              </div>
            )}

            {/* 上传状态提示 + 输入 + 按钮 */}
            <div className="flex gap-2 items-start">
              <input
                type="file"
                ref={fileInputRef}
                multiple
                onChange={(e) => handleFilesSelected(e.target.files)}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={pending.some((p) => p.state === 'uploading')}
                className="p-2.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-xl transition shrink-0 disabled:opacity-50"
                title="选择图片 / 文件（可多选）"
              >
                <ImageIcon className="w-4 h-4" />
              </button>

              <div className="flex-1 relative">
                <textarea
                  value={inputContent}
                  onChange={(e) => setInputContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={pending.length > 0
                    ? `已选 ${pending.length} 个附件${pending.some(p => p.state === 'done') ? '，上传完成后可发送（回车）' : '，全部上传完成后再发送'}`
                    : "输入文本，或粘贴图片/拖放文件（回车发送，Shift+回车换行）"}
                  rows={1}
                  className="w-full resize-none bg-zinc-950/60 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:ring-2 focus:ring-blue-500/40"
                  style={{ maxHeight: 120 }}
                />
              </div>

              <button
                onClick={handleSendMessage}
                disabled={
                  pending.some((p) => p.state === 'uploading') ||
                  (pending.filter(p => p.state === 'done').length === 0 && !inputContent.trim())
                }
                className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white transition shrink-0 self-end"
                title="发送（Ctrl+Enter）"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            {pending.some(p => p.state === 'error') && (
              <div className="text-[10px] font-mono text-red-400 px-1 break-all">
                部分附件上传失败，可点击该附件右上角删除后重试。
              </div>
            )}
          </div>

          {/* 移动端底部设备栏（代替侧栏） */}
          <div className="md:hidden border-t border-zinc-800/80 pt-3 shrink-0">
            <p className="text-[10px] font-mono text-zinc-500 mb-2 flex items-center gap-1.5">
              <Users className="w-3 h-3" />
              加入此剪贴板会话
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
              {allDevices.map((d) => {
                const IC = d.type === 'android' || d.type === 'ios' ? Smartphone
                  : d.type === 'tablet' ? Tablet : Monitor;
                return (
                  <div key={d.id} className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs
                    ${d.status === 'approved' ? 'bg-emerald-900/30 border-emerald-800 text-emerald-200' : 'bg-amber-900/30 border-amber-800 text-amber-200'}`}>
                    <IC className="w-3.5 h-3.5" />
                    <span className="font-medium truncate max-w-[140px]">{d.name}</span>
                    {d.status === 'pending' && isApprover && d.id !== myId && (
                      <div className="flex gap-1 ml-1">
                        <button onClick={() => handleApproveDevice(d.id, true)} className="w-5 h-5 rounded bg-emerald-500/80 hover:bg-emerald-500 flex items-center justify-center" title="同意">
                          <CheckCircle2 className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleApproveDevice(d.id, false)} className="w-5 h-5 rounded bg-red-500/80 hover:bg-red-500 flex items-center justify-center" title="拒绝">
                          <XCircle className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 桌面端右侧面板 */}
        <aside className="hidden md:flex w-80 border-l border-zinc-800/80 bg-[#0c0c0e] p-6 flex-col justify-between shrink-0 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col items-center text-center">
            <div className="flex flex-col items-center mb-6 pb-5 border-b border-zinc-800/80 w-full">
              <div className="w-16 h-16 rounded-[20px] bg-white border border-zinc-200 shadow-[0_8px_24px_rgba(59,130,246,0.25)] flex items-center justify-center mb-3 overflow-hidden">
                <Image src="/logo.jpg" alt="PeerClip" width={52} height={52} priority className="object-contain" />
              </div>
              <h2 className="text-base font-semibold text-zinc-100 tracking-wide mb-0.5">PeerClip</h2>
              <p className="text-[11px] text-zinc-500 font-mono">Cross-Device Clipboard Sync</p>
            </div>

            <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center justify-center mb-3 shadow-inner">
              <QrCode className="w-4 h-4" />
            </div>
            <h3 className="font-medium text-xs text-zinc-200 mb-1">扫码加入</h3>
            <p className="text-[11px] text-zinc-500 mb-4 leading-relaxed">
              让其他设备扫描上方二维码加入当前剪贴板会话。
            </p>

            <div className="w-48 h-48 bg-white rounded-xl p-2 shadow-inner border border-zinc-200 flex items-center justify-center">
              <QRCodeSVG value={qrUrl} size={176} level="M" includeMargin={false} />
            </div>

            <div className="mt-3 w-full">
              <div className="flex items-center justify-between mb-1.5 text-[10px] font-mono text-zinc-500">
                <span>分享链接</span>
                <CopyButton text={qrUrl} compact />
              </div>
              <div className="text-[10px] font-mono text-zinc-300 break-all bg-zinc-900/80 border border-zinc-800 rounded-lg p-2 select-all">
                {qrUrl}
              </div>
            </div>

            <div className="w-full mt-6">
              <p className="text-[10px] font-mono text-zinc-500 mb-2 flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                设备列表 · {allDevices.length}
              </p>
              <div className="space-y-1.5">
                {allDevices.length === 0 && (
                  <div className="text-[10px] text-zinc-600 px-2 py-3 text-center border border-dashed border-zinc-800 rounded-lg">暂无设备</div>
                )}
                {allDevices.map((d) => {
                  const IC = d.type === 'android' || d.type === 'ios' ? Smartphone
                    : d.type === 'tablet' ? Tablet : Monitor;
                  const mine = d.id === myId;
                  return (
                    <div
                      key={d.id}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-xs
                        ${d.status === 'approved'
                          ? mine
                            ? 'bg-blue-900/25 border-blue-900/70 text-blue-200'
                            : 'bg-emerald-900/30 border-emerald-900 text-emerald-200'
                          : 'bg-amber-900/30 border-amber-900 text-amber-200'}`}
                    >
                      <IC className="w-3.5 h-3.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium">{d.name}{mine && <span className="text-[10px] opacity-60 ml-1">(我)</span>}</div>
                        <div className="text-[9px] font-mono opacity-70">{d.type} · {new Date(d.updatedAt).toLocaleTimeString()}</div>
                      </div>
                      {d.status === 'pending' && isApprover && d.id !== myId && (
                        <div className="flex gap-1 ml-1 shrink-0">
                          <button onClick={() => handleApproveDevice(d.id, true)} className="w-6 h-6 rounded-md bg-emerald-500/80 hover:bg-emerald-500 flex items-center justify-center" title="同意加入">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleApproveDevice(d.id, false)} className="w-6 h-6 rounded-md bg-red-500/80 hover:bg-red-500 flex items-center justify-center" title="拒绝加入">
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      {d.status === 'approved' && d.id !== myId && <CheckCircle2 className="w-3.5 h-3.5 opacity-70 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-6 text-center text-[10px] text-zinc-600 font-mono space-y-1">
            <p>30 秒无心跳自动掉线</p>
            <p>消息保存 24 小时 · 附件每天自动清理</p>
          </div>
        </aside>
      </div>

      {/* 移动端侧边栏弹层（扫码 + 设备） */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85%] bg-[#0c0c0e] border-l border-zinc-800 overflow-y-auto p-5 custom-scrollbar">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-zinc-200">房间信息</h3>
              <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col items-center mb-4">
              <div className="w-40 h-40 bg-white rounded-xl p-2 border border-zinc-200">
                <QRCodeSVG value={qrUrl} size={144} level="M" includeMargin={false} />
              </div>
              <div className="mt-2 w-full">
                <div className="flex items-center justify-between mb-1 text-[10px] font-mono text-zinc-500">
                  <span>房间链接</span><CopyButton text={qrUrl} compact />
                </div>
                <div className="text-[10px] font-mono break-all bg-zinc-900 border border-zinc-800 rounded-lg p-2 select-all text-zinc-300">{qrUrl}</div>
              </div>
            </div>

            <p className="text-[10px] font-mono text-zinc-500 mb-2 flex items-center gap-1.5"><Users className="w-3 h-3" />设备列表</p>
            <div className="space-y-1.5 mb-6">
              {allDevices.map((d) => {
                const IC = d.type === 'android' || d.type === 'ios' ? Smartphone : d.type === 'tablet' ? Tablet : Monitor;
                return (
                  <div key={d.id} className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-xs
                    ${d.status === 'approved' ? 'bg-emerald-900/30 border-emerald-900 text-emerald-200' : 'bg-amber-900/30 border-amber-900 text-amber-200'}`}>
                    <IC className="w-3.5 h-3.5" />
                    <div className="flex-1 min-w-0 truncate">{d.name}</div>
                    {d.status === 'pending' && isApprover && d.id !== myId && (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => handleApproveDevice(d.id, true)} className="w-5 h-5 rounded bg-emerald-500/80 flex items-center justify-center"><CheckCircle2 className="w-3 h-3" /></button>
                        <button onClick={() => handleApproveDevice(d.id, false)} className="w-5 h-5 rounded bg-red-500/80 flex items-center justify-center"><XCircle className="w-3 h-3" /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="text-center text-[10px] text-zinc-600 font-mono space-y-1">
              <p>30 秒无心跳自动掉线</p>
              <p>消息保存 24 小时 · 附件每天自动清理</p>
            </div>
          </div>
        </div>
      )}

      {/* 全屏图片预览层（含手势） */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center touch-none"
          style={{ touchAction: 'none' }}
          onClick={() => setPreviewImageUrl(null)}
          onWheel={onPreviewWheel}
        >
          <button
            className="absolute top-4 right-4 z-10 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white"
            onClick={(e) => { e.stopPropagation(); setPreviewImageUrl(null); }}
            aria-label="关闭预览"
          >
            <X className="w-5 h-5" />
          </button>
          <div
            className="max-w-[92vw] max-h-[92vh] select-none cursor-grab active:cursor-grabbing"
            style={{
              transform: `translate(${imgTrans.x}px, ${imgTrans.y}px) scale(${imgScale})`,
              transition: mouseDragRef.current || touchStartRef.current ? 'none' : 'transform 0.18s ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handlePreviewTouchStart}
            onTouchMove={handlePreviewTouchMove}
            onTouchEnd={() => { touchStartRef.current = null; }}
            onMouseDown={onPreviewMouseDown}
            onMouseMove={onPreviewMouseMove}
            onMouseUp={onPreviewMouseUp}
            onMouseLeave={onPreviewMouseUp}
            draggable={false}
          >
            <img src={previewImageUrl} alt="Preview" className="max-w-[92vw] max-h-[92vh] object-contain pointer-events-none" draggable={false} />
          </div>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center text-xs font-mono text-zinc-400/80 pointer-events-none space-x-3">
            <span>双击缩放 1x/2.5x</span>
            <span>·</span>
            <span>双指捏合 0.5x–8x</span>
            <span>·</span>
            <span>放大后可拖动</span>
          </div>
        </div>
      )}

    </main>
  );
}

// ---- 复用的复制按钮组件 ----
function CopyButton({ text, compact = false }: { text: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* 剪贴板权限被拒则忽略 */ }
  };
  if (compact) {
    return (
      <button onClick={onClick} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono transition
        ${copied ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'}`}>
        {copied ? <><Check className="w-3 h-3" />已复制</> : <><Copy className="w-3 h-3" />复制</>}
      </button>
    );
  }
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono transition
      ${copied
        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
        : 'bg-zinc-900/70 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 border border-zinc-800'}`}>
      {copied ? <><Check className="w-3 h-3" /> 已复制</> : <><Copy className="w-3 h-3" /> 复制</>}
    </button>
  );
}
