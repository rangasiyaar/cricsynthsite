import type { Metadata } from "next";
import { Suspense } from "react";
import Checkout from "@/components/Checkout";
import { seo } from "@/lib/seo";

export const metadata: Metadata = seo("/checkout/", "Checkout | CricSynthesis", "Start CricSynthesis Pro.", { noindex: true });

export default function CheckoutPage() {
  return <Suspense fallback={<div className="page-head"><div className="skeleton card" style={{ minHeight: 320 }} /></div>}><Checkout /></Suspense>;
}
