"use client";
// The ⓘ next to a section title: tap (or click, or Enter) to read what the section shows and how to read it, in plain
// words from lib/glossary.ts. Always drawn at the page's top level (a portal), so no card, animation or faded label
// around the icon can cover it or make it see-through: a card-style panel under the icon on wide screens, a sheet from the
// bottom on phones (website and app). One open at a time; closes on the ×, a tap outside or Esc. Opening one is
// counted (no personal data) so we learn which sections need clearer labels.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";
import { track } from "@/lib/analytics";

const OPEN_EVENT = "cs-info-open";
const W = 340, GAP = 10, EDGE = 16;

export default function Info({ k, label }: { k: GlossaryKey; label?: string }) {
  const g = GLOSSARY[k];
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  // wide screens: under the icon (above it if there's no room below), kept inside the window
  const place = useCallback(() => {
    const b = btn.current?.getBoundingClientRect();
    if (!b) return;
    const h = pop.current?.offsetHeight ?? 220;
    const left = Math.min(Math.max(EDGE, b.left - 14), window.innerWidth - EDGE - Math.min(W, window.innerWidth - 2 * EDGE));
    const up = b.bottom + GAP + h > window.innerHeight - EDGE && b.top - GAP - h > EDGE;
    setPos({ top: up ? b.top - GAP - h : b.bottom + GAP, left, up });
  }, []);

  useLayoutEffect(() => { if (open && !sheet) place(); }, [open, sheet, place]);

  useEffect(() => {
    if (!open) return;
    const others = (e: Event) => { if ((e as CustomEvent).detail !== id) setOpen(false); };
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !pop.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    const follow = () => { if (!sheet) place(); };
    window.addEventListener(OPEN_EVENT, others);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      window.removeEventListener(OPEN_EVENT, others);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open, id, sheet, place]);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();                 // the icon can sit inside a link or a tappable card
    if (!open) {
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
      track("info_open", { topic: k });
      setSheet(window.matchMedia("(max-width: 640px)").matches);
      setPos(null);
    }
    setOpen(!open);
  };

  const panel = (
    <>
      {sheet && <div className="info-scrim" aria-hidden="true" onClick={() => setOpen(false)} />}
      <div ref={pop} id={id} role="dialog" aria-label={g.title}
           className={`info-pop${sheet ? " info-sheet" : ""}${pos?.up ? " info-up" : ""}`}
           style={sheet ? undefined : { top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }}
           onClick={(e) => e.stopPropagation()}>
        <div className="info-head">
          <h4 className="info-title">{g.title}</h4>
          <button type="button" className="info-x" aria-label="Close" onClick={(e) => { e.stopPropagation(); setOpen(false); }}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        <p className="info-p">{g.what}</p>
        {"read" in g && g.read && <><span className="info-label">How to read it</span><p className="info-p">{g.read}</p></>}
        {"example" in g && g.example && <p className="info-eg"><b>Example: </b>{g.example}</p>}
      </div>
    </>
  );

  return (
    <span className="info">
      <button ref={btn} type="button" className="info-btn" aria-expanded={open} aria-controls={open ? id : undefined}
              aria-label={`What does ${label ?? g.title} mean?`} onClick={toggle}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle className="info-ring" cx="10" cy="10" r="8.4" />
          <path className="info-glyph" d="M10 9v5" /><circle className="info-dot" cx="10" cy="6.2" r="1.05" /></svg>
      </button>
      {open && createPortal(panel, document.body)}
    </span>
  );
}
