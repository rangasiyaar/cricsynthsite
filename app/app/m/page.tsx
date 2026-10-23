"use client";
// App start: the splash while the account is checked, then the match list (signed in) or sign-in.
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/Shell";
import { useUser } from "@/lib/firebase";

export default function Splash() {
  const user = useUser();
  const router = useRouter();
  useEffect(() => {
    if (user === undefined) return;
    const t = setTimeout(() => router.replace(user ? "/m/matches/" : "/m/login/"), 900);
    return () => clearTimeout(t);
  }, [user, router]);
  return (
    <div className="app-splash" aria-busy="true">
      <div className="app-splash-mark"><Logo /></div>
      <div className="app-splash-name">Cric<b>Synthesis</b></div>
      <div className="app-splash-sub mono">Simulating 20,000 matches<span className="cs-cursor">_</span></div>
      <div className="app-splash-bar"><i /></div>
    </div>
  );
}
