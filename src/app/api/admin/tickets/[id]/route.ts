import { NextResponse } from "next/server";
import { getAdminEmail } from "@/lib/admin";
import { ensureSchema, query } from "@/lib/db";
import { isTicketStatus } from "@/lib/tickets";

type TicketDetail = {
  id: string;
  user_email: string;
  user_name: string | null;
  user_uid: number | null;
  user_avatar: string | null;
  content: string;
  status: string;
  handled_by: string | null;
  created_at: string;
  last_reply_at: string | null;
};

type ReplyRow = {
  id: string;
  sender_email: string;
  is_admin: boolean;
  content: string;
  created_at: string;
};

const MAX_REPLY_LEN = 5000;

function parseId(raw: string): string | null {
  return /^\d+$/.test(raw) ? raw : null;
}

/** GET /api/admin/tickets/:id → 工单详情与回复 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await getAdminEmail();
    if (!admin) return NextResponse.json({ ok: false, message: "无权访问" }, { status: 403 });

    await ensureSchema();
    const id = parseId((await params).id);
    if (!id) return NextResponse.json({ ok: false, message: "参数错误" }, { status: 400 });

    const rows = await query<TicketDetail>(
      `SELECT t.id,
              t.user_email,
              u.name AS user_name,
              u.uid AS user_uid,
              u.avatar_url AS user_avatar,
              t.content,
              t.status,
              t.handled_by,
              t.created_at,
              t.last_reply_at
         FROM public.contact_tickets t
         LEFT JOIN public.account_users u ON u.email = t.user_email
        WHERE t.id = $1
        LIMIT 1`,
      [id],
    );
    const ticket = rows[0];
    if (!ticket) return NextResponse.json({ ok: false, message: "工单不存在" }, { status: 404 });

    const replies = await query<ReplyRow>(
      `SELECT id, sender_email, is_admin, content, created_at
         FROM public.contact_ticket_replies
        WHERE ticket_id = $1
        ORDER BY created_at ASC`,
      [id],
    );

    return NextResponse.json({ ok: true, ticket, replies });
  } catch (e) {
    console.error("[admin ticket GET]", e);
    return NextResponse.json({ ok: false, message: "服务器内部错误" }, { status: 500 });
  }
}

/** PATCH /api/admin/tickets/:id → 修改状态（open / processing / resolved） */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await getAdminEmail();
    if (!admin) return NextResponse.json({ ok: false, message: "无权访问" }, { status: 403 });

    await ensureSchema();
    const id = parseId((await params).id);
    if (!id) return NextResponse.json({ ok: false, message: "参数错误" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as { status?: unknown };
    if (!isTicketStatus(body.status)) {
      return NextResponse.json({ ok: false, message: "状态不合法" }, { status: 400 });
    }
    const status = body.status;

    const rows = await query<{ id: string }>(
      `UPDATE public.contact_tickets
          SET status = $2, handled_by = $3
        WHERE id = $1
        RETURNING id`,
      [id, status, admin],
    );
    if (rows.length === 0) {
      return NextResponse.json({ ok: false, message: "工单不存在" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, status });
  } catch (e) {
    console.error("[admin ticket PATCH]", e);
    return NextResponse.json({ ok: false, message: "服务器内部错误" }, { status: 500 });
  }
}

/** POST /api/admin/tickets/:id → 管理员回复（纯文本，保留换行） */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await getAdminEmail();
    if (!admin) return NextResponse.json({ ok: false, message: "无权访问" }, { status: 403 });

    await ensureSchema();
    const id = parseId((await params).id);
    if (!id) return NextResponse.json({ ok: false, message: "参数错误" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as { content?: unknown };
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return NextResponse.json({ ok: false, message: "请填写回复内容" }, { status: 400 });
    if (content.length > MAX_REPLY_LEN) {
      return NextResponse.json(
        { ok: false, message: `回复不能超过 ${MAX_REPLY_LEN} 个字符` },
        { status: 400 },
      );
    }

    const reply = await query<ReplyRow>(
      `INSERT INTO public.contact_ticket_replies (ticket_id, sender_email, is_admin, content)
       VALUES ($1, $2, TRUE, $3)
       RETURNING id, sender_email, is_admin, content, created_at`,
      [id, admin, content],
    );

    // 首次回复的把工单推进到「处理中」，并记录最近回复时间
    await query(
      `UPDATE public.contact_tickets
          SET last_reply_at = NOW(),
              handled_by = $2,
              status = CASE WHEN status = 'open' THEN 'processing' ELSE status END
        WHERE id = $1`,
      [id, admin],
    );

    return NextResponse.json({ ok: true, reply: reply[0] });
  } catch (e) {
    console.error("[admin ticket POST]", e);
    return NextResponse.json({ ok: false, message: "服务器内部错误" }, { status: 500 });
  }
}
