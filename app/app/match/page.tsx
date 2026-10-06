"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import MatchCentre from "@/components/MatchCentre";
import { loadMatch } from "@/lib/data";
import type { MatchDoc } from "@/lib/types";

function Loader() {
  const id = useSearchParams().get("id") || "";
  const [doc, setDoc] = useState<MatchDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!id) { setError("No match selected."); return; }
    loadMatch(id).then((d) => { setDoc(d); document.title = `${d.match.title ?? d.match.id} · CricSynthesis`; })
      .catch(() => setError("This match isn't published (yet)."));
  }, [id]);
  if (error) return <p className="notice" style={{ marginTop: 32 }}>{error}</p>;
  if (!doc) return <div className="skeleton card" style={{ marginTop: 32, minHeight: 320 }} />;
  return <MatchCentre doc={doc} />;
}

export default function MatchPage() {
  return <Suspense fallback={<div className="skeleton card" style={{ marginTop: 32, minHeight: 320 }} />}><Loader /></Suspense>;
}
