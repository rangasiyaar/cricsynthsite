"use client";

import { createClient } from "@/lib/supabase";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "https://api.cricsynthesis.in";

async function getToken(): Promise<string> {
  const { data } = await createClient().auth.getSession();
  return data.session?.access_token ?? "";
}

/** Call a user-authenticated API route (Supabase session JWT). Throws with the API's error message. */
export async function userFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (init.body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = typeof body.detail === "string"
        ? body.detail
        : Array.isArray(body.detail)
          ? body.detail.map((d: { loc?: string[]; msg: string }) => `${(d.loc ?? []).slice(1).join(".")}: ${d.msg}`).join("; ")
          : JSON.stringify(body);
    } catch { /* keep statusText */ }
    throw new Error(message);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export interface Subscription {
  plan_id: string;
  plan_name: string;
  products: string[];
  daily_limit: number;
  max_keys: number;
  used_today: number;
  status: string;
  current_period_end: string | null;
}

export const PRODUCT_NAMES: Record<string, string> = {
  cricveda: "CricVeda",
  matchsynth: "MatchSynth",
  graphsynth: "GraphSynth",
};
