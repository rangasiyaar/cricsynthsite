// Welcome email for new accounts. Right after an account is created, the sign-in page posts its uid (type "welcome")
// to the sign-ups Apps Script (the same one as the API access form; kept outside the repo). The script looks the uid up
// in Firebase Auth itself, logs the account in the sheet's "Signups" tab and sends the welcome email from
// welcome@cricsynthesis.in, once per account.
import type { User, UserCredential } from "firebase/auth";
import { SHEET } from "@/components/RequestAccess";

export const WELCOME_URL = SHEET;

const NEW_FOR_MS = 10 * 60_000;   // an account counts as new for 10 minutes after it was created

export function welcome(cred: UserCredential | User | null | undefined): void {
  const user = cred && "user" in cred ? cred.user : cred;
  if (!WELCOME_URL || !user?.uid || !user.email) return;
  const created = Date.parse(user.metadata.creationTime ?? "");
  if (!created || Date.now() - created > NEW_FOR_MS) return;
  const key = `cs-welcomed-${user.uid}`;
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, "1"); } catch {}
  const source = typeof window !== "undefined" && window.location.pathname.startsWith("/m/") ? "app" : "web";
  // text/plain keeps it a simple request (no CORS preflight); keepalive lets it finish while the page moves on
  fetch(WELCOME_URL, { method: "POST", mode: "no-cors", keepalive: true, headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ type: "welcome", uid: user.uid, source }) }).catch(() => {});
}
