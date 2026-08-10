import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const maxDuration = 30;

// -------------------------
// Cloudflare R2 环境变量（在 .env.local 填，Vercel 后台设置同名变量即可）
// -------------------------
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      R2_ACCOUNT_ID?: string;
      R2_ACCESS_KEY_ID?: string;
      R2_SECRET_ACCESS_KEY?: string;
      R2_BUCKET?: string;
      R2_PUBLIC_DOMAIN?: string;
      REDIS_URL?: string;
    }
  }
}

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }

/** 按日期分层 + 16 位随机：YYYY/MM/DD/random.ext */
function buildObjectKey(ext: string) {
  const now = new Date();
  const ymd = `${now.getFullYear()}/${pad2(now.getMonth() + 1)}/${pad2(now.getDate())}`;
  const rand = crypto.randomBytes(12).toString('base64url');
  return `${ymd}/${rand}.${ext}`;
}

function normalizePublicDomain(d: string) {
  return d.replace(/\/+$/, '');
}

function missingEnv(name: string) {
  return NextResponse.json(
    { success: false, error: `未配置环境变量 ${name}（请在 .env.local 或 Vercel 后台填写）` },
    { status: 500 }
  );
}

/**
 * presigned PUT URL 模式（彻底绕开 Vercel 4.5MB 请求体上限）：
 *   POST /api/upload  JSON { contentType, ext?, size? }
 *   → { success, uploadUrl: "R2 presigned PUT URL 有效期 5 分钟",
 *         publicUrl: "图片的公网访问 URL",
 *         objectKey: "YYYY/MM/DD/xxx.png" }
 *   前端拿到后直接浏览器 fetch PUT uploadUrl（body=Blob，不加任何头），成功后 publicUrl 就能直接用。
 *   优势：① Vercel 完全不转发文件（body 极小，4.5MB 限制不生效）
 *         ② 客户端直连 R2 公网域名（Cloudflare CDN，全球加速）
 */
export async function POST(request: Request) {
  try {
    // 1. 读请求体（只有几字节 JSON，无 body 体积压力）
    let contentType = 'image/png';
    let ext = 'png';
    try {
      const body = await request.json();
      if (body?.contentType && typeof body.contentType === 'string') {
        contentType = body.contentType;
        ext = (contentType.split('/')[1] || 'png').split('+')[0];
      }
      if (body?.ext && typeof body.ext === 'string') ext = body.ext;
    } catch {
      // 空 body 也允许，默认 png
    }

    // 2. 校验 R2 env
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET || 'lcv';
    const publicDomain = process.env.R2_PUBLIC_DOMAIN;

    if (!accountId) return missingEnv('R2_ACCOUNT_ID');
    if (!accessKeyId) return missingEnv('R2_ACCESS_KEY_ID');
    if (!secretAccessKey) return missingEnv('R2_SECRET_ACCESS_KEY');
    if (!publicDomain) return missingEnv('R2_PUBLIC_DOMAIN');

    const objectKey = buildObjectKey(ext);
    const publicBase = normalizePublicDomain(publicDomain);
    const publicUrl = `${publicBase}/${objectKey}`;

    // 3. 构造 S3 客户端
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });

    // 4. 生成 presigned PUT URL（5 分钟有效）
    //    注意：这里不签 Content-Type，避免浏览器 Blob.type 解析差异导致签名不匹配（R2 会按签名精确比对）
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
      { expiresIn: 60 * 5 }
    );

    return NextResponse.json({ success: true, uploadUrl, publicUrl, objectKey });
  } catch (e: any) {
    console.error('[生成presign失败]', e?.name, e?.message);
    const code: string = e?.name || e?.Code || '';
    const hint: Record<string, string> = {
      InvalidAccessKeyId: 'R2_ACCESS_KEY_ID 无效',
      SignatureDoesNotMatch: 'R2_ACCESS_KEY_ID 或 R2_SECRET_ACCESS_KEY 错误',
      AccessDenied: '该 API Token 没有桶写权限（在 R2 Token 权限里勾选 Object Read & Write）',
      NoSuchBucket: `R2 存储桶 "${process.env.R2_BUCKET || 'lcv'}" 不存在，请核对 R2_BUCKET`,
    };
    const extra = hint[code] ? ` · ${hint[code]}` : '';
    return NextResponse.json(
      { success: false, error: `Presign 失败 ${code || ''}: ${e.message || '未知错误'}${extra}` },
      { status: 502 }
    );
  }
}
