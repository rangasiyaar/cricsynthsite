"use client";
// App result: a finished match's pre-match forecast checked against the scorecard, the same view as the website's
// /results/{id}/ page (ResultDetail, from the published results/{id}.json).
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Empty, Loading, OfflineBar, TopBar, useFresh } from "@/components/App";
import ResultDetail from "@/components/ResultDetail";
import { loadResult } from "@/lib/data";

function Result() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id") || "";
  const fresh = useFresh(id ? `result:${id}` : null, () => Promise.resolve(null), () => loadResult(id));
  const doc = fresh.data;
  const error = !id ? "No match selected." : fresh.error ? "This match's result isn't available yet." : null;
  return (
    <>
      <TopBar back="/m/matches/?f=finished" />
      <OfflineBar show={fresh.offline} onRetry={fresh.refresh} />
      {error && (
        <Empty title="Not available" action={<button type="button" className="a-pill" onClick={() => router.replace("/m/matches/?f=finished")}>Back to results</button>}>
          {error}
        </Empty>
      )}
      {!doc && !error && <Loading rows={3} />}
      {doc && <div className="a-result"><ResultDetail doc={doc} heading="h1" forecastHref={`/m/match/?id=${encodeURIComponent(id)}`} /></div>}
    </>
  );
}

export default function ResultPage() {
  return <Suspense fallback={<Loading rows={3} />}><Result /></Suspense>;
}
