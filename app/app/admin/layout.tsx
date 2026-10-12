import type { Metadata } from "next";
import { seo } from "@/lib/seo";

export const metadata: Metadata = seo("/admin/", "Admin | CricSynthesis", "Admin.", { noindex: true });

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
