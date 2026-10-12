import { seo } from "@/lib/seo";
import type { Metadata } from "next";

export const metadata: Metadata = seo("/playground/", "API playground | CricSynthesis", "Try the CricSynthesis cricket API in your browser. Pick an endpoint, set the parameters and see the response.");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
