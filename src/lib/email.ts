interface ResendPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
}

async function sendEmail(apiKey: string, payload: ResendPayload): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend ${res.status}: ${text}`);
  }
}

export async function sendAccessRequestEmail(opts: {
  apiKey: string;
  from: string;
  adminEmail: string;
  userEmail: string;
  approveUrl: string;
}): Promise<void> {
  await sendEmail(opts.apiKey, {
    from: opts.from,
    to: [opts.adminEmail],
    subject: `Access request: ${opts.userEmail}`,
    html: `
      <p><strong>${opts.userEmail}</strong> has requested access to WC2026 Pick'em.</p>
      <p><a href="${opts.approveUrl}" style="display:inline-block;padding:10px 20px;background:#f7c325;color:#080810;font-weight:bold;text-decoration:none;border-radius:4px">Approve access</a></p>
      <p style="color:#888;font-size:12px">Link expires in 48 hours.</p>
    `,
  });
}

export async function sendApprovalEmail(opts: {
  apiKey: string;
  from: string;
  userEmail: string;
  appUrl: string;
}): Promise<void> {
  await sendEmail(opts.apiKey, {
    from: opts.from,
    to: [opts.userEmail],
    subject: "You're in — WC2026 Pick'em",
    html: `
      <p>Your access to WC2026 Pick'em has been approved.</p>
      <p><a href="${opts.appUrl}" style="display:inline-block;padding:10px 20px;background:#f7c325;color:#080810;font-weight:bold;text-decoration:none;border-radius:4px">Go to Pick'em</a></p>
    `,
  });
}
