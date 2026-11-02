"use client";
// The match centre on a per-match page: always the latest published forecast (the static page may be a build old).
// A `?tab=` in the address (old links) wins over the page's own tab.
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import MatchCentre from "@/components/MatchCentre";
import { loadMatch } from "@/lib/data";
import type { MatchDoc } from "@/lib/types";

const Skeleton = () => <div className="skeleton card" style={{ marginTop: 32, minHeight: 320 }} />;

function Inner({ id, tab }: { id: string; tab?: string }) {
  const params = useSearchParams();
  const [doc, setDoc] = useState<MatchDoc | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { loadMatch(id).then(setDoc).catch(() => setError(true)); }, [id]);
  if (error) return <p className="notice" style={{ marginTop: 32 }}>This match isn&apos;t published (yet).</p>;
  if (!doc) return <Skeleton />;
  return <MatchCentre doc={doc} initialTab={params.get("tab") ?? tab} />;
}

export default function LiveMatch({ id, tab }: { id: string; tab?: string }) {
  return <Suspense fallback={<Skeleton />}><Inner id={id} tab={tab} /></Suspense>;
}
