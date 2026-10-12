import { seo } from "@/lib/seo";
import type { Metadata } from "next";

export const metadata: Metadata = seo("/docs/", "API reference | CricSynthesis", "Endpoints, parameters and sample responses for the CricSynthesis cricket analytics, simulation and graphics API.");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
