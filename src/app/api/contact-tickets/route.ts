import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureSchema, query } from "@/lib/db";

const MAX_LEN = 10000;

/** POST /api/contact-tickets → 提交一条新工单（不指定接收人，管理员共享） */
export async function POST(req: Request) {
  try {
    await ensureSchema();
    const session = await auth();
    const me = session?.user?.email;
    if (!me) return NextResponse.json({ ok: false, message: "未登录" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { content?: unknown };
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!content) return NextResponse.json({ ok: false, message: "请填写内容" }, { status: 400 });
    if (content.length > MAX_LEN) {
      return NextResponse.json(
        { ok: false, message: `内容不能超过 ${MAX_LEN} 个字符` },
        { status: 400 },
      );
    }

    const rows = await query<{ id: string }>(
      `INSERT INTO public.contact_tickets (user_email, content)
       VALUES ($1, $2)
       RETURNING id`,
      [me, content],
    );

    return NextResponse.json({ ok: true, id: rows[0]?.id });
  } catch (e) {
    console.error("[contact-tickets POST]", e);
    return NextResponse.json({ ok: false, message: "服务器内部错误" }, { status: 500 });
  }
}
