import type { Metadata } from "next";
import { seo } from "@/lib/seo";

export const metadata: Metadata = seo("/matches/", "Matches | CricSynthesis", "Every match we forecast: upcoming fixtures, matches under way and results, with pre-match win probabilities and projected scores.");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
