// Pro data on the public site (cricsim/lock.py): the match and venue files carry what the free Overview shows, a
// masked teaser for the Pro tabs, and the full forecast encrypted. Signed-in Pro accounts get each match's key from
// the API (GET /pro/key, edge/src/prokey.ts) and decrypt it here; everyone else keeps the public file.
// Keys are kept on the device (localStorage) so a Pro account can reopen a match offline in the app.
import { useEffect, useState } from "react";
import { API } from "./apiref";
import type { MatchDoc, VenueIntel } from "./types";

type Box = { v: number; iv: string; ct: string };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const NO_KEY_MS = 10 * 60_000;              // after a "not Pro" answer, don't ask again for 10 minutes

function storage(): Storage | null { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } }

/** The match's key, or null (guest, not Pro, offline without a kept key, or locking not switched on). */
export async function proKey(matchId: string): Promise<Uint8Array | null> {
  const ls = storage(), kept = ls?.getItem(`cs-pk:${matchId}`);
  if (kept) return unb64(kept);
  const { auth } = await import("./firebase");
  const a = auth();
  await (a as { authStateReady?: () => Promise<void> }).authStateReady?.();
  const u = a.currentUser;
  if (!u) return null;
  const no = Number(ls?.getItem(`cs-pk-no:${u.uid}`) || 0);
  if (Date.now() - no < NO_KEY_MS) return null;
  try {
    const r = await fetch(`${API}/pro/key?match=${encodeURIComponent(matchId)}`, { headers: { Authorization: `Bearer ${await u.getIdToken()}` } });
    if (r.status === 403) { ls?.setItem(`cs-pk-no:${u.uid}`, String(Date.now())); return null; }
    if (!r.ok) return null;
    const { key } = (await r.json()) as { key: string };
    ls?.setItem(`cs-pk:${matchId}`, key);
    ls?.removeItem(`cs-pk-no:${u.uid}`);
    return unb64(key);
  } catch { return null; }
}

/** Forget the "not Pro" answer (right after subscribing). */
export function forgetNoKey() {
  const ls = storage();
  if (!ls) return;
  for (const k of Object.keys(ls)) if (k.startsWith("cs-pk-no:")) ls.removeItem(k);
}

async function decrypt<T>(box: Box, key: Uint8Array): Promise<T> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) as BufferSource }, k, unb64(box.ct) as BufferSource);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/** The full match document for a Pro account; the public one otherwise. */
export async function unlockMatch(doc: MatchDoc): Promise<MatchDoc> {
  if (!doc?.locked) return doc;
  const key = await proKey(doc.match.id);
  if (!key) return doc;
  try {
    const full = await decrypt<Pick<MatchDoc, "summary" | "fantasy" | "insights">>(doc.locked as Box, key);
    const { locked: _l, masked: _m, teaser: _t, ...rest } = doc;
    return { ...rest, ...full };
  } catch {
    storage()?.removeItem(`cs-pk:${doc.match.id}`);      // a stale or wrong key: ask again next time
    return doc;
  }
}

export async function unlockVenue(v: VenueIntel, matchId: string): Promise<VenueIntel> {
  if (!v?.locked) return v;
  const key = await proKey(matchId);
  if (!key) return v;
  try { return await decrypt<VenueIntel>(v.locked as Box, key); }
  catch { storage()?.removeItem(`cs-pk:${matchId}`); return v; }
}

/** The masked teaser as a match document, for showing a Pro tab to someone without Pro. */
export const teaserDoc = (doc: MatchDoc): MatchDoc | null =>
  doc.teaser ? { ...doc, summary: doc.teaser.summary, fantasy: doc.teaser.fantasy ?? undefined } : null;

/** For a Pro account looking at a match that loaded before it could be unlocked (signed in or subscribed since):
 *  unlock it now. `pending` while trying; the original doc if it can't be unlocked. */
export function useUnlocked(doc: MatchDoc, pro: boolean): { doc: MatchDoc; pending: boolean } {
  const [full, setFull] = useState<MatchDoc | null>(null);
  const [tried, setTried] = useState<string | null>(null);
  const tag = `${doc.match.id}:${doc.generated_at}`;
  useEffect(() => {
    if (!pro || !doc.masked) return;
    let live = true;
    unlockMatch(doc).then((d) => { if (live) { if (!d.masked) setFull(d); setTried(tag); } });
    return () => { live = false; };
  }, [pro, doc, tag]);
  if (!doc.masked) return { doc, pending: false };
  if (full && `${full.match.id}:${full.generated_at}` === tag) return { doc: full, pending: false };
  return { doc, pending: pro && tried !== tag };
}
