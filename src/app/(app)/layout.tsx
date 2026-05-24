import { redirect } from "next/navigation";
import { getUserEmail } from "@/lib/auth";
import { getAccessStatus } from "@/lib/access";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const email = await getUserEmail();
  if (!email) redirect("/join");

  const status = await getAccessStatus(email);
  if (status !== "approved") redirect("/join");

  return <>{children}</>;
}
