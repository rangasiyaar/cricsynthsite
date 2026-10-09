import type { Metadata } from "next";

export const metadata: Metadata = { title: "API reference | CricSynthesis" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
