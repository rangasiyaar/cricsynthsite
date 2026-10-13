"use client";
// Article author strip: photo (or monogram), name, role, date, read time and share buttons.
import { useState } from "react";

type Props = { name: string; role: string; photo?: string; date: string; minutes: number; url: string; title: string };

export function Byline({ name, role, photo, date, minutes, url, title }: Props) {
  const [copied, setCopied] = useState(false);
  const enc = encodeURIComponent;
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2);
  return (
    <div className="byline">
      <div className="byline-avatar" aria-hidden={!photo}>{photo ? <img src={photo} alt={name} width={60} height={60} /> : initials}</div>
      <div className="byline-who">
        <div className="byline-name">{name}</div>
        <div className="byline-role">{role}</div>
        <div className="byline-when"><time dateTime={date}>{new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</time> · {minutes} min read</div>
      </div>
      <div className="share" aria-label="Share this article">
        <a href={`https://x.com/intent/post?text=${enc(title)}&url=${enc(url)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on X">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.6 8.7L23 22h-6.8l-5.3-6.9L4.8 22H1.7l8.1-9.3L1 2h7l4.8 6.3L18.9 2Zm-1.2 18h1.9L7.4 3.9H5.4L17.7 20Z" /></svg></a>
        <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.6c0-1.3 0-3-1.9-3s-2.2 1.5-2.2 2.9V21h-4V9Z" /></svg></a>
        <a href={`https://wa.me/?text=${enc(`${title} ${url}`)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on WhatsApp">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3 1 2.6 1.1 2.8.1.2 1.9 2.9 4.6 4 1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.4-.3Z" /></svg></a>
        <button type="button" aria-label={copied ? "Link copied" : "Copy link"} title={copied ? "Link copied" : "Copy link"}
                onClick={() => { navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {}); }}>
          {copied ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m5 12 5 5 9-10" /></svg>
                  : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>}
        </button>
      </div>
    </div>
  );
}
