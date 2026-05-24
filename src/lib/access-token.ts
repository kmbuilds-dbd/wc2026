const TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export async function signApproveToken(secret: string, email: string): Promise<string> {
  const timestamp = Date.now().toString();
  const message = `${email}:${timestamp}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const sigHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${timestamp}.${sigHex}`;
}

export async function verifyApproveToken(
  secret: string,
  email: string,
  token: string
): Promise<boolean> {
  const dotIdx = token.indexOf(".");
  if (dotIdx === -1) return false;
  const timestamp = token.slice(0, dotIdx);
  const sigHex = token.slice(dotIdx + 1);

  const tokenTime = parseInt(timestamp, 10);
  if (isNaN(tokenTime) || Date.now() - tokenTime > TOKEN_TTL_MS) return false;

  const message = `${email}:${timestamp}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const matches = sigHex.match(/.{2}/g);
  if (!matches) return false;
  const sigBytes = Uint8Array.from(matches.map((h) => parseInt(h, 16)));
  return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(message));
}
