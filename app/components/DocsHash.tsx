"use client";
// Keeps old Docs links working: /docs/#platform and /docs/#developers scroll to their list, and old API anchors
// (/docs/#match-forecast) go to the API reference.
import { useEffect } from "react";

export default function DocsHash() {
  useEffect(() => {
    const read = () => {
      const h = decodeURIComponent(window.location.hash.slice(1));
      if (!h || document.getElementById(h)) return;
      if (h === "platform") document.getElementById("using")?.scrollIntoView();
      else window.location.replace(`/docs/api/#${h}`);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return null;
}
