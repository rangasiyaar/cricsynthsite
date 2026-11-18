"use client";
// Design preview of the app's CricSynthesis Pro screen (not linked yet).
import { TopBar } from "@/components/App";
import ProOfferApp from "@/components/ProOfferApp";

export default function ProScreen() {
  return (
    <>
      <TopBar back="/m/matches/" />
      <ProOfferApp />
    </>
  );
}
