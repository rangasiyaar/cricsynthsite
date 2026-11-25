"use client";
// App guide: the same pages as the website's /docs/guide/ (content in lib/guide.ts), on app screens.
// /m/guide/ is the whole guide as one document (#topic jumps to a topic); /m/guide/?p=<slug> opens one topic.
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loading, TopBar } from "@/components/App";
import { GuideArticle, GuideDoc } from "@/components/Guide";
import { guidePage } from "@/lib/guide";

function Guide() {
  const slug = useSearchParams().get("p");
  const page = slug ? guidePage(slug) : undefined;
  return (
    <>
      <TopBar back={page ? "/m/guide/" : "/m/help/"} />
      <div className="a-guide">
        {page ? <GuideArticle page={page} app /> : <GuideDoc app />}
      </div>
    </>
  );
}

export default function GuidePage() {
  return <Suspense fallback={<Loading rows={3} />}><Guide /></Suspense>;
}
