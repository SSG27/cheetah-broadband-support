import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, getUserFromToken, isAdmin } from "@/lib/auth";
import AdminInbox from "./admin-inbox";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const user = await getUserFromToken(cookieStore.get(COOKIE_NAME)?.value);
  if (!isAdmin(user)) redirect(user ? "/" : "/login");
  return <AdminInbox />;
}
