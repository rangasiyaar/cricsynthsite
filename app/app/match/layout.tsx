import type { Metadata } from "next";
import { seo } from "@/lib/seo";

export const metadata: Metadata = seo("/match/", "Match centre | CricSynthesis", "Win probability, projected totals, powerplay scores and top scorer odds for upcoming cricket matches, updated when the playing XIs are named.");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
