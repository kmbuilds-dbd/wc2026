import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requestAccess, getAccessStatus } from "@/lib/access";
import { signApproveToken } from "@/lib/access-token";
import { sendAccessRequestEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const { email } = (await req.json()) as { email?: string };
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const normalized = email.toLowerCase();
  const status = await getAccessStatus(normalized);

  if (status === "approved") {
    return NextResponse.json({ error: "Already approved" }, { status: 409 });
  }
  if (status === "pending") {
    return NextResponse.json({ ok: true }); // idempotent
  }

  await requestAccess(normalized);

  const { env } = await getCloudflareContext({ async: true });
  const secret = (env as unknown as { CRON_SECRET?: string }).CRON_SECRET;
  const adminEmail = env.ADMIN_EMAIL;
  const resendKey = (env as unknown as { RESEND_API_KEY?: string }).RESEND_API_KEY;
  const fromEmail =
    (env as unknown as { RESEND_FROM_EMAIL?: string }).RESEND_FROM_EMAIL ??
    `noreply@${new URL(req.url).hostname}`;

  if (resendKey && adminEmail) {
    const token = secret ? await signApproveToken(secret, normalized) : "no-secret-configured";
    const approveUrl = `${new URL(req.url).origin}/api/access/approve?email=${encodeURIComponent(normalized)}&token=${encodeURIComponent(token)}`;
    try {
      await sendAccessRequestEmail({
        apiKey: resendKey,
        from: fromEmail,
        adminEmail,
        userEmail: normalized,
        approveUrl,
      });
    } catch (err) {
      // Email failure is non-fatal — request is recorded in KV.
      console.error("Failed to send admin notification:", err);
    }
  } else {
    // Dev / missing secrets — log the approve URL so it's accessible.
    const token = secret ? await signApproveToken(secret, normalized) : "dev-no-secret";
    const approveUrl = `${new URL(req.url).origin}/api/access/approve?email=${encodeURIComponent(normalized)}&token=${encodeURIComponent(token)}`;
    console.log(`[access] approve URL for ${normalized}: ${approveUrl}`);
  }

  return NextResponse.json({ ok: true });
}
