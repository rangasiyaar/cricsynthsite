// Tells the API when a signed-in account opens the website or the app (POST /account/seen, edge/src/activity.ts),
// so the admin console can show where accounts are active: website or app, device, app version and city.
// At most once every 20 minutes per device, on opening and on coming back to the screen. Nothing for guests.
import { useEffect } from "react";
import type { User } from "firebase/auth";
import { API } from "./apiref";
import { useUser } from "./firebase";
import { appInfo, isNative } from "./native";

const EVERY_MS = 20 * 60_000;

async function ping(user: User) {
  const key = `cs-seen-${user.uid}`;
  try { if (Date.now() - Number(localStorage.getItem(key) || 0) < EVERY_MS) return; localStorage.setItem(key, String(Date.now())); } catch {}
  const app = isNative() || window.location.pathname.startsWith("/m/");
  const version = app ? (await appInfo().catch(() => null))?.version ?? null : null;
  const token = await user.getIdToken();
  await fetch(`${API}/account/seen`, { method: "POST", keepalive: true,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ where: app ? "app" : "web", version }) });
}

export function useSeen() {
  const user = useUser();
  useEffect(() => {
    if (!user) return;
    const go = () => { if (document.visibilityState === "visible") ping(user).catch(() => {}); };
    go();
    document.addEventListener("visibilitychange", go);
    return () => document.removeEventListener("visibilitychange", go);
  }, [user]);
}

export function Seen() { useSeen(); return null; }
