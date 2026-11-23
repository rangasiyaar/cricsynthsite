"use client";
// /docs/ used to be the API reference: an old link with an endpoint anchor (/docs/#match-forecast) goes to the same
// place in /docs/api/.
import { useEffect } from "react";

export default function DocsForward() {
  useEffect(() => { if (window.location.hash.length > 1) window.location.replace(`/docs/api/${window.location.hash}`); }, []);
  return null;
}
