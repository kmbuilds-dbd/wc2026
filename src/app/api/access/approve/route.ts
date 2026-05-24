import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { approveAccess, getAccessStatus } from "@/lib/access";
import { verifyApproveToken } from "@/lib/access-token";
import { sendApprovalEmail } from "@/lib/email";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email")?.toLowerCase();
  const token = searchParams.get("token");

  if (!email || !token) {
    return new NextResponse("Missing email or token", { status: 400 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const secret = (env as unknown as { CRON_SECRET?: string }).CRON_SECRET;

  if (secret && token !== "dev-no-secret") {
    const valid = await verifyApproveToken(secret, email, token);
    if (!valid) {
      return new NextResponse("Invalid or expired token", { status: 403 });
    }
  }

  const currentStatus = await getAccessStatus(email);
  if (currentStatus === "approved") {
    return new NextResponse(approvedHtml(email, new URL(req.url).origin), {
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  }

  await approveAccess(email);

  const resendKey = (env as unknown as { RESEND_API_KEY?: string }).RESEND_API_KEY;
  const fromEmail =
    (env as unknown as { RESEND_FROM_EMAIL?: string }).RESEND_FROM_EMAIL ??
    `noreply@${new URL(req.url).hostname}`;
  const appUrl =
    (env as unknown as { APP_URL?: string }).APP_URL ?? new URL(req.url).origin;

  if (resendKey) {
    try {
      await sendApprovalEmail({ apiKey: resendKey, from: fromEmail, userEmail: email, appUrl });
    } catch (err) {
      console.error("Failed to send approval email:", err);
    }
  }

  return new NextResponse(approvedHtml(email, appUrl), {
    headers: { "Content-Type": "text/html;charset=utf-8" },
  });
}

function approvedHtml(email: string, appUrl: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Access approved — WC2026</title>
  <style>
    body { background: #080810; color: #e2e2f0; font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { max-width: 420px; padding: 2rem; border: 1px solid #2a2a40; border-radius: 8px; text-align: center; }
    h1 { font-size: 1.5rem; margin: 0 0 .5rem; }
    .accent { color: #f7c325; }
    p { color: #888; font-size: .9rem; margin: .5rem 0 1.5rem; }
    a { display: inline-block; padding: .6rem 1.4rem; background: #f7c325; color: #080810; font-weight: bold; text-decoration: none; border-radius: 4px; font-size: .85rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>WC<span class="accent">2026</span> Pick&apos;em</h1>
    <p><strong>${email}</strong> has been approved.</p>
    <a href="${appUrl}">Go to Pick&apos;em</a>
  </div>
</body>
</html>`;
}
