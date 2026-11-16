/**
 * Private PT Tracker — BEP-3 announce
 *
 * URL 格式: /announce?passkey=xxx&info_hash=xxx&peer_id=xxx&port=xxx&uploaded=N&downloaded=N&left=N&event=started|stopped|completed
 *
 * 返回: bencoded response（紧凑 peer 列表）
 *
 * 关键设计：
 *   - 活跃 peer 落库（torrent_peers 表），15 分钟无心跳视为掉线
 *     —— 原先存在进程内存 Map，无状态/多实例部署下各实例互相看不见，计数会错
 *   - 累计上传下载写入 PG（user_torrent_stats）
 *   - seed/leech/download 计数统一由 DB 统计后回写 posts
 *   - 只有 whitelist 里的 info_hash + 有效 passkey 才能 announce
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserByPasskey } from "@/lib/passkey";
import { ensureSchema, query } from "@/lib/db";

export const runtime = "nodejs";

// peer 掉线判定：15 分钟无 announce
const PEER_TTL_SQL = "INTERVAL '15 minutes'";

// tracker 可能在站点页面被访问前就先收到 announce，这里惰性确保表存在（每个实例只跑一次）
let trackerSchemaReady = false;
async function ensureTrackerSchema() {
  if (trackerSchemaReady) return;
  await ensureSchema();
  trackerSchemaReady = true;
}

/* ===== Bencode 简单输出（只支持 tracker 响应用到的类型） ===== */
function bencodeRawBytes(buf: Buffer | Uint8Array): Buffer {
  const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return Buffer.concat([Buffer.from(`${bytes.length}:`), bytes]);
}

function bencodeString(s: string): Buffer {
  return Buffer.from(`${Buffer.byteLength(s)}:${s}`);
}
function bencodeInt(n: number): Buffer {
  // tracker 里 number 通常在 int32 范围，Node Buffer 够用
  return Buffer.from(`i${n}e`);
}
function bencodeDict(obj: Record<string, Buffer>): Buffer {
  const keys = Object.keys(obj).sort();
  const parts: Buffer[] = [Buffer.from("d")];
  for (const k of keys) {
    parts.push(bencodeString(k));
    parts.push(obj[k]);
  }
  parts.push(Buffer.from("e"));
  return Buffer.concat(parts);
}

/** Buffer → ArrayBuffer 支撑的 Uint8Array（满足 Response BodyInit 类型要求） */
export function bodyBytes(buf: Buffer): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}

function errorResponse(msg: string): Uint8Array<ArrayBuffer> {
  return bodyBytes(
    bencodeDict({
      "failure reason": bencodeString(msg),
    }),
  );
}

/** compact peer 列表：每 peer 6 字节 — 4 IPv4 + 2 port (big-endian) */
function getCompactPeers(peers: { ip: string; port: number }[]): Buffer {
  const out: number[] = [];
  for (const p of peers) {
    const oct = p.ip.split(".");
    if (oct.length !== 4) continue; // 暂只支持 IPv4
    for (const o of oct) out.push(parseInt(o, 10));
    out.push((p.port >> 8) & 0xff, p.port & 0xff);
  }
  return Buffer.from(out);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const params = url.searchParams;

  const passkey = params.get("passkey") || "";
  const peerId = params.get("peer_id") || "";
  const portStr = params.get("port") || "";
  const uploaded = parseInt(params.get("uploaded") || "0", 10);
  const downloaded = parseInt(params.get("downloaded") || "0", 10);
  const left = parseInt(params.get("left") || "0", 10);
  const event = params.get("event") || "";
  const compact = parseInt(params.get("compact") || "1", 10);

  // --- 取 info_hash：只读 torrent URL 里我们自己带的 ih=hex ---
  // BT 客户端也会发 info_hash=20字节二进制，但 Next.js 框架层会把
  // 非 UTF-8 字节替换成 U+FFFD，彻底破坏掉，所以我们完全忽略它
  const infoHashHex = params.get("ih") || "";

  // --- 参数校验 ---
  if (passkey.length !== 32) {
    return new NextResponse(errorResponse("invalid passkey"), {
      headers: { "Content-Type": "text/plain" },
    });
  }
  if (infoHashHex.length !== 40 || !/^[a-f0-9]+$/i.test(infoHashHex)) {
    return new NextResponse(errorResponse("invalid info_hash"), {
      headers: { "Content-Type": "text/plain" },
    });
  }
  if (!peerId) {
    return new NextResponse(errorResponse("missing peer_id"), {
      headers: { "Content-Type": "text/plain" },
    });
  }
  const port = parseInt(portStr, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return new NextResponse(errorResponse("invalid port"), {
      headers: { "Content-Type": "text/plain" },
    });
  }

  // --- passkey → 用户 ---
  const email = await getUserByPasskey(passkey);
  if (!email) {
    return new NextResponse(errorResponse("invalid passkey"), {
      headers: { "Content-Type": "text/plain" },
    });
  }

  // --- whitelist 校验 ---
  const wl = await query<{ post_id: string }>(
    "SELECT post_id FROM public.torrent_whitelist WHERE info_hash = $1",
    [infoHashHex],
  );
  if (wl.length === 0) {
    return new NextResponse(errorResponse("torrent not registered"), {
      headers: { "Content-Type": "text/plain" },
    });
  }

  // --- peer IP ---
  const fwd = req.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0].trim() : req.nextUrl.hostname) || "127.0.0.1";

  // --- 更新 peer 表 ---
  await ensureTrackerSchema();
  const peerKey = `${email}|${peerId}`;

  // 清理过期 peer（全局，last_seen 有索引，表规模很小）与读取上一次状态并行
  const [, prevRows] = await Promise.all([
    query(`DELETE FROM public.torrent_peers WHERE last_seen < NOW() - ${PEER_TTL_SQL}`),
    query<{ left_bytes: string }>(
      "SELECT left_bytes FROM public.torrent_peers WHERE info_hash = $1 AND peer_key = $2",
      [infoHashHex, peerKey],
    ),
  ]);
  const prevLeft = prevRows.length ? Number(prevRows[0].left_bytes) : null;

  if (event === "stopped") {
    await query(
      "DELETE FROM public.torrent_peers WHERE info_hash = $1 AND peer_key = $2",
      [infoHashHex, peerKey],
    );
  } else {
    await query(
      `INSERT INTO public.torrent_peers (info_hash, peer_key, user_email, ip, port, left_bytes, last_seen)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (info_hash, peer_key) DO UPDATE SET
         ip         = EXCLUDED.ip,
         port       = EXCLUDED.port,
         left_bytes = EXCLUDED.left_bytes,
         last_seen  = NOW()`,
      [infoHashHex, peerKey, email, ip, port, left],
    );
  }

  // --- 统计当前种子的 seed / leech + 拉取其他 peer（并行） ---
  const [statsRows, peerRows] = await Promise.all([
    query<{ complete: number; incomplete: number }>(
      `SELECT COUNT(*) FILTER (WHERE left_bytes = 0)::int AS complete,
              COUNT(*) FILTER (WHERE left_bytes > 0)::int AS incomplete
         FROM public.torrent_peers
        WHERE info_hash = $1`,
      [infoHashHex],
    ),
    query<{ ip: string; port: number }>(
      `SELECT ip, port FROM public.torrent_peers
        WHERE info_hash = $1 AND peer_key <> $2
        ORDER BY last_seen DESC
        LIMIT 50`,
      [infoHashHex, peerKey],
    ),
  ]);
  const stats = statsRows[0] ?? { complete: 0, incomplete: 0 };

  const isSeeding = left === 0;

  // --- 回写 posts 计数 + 用户统计（stopped 事件不写统计） ---
  const postsUpdate = query(
    `UPDATE public.posts SET seed_count = $1, leech_count = $2
      WHERE id = (SELECT post_id FROM public.torrent_whitelist WHERE info_hash = $3)
        AND (seed_count IS DISTINCT FROM $1 OR leech_count IS DISTINCT FROM $2)`,
    [stats.complete, stats.incomplete, infoHashHex],
  );

  const statsWrite =
    event === "stopped"
      ? null
      : query(
          `INSERT INTO public.user_torrent_stats
             (user_email, info_hash, uploaded, downloaded, is_seeding, is_leeching, last_announce)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (user_email, info_hash) DO UPDATE SET
             uploaded      = GREATEST(public.user_torrent_stats.uploaded, EXCLUDED.uploaded),
             downloaded    = GREATEST(public.user_torrent_stats.downloaded, EXCLUDED.downloaded),
             is_seeding    = EXCLUDED.is_seeding,
             is_leeching   = EXCLUDED.is_leeching,
             last_announce = NOW()`,
          [email, infoHashHex, uploaded, downloaded, isSeeding, left > 0],
        );

  await Promise.all([postsUpdate, statsWrite]);

  // --- 下载完成 +1 ---
  // 触发条件：BT 客户端发 event=completed，或 peer 从 leech(left>0) 变成 seed(left=0)
  // 同一用户同一种子只计一次：靠 user_torrent_stats.completed_at 去重
  if (event !== "stopped") {
    const justCompleted = prevLeft !== null && prevLeft > 0 && left === 0;
    if (event === "completed" || justCompleted) {
      const marked = await query(
        `UPDATE public.user_torrent_stats SET completed_at = NOW()
          WHERE user_email = $1 AND info_hash = $2 AND completed_at IS NULL
          RETURNING 1`,
        [email, infoHashHex],
      );
      if (marked.length > 0) {
        await query(
          `UPDATE public.posts SET download_count = download_count + 1
            WHERE id = (SELECT post_id FROM public.torrent_whitelist WHERE info_hash = $1)`,
          [infoHashHex],
        );
      }
    }
  }

  // --- 构造响应 ---
  const interval = 300; // 5 分钟

  const response: Record<string, Buffer> = {
    interval: bencodeInt(interval),
    complete: bencodeInt(stats.complete),
    incomplete: bencodeInt(stats.incomplete),
    "tracker id": bencodeString("astra-pt"),
  };

  if (compact === 1) {
    // compact peer 是原始字节，不能走 string 路径
    response["peers"] = bencodeRawBytes(getCompactPeers(peerRows));
  } else {
    // 非 compact — BEP-3 字典列表（略，tracker 客户端基本都用 compact=1）
    response["peers"] = bencodeString("");
  }

  return new NextResponse(bodyBytes(bencodeDict(response)), {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "no-store",
    },
  });
}

/*
 * scrape 端点 — 见 /api/scrape/route.ts（Next.js 路由方法限制）
 */
