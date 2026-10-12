import type { Metadata } from "next";
import { seo } from "@/lib/seo";

export const metadata: Metadata = seo("/results/", "Forecast results | CricSynthesis", "Every pre-match forecast we publish, checked against the final scorecard. See how often our projections came true, match by match.");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
