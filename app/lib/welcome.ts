// Welcome email for new accounts. Right after a new account confirms it is 18 or over (AgeGate), the page posts to the
// API (POST /welcome, edge/src/forms.ts) with its sign-in token; the API checks the account's 18+ flag and sends the
// welcome email from welcome@cricsynthesis.in once per account (users/{uid}.welcomedAt).
import type { User, UserCredential } from "firebase/auth";
import { API } from "./apiref";

const NEW_FOR_MS = 10 * 60_000;   // an account counts as new for 10 minutes after it was created

export function welcome(cred: UserCredential | User | null | undefined): void {
  const user = cred && "user" in cred ? cred.user : cred;
  if (!user?.uid || !user.email) return;
  const created = Date.parse(user.metadata.creationTime ?? "");
  if (!created || Date.now() - created > NEW_FOR_MS) return;
  const key = `cs-welcomed-${user.uid}`;
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, "1"); } catch {}
  const source = typeof window !== "undefined" && window.location.pathname.startsWith("/m/") ? "app" : "web";
  user.getIdToken().then((token) => fetch(`${API}/welcome`, { method: "POST", keepalive: true,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ source }) }))
    .catch(() => {});
}
