// Welcome email for new accounts: the sign-ups Apps Script (same one as the API access form) sends it through Resend
// and records it in Firestore (signups/{email}), so an address is only ever welcomed once.
import { getAdditionalUserInfo, type UserCredential } from "firebase/auth";
import { SHEET } from "@/components/RequestAccess";

export function welcome(cred: UserCredential): void {
  if (!getAdditionalUserInfo(cred)?.isNewUser || !cred.user.email) return;
  // text/plain keeps it a simple request; keepalive lets it finish while the page moves on to the account
  fetch(SHEET, { method: "POST", mode: "no-cors", keepalive: true, headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ type: "welcome", uid: cred.user.uid, name: cred.user.displayName ?? "", email: cred.user.email, source: "signup" }) })
    .catch(() => {});
}
