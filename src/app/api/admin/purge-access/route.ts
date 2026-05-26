import { NextRequest, NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

// POST /api/admin/purge-access
// Deletes all wc26:approved:{email} KV entries except the admin email.
export async function POST(request: NextRequest) {
  await requirePrivileged(request);

  const { env } = await getCloudflareContext({ async: true });
  const adminEmail = env.ADMIN_EMAIL?.toLowerCase() ?? "";

  const listed = await env.CACHE.list({ prefix: "wc26:approved:" });
  const toDelete = listed.keys.filter((k) => k.name !== `wc26:approved:${adminEmail}`);

  await Promise.all(toDelete.map((k) => env.CACHE.delete(k.name)));

  return NextResponse.json({
    deleted: toDelete.map((k) => k.name),
    kept: `wc26:approved:${adminEmail}`,
  });
}
