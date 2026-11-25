import { auth } from "@/auth";
import { query } from "@/lib/db";

/**
 * 校验当前登录用户是否为管理员，是则返回其邮箱，否则返回 null。
 * 管理端接口统一用它做入口鉴权。
 */
export async function getAdminEmail(): Promise<string | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  try {
    const rows = await query<{ role: string | null }>(
      `SELECT role FROM public.account_users WHERE email = $1 LIMIT 1`,
      [email],
    );
    return rows[0]?.role === "admin" ? email : null;
  } catch {
    return null;
  }
}
