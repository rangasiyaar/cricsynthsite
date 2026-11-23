"use client";
// The ⓘ next to a section title: tap (or click, or Enter) to read what the section shows and how to read it, in plain
// words from lib/glossary.ts. A popover under the icon on wide screens, a sheet from the bottom on phones (website and
// app). One open at a time; closes on the ×, a tap outside or Esc. Opening one is counted (no personal data) so we
// learn which sections need clearer labels.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";
import { track } from "@/lib/analytics";

const OPEN_EVENT = "cs-info-open";

export default function Info({ k, label }: { k: GlossaryKey; label?: string }) {
  const g = GLOSSARY[k];
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const [sheet, setSheet] = useState(false);       // phones: a sheet at the page's top level (cards would trap it)
  const [shift, setShift] = useState(0);           // wide screens: nudge the popover back inside the window

  useEffect(() => {
    if (!open) return;
    const others = (e: Event) => { if ((e as CustomEvent).detail !== id) setOpen(false); };
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !pop.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener(OPEN_EVENT, others);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener(OPEN_EVENT, others);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [open, id]);

  useLayoutEffect(() => {
    if (!open || sheet || !pop.current) { setShift(0); return; }
    const r = pop.current.getBoundingClientRect(), over = r.right - (window.innerWidth - 16);
    if (over > 0) setShift(-Math.min(over, r.left - 16));
  }, [open, sheet]);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();                 // the icon can sit inside a link or a tappable card
    if (!open) {
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
      track("info_open", { topic: k });
      setSheet(window.matchMedia("(max-width: 640px)").matches);
    }
    setOpen(!open);
  };

  const panel = (asSheet: boolean) => (
    <>
      {asSheet && <span className="info-scrim" aria-hidden="true" onClick={() => setOpen(false)} />}
      <span className={`info-pop${asSheet ? " info-sheet" : ""}`} id={id} role="dialog" aria-label={g.title} ref={pop}
            style={shift ? { left: -12 + shift } : undefined /* -12 px is the default in design.css */}
            onClick={(e) => e.stopPropagation()}>{/* taps inside never reach a link or card around the icon */}
        <span className="info-head"><b>{g.title}</b>
          <button type="button" className="info-x" aria-label="Close" onClick={(e) => { e.stopPropagation(); setOpen(false); }}>×</button></span>
        <span className="info-p">{g.what}</span>
        {"read" in g && g.read && <span className="info-p"><b>How to read it: </b>{g.read}</span>}
        {"example" in g && g.example && <span className="info-p info-eg"><b>Example: </b>{g.example}</span>}
      </span>
    </>
  );

  return (
    <span className="info" ref={box}>
      <button type="button" className="info-btn" aria-expanded={open} aria-controls={id}
              aria-label={`What does ${label ?? g.title} mean?`} onClick={toggle}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 8.6v5.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><circle cx="10" cy="5.9" r="1.1" fill="currentColor" /></svg>
      </button>
      {open && (sheet ? createPortal(panel(true), document.body) : panel(false))}
    </span>
  );
}
