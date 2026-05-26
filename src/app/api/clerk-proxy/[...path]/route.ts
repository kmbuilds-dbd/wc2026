import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Clerk's real FAPI server — clerk.followbuilders.workers.dev CNAMEs here,
// but workers.dev doesn't support custom subdomains, so we proxy manually.
const FAPI_HOST = "clerk.followbuilders.workers.dev";
const FAPI_ORIGIN = "https://frontend-api.clerk.dev";

async function handle(req: NextRequest, params: { path: string[] }) {
  const url = new URL(req.url);
  const target = `${FAPI_ORIGIN}/${params.path.join("/")}${url.search}`;

  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (k !== "host") headers.set(k, v);
  });
  headers.set("host", FAPI_HOST);

  const init: RequestInit & { duplex?: string } = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body;
    init.duplex = "half";
  }

  return fetch(target, init);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return handle(req, await params);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return handle(req, await params);
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return handle(req, await params);
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return handle(req, await params);
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return handle(req, await params);
}
