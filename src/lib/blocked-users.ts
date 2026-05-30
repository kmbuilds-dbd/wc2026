const BLOCKED_USER_EMAILS = new Set([
  "kunal.morparia@gmail.com",
  "kunal.morparia@veeva.com",
  "scheye84@gmail.com",
]);

export function isBlockedUserEmail(email: string): boolean {
  return BLOCKED_USER_EMAILS.has(email.trim().toLowerCase());
}
