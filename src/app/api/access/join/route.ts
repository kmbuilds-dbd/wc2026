import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getUserEmail } from "@/lib/auth";
import { getAccessStatus, approveAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

// GET — handles redirect from the old CF-Access-authenticated flow (still works if CF Access is enforcing)
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const email = await getUserEmail();

  if (!email) {
    return NextResponse.redirect(new URL("/join", request.url));
  }

  const status = await getAccessStatus(email);
  if (status === "approved") {
    return grantSession(email, new URL("/", request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/join", request.url));
  }

  const { env } = await getCloudflareContext({ async: true });
  const inviteCode = (env as unknown as { INVITE_CODE?: string }).INVITE_CODE;
  if (!inviteCode || code !== inviteCode) {
    return NextResponse.redirect(new URL("/join?error=invalid", request.url));
  }

  await approveAccess(email);
  return grantSession(email, new URL("/", request.url));
}

// POST — handles the email form submission from /join
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = formData.get("email")?.toString().toLowerCase().trim();
  const code = formData.get("code")?.toString();

  if (!email || !email.includes("@")) {
    return NextResponse.redirect(
      new URL(`/join?code=${encodeURIComponent(code ?? "")}&error=email`, request.url)
    );
  }

  const { env } = await getCloudflareContext({ async: true });
  const inviteCode = (env as unknown as { INVITE_CODE?: string }).INVITE_CODE;
  if (!inviteCode || code !== inviteCode) {
    return NextResponse.redirect(new URL("/join?error=invalid", request.url));
  }

  await approveAccess(email);
  return grantSession(email, new URL("/", request.url));
}

function grantSession(email: string, destination: URL): NextResponse {
  const response = NextResponse.redirect(destination);
  response.cookies.set("wc_email", email, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return response;
}
