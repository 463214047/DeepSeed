import { NextResponse } from "next/server";
import { getAdminEmail } from "@/lib/admin";
import { ensureSchema, query } from "@/lib/db";
import { isTicketStatus } from "@/lib/tickets";

type AdminTicketRow = {
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
  reply_count: string;
};

/** GET /api/admin/tickets?status=open|processing|resolved|all → 全体工单列表 */
export async function GET(req: Request) {
  try {
    const admin = await getAdminEmail();
    if (!admin) return NextResponse.json({ ok: false, message: "无权访问" }, { status: 403 });

    await ensureSchema();

    const raw = new URL(req.url).searchParams.get("status");
    const status = raw && isTicketStatus(raw) ? raw : null;

    const [tickets, counts] = await Promise.all([
      query<AdminTicketRow>(
        `SELECT t.id,
                t.user_email,
                u.name AS user_name,
                u.uid AS user_uid,
                u.avatar_url AS user_avatar,
                t.content,
                t.status,
                t.handled_by,
                t.created_at,
                t.last_reply_at,
                (SELECT COUNT(*) FROM public.contact_ticket_replies r WHERE r.ticket_id = t.id)
                  AS reply_count
           FROM public.contact_tickets t
           LEFT JOIN public.account_users u ON u.email = t.user_email
          WHERE ($1::text IS NULL OR t.status = $1)
          ORDER BY (t.status = 'resolved') ASC, COALESCE(t.last_reply_at, t.created_at) DESC
          LIMIT 200`,
        [status],
      ),
      query<{ status: string; count: string }>(
        `SELECT status, COUNT(*) AS count FROM public.contact_tickets GROUP BY status`,
      ),
    ]);

    const countMap = { open: 0, processing: 0, resolved: 0 };
    let total = 0;
    for (const row of counts) {
      const n = Number(row.count) || 0;
      total += n;
      if (row.status === "open" || row.status === "processing" || row.status === "resolved") {
        countMap[row.status] = n;
      }
    }

    return NextResponse.json({
      ok: true,
      tickets: tickets.map((t) => ({ ...t, reply_count: Number(t.reply_count) || 0 })),
      counts: { ...countMap, all: total },
    });
  } catch (e) {
    console.error("[admin tickets GET]", e);
    return NextResponse.json({ ok: false, message: "服务器内部错误" }, { status: 500 });
  }
}
