"use client";
// App account: profile, plan, the website's account pages, and logging out. Theme and alerts live in App settings.
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { AppGate, MenuGroup, MenuRow, TopBar, initials } from "@/components/App";
import { auth, usePlan } from "@/lib/firebase";
import { signOutNative } from "@/lib/native";
import { SITE } from "@/lib/seo";

function svgPath(d: string) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
const KEY = svgPath("M15 7a4 4 0 1 1-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0 1 15 7z");
const MAIL = svgPath("M3 6h18v12H3zM3 7l9 6 9-6");
const BIN = svgPath("M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3");

function Account() {
  const { user, plan, source } = usePlan();
  const router = useRouter();
  if (!user) return null;
  const logOut = async () => { await signOutNative(); await signOut(auth()); router.replace("/m/login/"); };
  return (
    <>
      <div className="a-title" style={{ paddingBottom: 12 }}><h1>Account</h1></div>
      <div className="a-who">
        <span className="a-avatar">{initials(user.displayName || user.email || "?")}</span>
        <div><h1>{user.displayName || "Your account"}</h1><p>{user.email}</p></div>
      </div>
      <MenuGroup label="Plan">
        <div className="a-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>{plan === "pro" ? "Pro" : "Free"}</h2>{source === "beta" && <span className="a-pro">Beta</span>}
          </div>
          <p>{source === "beta" ? "Every signed-in account gets the full MatchSynth Lab during the beta."
            : plan === "pro" ? "MatchSynth Lab is included in your plan." : "Forecasts and the match centre are free. MatchSynth Lab is part of Pro."}</p>
        </div>
      </MenuGroup>
      <MenuGroup label="On the website">
        <MenuRow icon={KEY} title="API keys and usage" href={`${SITE}/account/`} />
        <MenuRow icon={MAIL} title="Email preferences" href={`${SITE}/account/`} />
        <MenuRow icon={BIN} title="Delete your account" sub="Write to us and we'll take care of it" href={`${SITE}/contact/`} />
      </MenuGroup>
      <button type="button" className="a-btn soft" onClick={logOut}>Log out</button>
    </>
  );
}

export default function AccountPage() {
  return <><TopBar back="/m/matches/" /><AppGate><Account /></AppGate></>;
}
