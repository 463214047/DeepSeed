/**
 * R2 存储用量守卫 —— 防止累计上传超过免费额度
 *
 * R2 免费额度为 10 GB·月存储，这里留 1 GB 余量，达到 9 GiB 即停止接收新上传。
 * 用量保存在 public.r2_usage 单行表；上传前先「预占」字节数，上传失败再回退，
 * 用单条条件 UPDATE 保证并发上传也不会突破上限。
 */

import { query, ensureSchema } from "@/lib/db";

/** 熔断阈值（字节）：9 GiB */
export const STORAGE_LIMIT_BYTES = 9 * 1024 * 1024 * 1024;

let schemaReady = false;
async function ensureOnce() {
  if (schemaReady) return;
  await ensureSchema();
  schemaReady = true;
}

/** 当前累计已用字节数 */
export async function getUsedBytes(): Promise<number> {
  await ensureOnce();
  const rows = await query<{ total_bytes: string }>(
    `SELECT total_bytes FROM public.r2_usage WHERE id = 1`,
  );
  return Number(rows[0]?.total_bytes ?? 0);
}

/**
 * 预占 bytes 空间
 * 未超阈值 → 返回预占后的累计字节数；超阈值 → 返回 null（调用方拒绝上传）
 */
export async function reserveBytes(bytes: number): Promise<number | null> {
  await ensureOnce();
  const rows = await query<{ total_bytes: string }>(
    `UPDATE public.r2_usage
        SET total_bytes = total_bytes + $1, updated_at = NOW()
      WHERE id = 1 AND total_bytes + $1 <= $2
      RETURNING total_bytes`,
    [bytes, STORAGE_LIMIT_BYTES],
  );
  return rows[0] ? Number(rows[0].total_bytes) : null;
}

/** 上传失败时回退预占的额度 */
export async function releaseBytes(bytes: number): Promise<void> {
  await query(
    `UPDATE public.r2_usage
        SET total_bytes = GREATEST(total_bytes - $1, 0), updated_at = NOW()
      WHERE id = 1`,
    [bytes],
  );
}
