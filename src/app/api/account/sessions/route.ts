/**
 * GET    /api/account/sessions        列出当前账号的登录设备
 * DELETE /api/account/sessions?id=xxx 下线指定设备（删除记录即失效）
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query, ensureSchema } from "@/lib/db";

let schemaEnsured = false;
async function ensureOnce() {
  if (schemaEnsured) return;
  await ensureSchema();
  schemaEnsured = true;
}

type SessionRow = {
  id: string;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  last_seen_at: string;
};

export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ ok: false, message: "未登录" }, { status: 401 });
  }

  try {
    await ensureOnce();
    const currentId =
      (session.user as { sessionId?: string }).sessionId ?? null;
    const rows = await query<SessionRow>(
      `SELECT id, user_agent, ip, created_at, last_seen_at
         FROM public.user_sessions
        WHERE user_email = $1
        ORDER BY last_seen_at DESC
        LIMIT 50`,
      [email],
    );
    return NextResponse.json({
      ok: true,
      currentId,
      sessions: rows.map((r) => ({
        id: r.id,
        userAgent: r.user_agent ?? "",
        ip: r.ip ?? "",
        createdAt: r.created_at,
        lastSeenAt: r.last_seen_at,
        current: r.id === currentId,
      })),
    });
  } catch (err) {
    console.error("[account/sessions] GET error:", err);
    return NextResponse.json({ ok: false, message: "服务器错误" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ ok: false, message: "未登录" }, { status: 401 });
  }

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ ok: false, message: "无效的会话" }, { status: 400 });
  }

  try {
    const rows = await query<{ id: string }>(
      `DELETE FROM public.user_sessions
        WHERE id = $1 AND user_email = $2
      RETURNING id`,
      [id, email],
    );
    if (rows.length === 0) {
      return NextResponse.json({ ok: false, message: "该设备已下线" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[account/sessions] DELETE error:", err);
    return NextResponse.json({ ok: false, message: "服务器错误" }, { status: 500 });
  }
}
