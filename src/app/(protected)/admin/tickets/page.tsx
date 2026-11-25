import { notFound } from "next/navigation";
import { getAdminEmail } from "@/lib/admin";
import AdminTicketsClient from "./AdminTicketsClient";

export const metadata = { title: "工单收件箱" };

export default async function AdminTicketsPage() {
  const admin = await getAdminEmail();
  if (!admin) notFound();

  return <AdminTicketsClient />;
}
