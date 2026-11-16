/**
 * Cloudflare R2 对象存储（S3 兼容）
 *
 * 环境变量:
 *   R2_ACCOUNT_ID         Cloudflare 账号 ID
 *   R2_ACCESS_KEY_ID      R2 API Token 的 Access Key ID
 *   R2_SECRET_ACCESS_KEY  R2 API Token 的 Secret Access Key
 *   R2_BUCKET             存储桶名称
 *   R2_PUBLIC_BASE_URL    公共访问域名（r2.dev 或自定义域名），末尾不带斜杠
 *
 * 未配置时 isR2Configured() 返回 false，调用方自行决定降级策略。
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/** 五个变量齐全才算配置完成 */
export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET &&
    process.env.R2_PUBLIC_BASE_URL,
  );
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
      },
    });
  }
  return client;
}

/**
 * 上传对象，返回可公开访问的完整 URL
 * key 形如 uploads/covers/1730000000-abcd1234.jpg
 */
export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<string> {
  if (!isR2Configured()) {
    throw new Error("R2 未配置（缺少 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_PUBLIC_BASE_URL）");
  }

  await getClient().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      // 文件名带时间戳与随机串，内容不会变，可长期缓存
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  const base = (process.env.R2_PUBLIC_BASE_URL as string).replace(/\/+$/, "");
  return `${base}/${key}`;
}
