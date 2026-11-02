"use client";
// Old links (/match/?id=…&tab=…) forward to the match's own page; with no match chosen, to the match list.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { matchPath } from "@/lib/matchText";

const Skeleton = () => <div className="skeleton card" style={{ marginTop: 32, minHeight: 320 }} />;

function Forward() {
  const params = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const id = params.get("id"), tab = params.get("tab");
    if (!id) { router.replace("/matches/"); return; }
    if (tab === "lab") { router.replace(`/lab/?id=${encodeURIComponent(id)}`); return; }
    router.replace(tab?.toLowerCase() === "fantasy" ? matchPath(id, "fantasy") : `${matchPath(id)}${tab ? `?tab=${encodeURIComponent(tab)}` : ""}`);
  }, [params, router]);
  return <Skeleton />;
}

export default function MatchPage() {
  return <Suspense fallback={<Skeleton />}><Forward /></Suspense>;
}
