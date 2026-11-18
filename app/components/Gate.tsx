"use client";
// Gates for pages that need an account or Pro: signed-out visitors go to sign-in and come straight back;
// signed-in accounts without Pro go to the plans.
import { useEffect } from "react";
import { usePlan } from "@/lib/firebase";

function here() {
  return typeof window === "undefined" ? "/" : window.location.pathname + window.location.search;
}

export function loginHref(next?: string) {
  return `/login/?next=${encodeURIComponent(next ?? here())}`;
}

/** Guests go to sign-in and come straight back; with `pro`, signed-in accounts without Pro go to the plans. */
export function RequireSignIn({ children, pro = false }: { children: React.ReactNode; pro?: boolean }) {
  const { user, plan } = usePlan();
  const blocked = plan !== undefined && (user === null || (pro && plan !== "pro"));
  useEffect(() => { if (blocked) window.location.replace(proHref(!!user)); }, [blocked, user]);
  if (plan === undefined || blocked) return <div className="skeleton card" style={{ minHeight: 280 }} aria-busy="true" />;
  return <>{children}</>;
}

/** Where a Pro feature sends someone without Pro: guests to sign-in (then back to `next`), accounts to the plans. */
export const proHref = (signedIn: boolean, next?: string) => (signedIn ? "/pro/" : loginHref(next));
