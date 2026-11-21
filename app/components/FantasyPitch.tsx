// A fantasy XI laid out on a pitch (keeper, batters, all-rounders, bowlers) with each player's projected points:
// the match centre's Fantasy tab (website and app) and the fantasy prediction articles. Server- and client-safe.
import s from "./FantasyPitch.module.css";

export type PitchPlayer = { id: string; name: string; team: number; role?: string | null; expected: number };
type Props = { players: PitchPlayer[]; captain: string; vice: string; short: [string, string] | string[]; total: number;
               note?: string; label?: string;
               match?: { title?: string; competition?: string; date?: string; start_time?: string } };

/** "2026-11-22" + "15:30" → "22 Nov, 3:30 PM IST". */
function when(date?: string, time?: string): string {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const m = time?.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return d;
  const h = +m[1];
  return `${d}, ${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"} IST`;
}

const ROWS: [string, string, string][] = [["WK", "Wicket-keeper", "Wicket-keepers"], ["BAT", "Batter", "Batters"],
                                          ["AR", "All-rounder", "All-rounders"], ["BOWL", "Bowler", "Bowlers"]];

/** "YBK Jaiswal" → "Y Jaiswal", "Washington Sundar" → "W Sundar" (the full name stays in the tooltip). */
export const shortName = (n: string) => {
  const w = n.trim().split(/\s+/);
  return w.length < 2 ? n : `${w[0][0]} ${w[w.length - 1]}`;
};

/** A generic figure in the team's shirt: no real player images. */
function Figure({ team }: { team: number }) {
  const shirt = team === 0 ? "#e9eff5" : "#0b131c", trim = team === 0 ? "#5980a6" : "#d9895f", skin = "#c99a78";
  return (
    <svg viewBox="0 0 132 132" aria-hidden="true">
      <circle cx="66" cy="66" r="64" fill="rgba(13,24,36,.35)" />
      <path d="M18 132c2-30 20-44 48-44s46 14 48 44z" fill={shirt} />
      <path d="M52 90l14 16 14-16" fill="none" stroke={trim} strokeWidth="5" />
      <rect x="58" y="74" width="16" height="18" rx="6" fill={skin} />
      <circle cx="66" cy="54" r="24" fill={skin} />
      <path d="M41 52c0-18 11-28 25-28s25 10 25 28c-6-7-15-10-25-10s-19 3-25 10z" fill={trim} />
    </svg>
  );
}

const Mark = () => (
  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="4" aria-hidden="true">
    <path d="M4 15L13 24L4 33" strokeLinecap="square" /><path d="M22 15V40M30 15V40M38 15V40M20 11H29M31 11H40" /></svg>
);

export default function FantasyPitch({ players, captain, vice, short, total, note, label = "Projected points", match }: Props) {
  const series = (match?.competition ?? "").split(" · ")[0].replace(/^(ACC|ICC) /, "").replace(/^Men's /, "");
  const sub = [series, when(match?.date, match?.start_time)].filter(Boolean).join(" · ");
  const nA = players.filter((p) => p.team === 0).length;
  const mult = (id: string) => (id === captain ? 2 : id === vice ? 1.5 : 1);
  const known = new Set(ROWS.map((r) => r[0]));
  const rows = ROWS.map(([r, one, many]) => [one, many, players.filter((p) => (r === "BAT" ? p.role === r || !known.has(p.role ?? "") : p.role === r))] as const)
    .filter(([, , ps]) => ps.length);
  return (
    <figure className={s.wrap} aria-label={`Fantasy XI: ${players.map((p) => p.name).join(", ")}`} style={{ marginBlock: 0 }}>
      <div className={s.top}>
        <div><div className={s.lab}>Players</div><div className={s.big}>{players.length}<small>/11</small></div></div>
        <div className={s.score}>
          <span className={`${s.tm} ${s.tA}`}>{short[0]}</span><span className={s.n}>{nA}</span>
          <span className={s.colon}>:</span><span className={s.n}>{players.length - nA}</span><span className={`${s.tm} ${s.tB}`}>{short[1]}</span>
        </div>
        <div className={s.right}><div className={s.lab}>{label}</div><div className={s.big}>{Math.round(total)}</div></div>
      </div>
      <div className={s.field}>
        <div className={s.oval} /><div className={s.inner} /><div className={s.strip} />
        {rows.map(([one, many, ps], i) => (
          <div key={one}>
          {i === Math.min(2, rows.length - 1) && <div className={s.wm} aria-hidden="true"><Mark /><span>CricSynthesis</span></div>}
          <div className={s.sec}>
            <h4>{(ps.length > 1 ? many : one).toUpperCase()}</h4>
            <div className={s.row}>{ps.map((p) => {
              const m = mult(p.id);
              return (
                <div key={p.id} className={`${s.p} ${p.team === 0 ? s.A : s.B}`} title={`${p.name} (${short[p.team]})`}>
                  {m > 1 && <span className={`${s.cv} ${m === 2 ? s.c : s.v}`}>{m === 2 ? "C" : "VC"}</span>}
                  <div className={s.av}><Figure team={p.team} /></div>
                  <div className={s.tag}>{shortName(p.name)}</div>
                  <div className={s.pts}><b>{Math.round(p.expected * m)}</b> pts</div>
                </div>
              );
            })}</div>
          </div>
          </div>
        ))}
        <p className={s.note}>{note ?? "Projected fantasy points (C 2×, VC 1.5×). Check the XIs before locking."}</p>
      </div>
      <figcaption className={s.foot}>
        <span className={s.brand}><Mark /><span><span className={s.word}>Cric<b>Synthesis</b></span>
          <span className={s.tagline} style={{ display: "block" }}>AI-Powered Cricket Intelligence</span></span></span>
        <span className={s.meta}>{match?.title && <b>{match.title}</b>}{sub && <>{sub}<br /></>}cricsynthesis.in</span>
      </figcaption>
    </figure>
  );
}
