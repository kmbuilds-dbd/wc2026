import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getAccessStatus } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const clerkUser = await currentUser();
  if (!clerkUser) redirect("/join");

  const email = clerkUser.emailAddresses[0]?.emailAddress?.toLowerCase();
  if (!email) redirect("/join");

  const status = await getAccessStatus(email);
  if (status !== "approved") redirect("/join");

  return <>{children}</>;
}
