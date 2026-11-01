import type { CSSProperties } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { EASE, mix, ramp } from "./motion";
import { C, sans, themeVars } from "./theme";

// Looping 16:10 clip for the portfolio card, built from captures of the Ogma dashboard with fictional data
// (see capture/README.md): title, a camera ride over the real page (kanban, git and docker, live metrics, services),
// outro. Starts and ends on the empty background. Shot recipes from video-shotcraft: blur-slide (titles, captions),
// overhead camera moves (the ride over the page).
export const FPS = 30;
export const DURATION = 652;
export const WIDTH = 1920;
export const HEIGHT = 1200;

const PAGE = { w: 1920, h: 4829 }; // CSS px of the captured page
// Window the page is shown in, in video px; the page is scaled so its full width fits.
const WIN = { x: 80, y: 48, w: 1760, h: 1000, bar: 40, r: 18 };
const FIT = WIN.w / PAGE.w;
const APP_IN = 54;
const APP_OUT = 600;
const OUTRO = 608;

type Box = { x: number; y: number; w: number; h: number };
// Highlight boxes in page CSS px (unions of widget boxes from capture/layout.json).
const KANBAN: Box = { x: 34, y: 86, w: 1852, h: 640 };
const GIT: Box = { x: 34, y: 736, w: 921, h: 770 };
const DOCKER: Box = { x: 965, y: 736, w: 921, h: 770 };
const METRICS: Box = { x: 34, y: 1516, w: 1852, h: 770 };
const SERVICES: Box = { x: 34, y: 2296, w: 921, h: 1030 };

// One entry per shot: frames, camera center on the page, zoom at start and end (1 = page width fits), caption and highlighted widgets.
const SHOTS: { from: number; to: number; cy: number; z: [number, number]; text?: string; box?: Box }[] = [
  { from: 60, to: 160, cy: 560, z: [1.0, 1.03] },
  { from: 160, to: 250, cy: 540, z: [1.0, 1.03], text: "Kanban: Aufgaben mit Checklisten-Fortschritt", box: KANBAN },
  { from: 250, to: 330, cy: 1121, z: [1.0, 1.015], text: "Git: Status, Pull, Push, Commit", box: GIT },
  { from: 330, to: 410, cy: 1121, z: [1.015, 1.03], text: "Docker: Container und Ressourcen", box: DOCKER },
  { from: 410, to: 510, cy: 1901, z: [1.0, 1.03], text: "CPU, RAM, GPU und Temperatur live", box: METRICS },
  { from: 510, to: APP_OUT, cy: 2811, z: [0.93, 0.95], text: "Statusseiten und Latenz externer Dienste", box: SERVICES }, // 1046 px of page must fit the window height
];

// Camera over the captured page (CSS px): point centered in the window and zoom (1 = page width fits).
// Each shot holds a slow push; the travel to the next shot happens between its last and the next shot's first key.
type Key = [frame: number, cx: number, cy: number, zoom: number];
const CAM: Key[] = [
  [APP_IN, 960, SHOTS[0].cy, 0.97],
  ...SHOTS.flatMap(({ from, to, cy, z }): Key[] => [
    [from + 10, 960, cy, z[0]],
    [to - 8, 960, cy, z[1]],
  ]),
];

function track(keys: Key[], f: number, ease: (t: number) => number) {
  if (f <= keys[0][0]) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const [a, b] = [keys[i - 1], keys[i]];
    if (f < b[0]) {
      const t = ease((f - a[0]) / (b[0] - a[0]));
      return [f, mix(a[1], b[1], t), mix(a[2], b[2], t), mix(a[3], b[3], t)] as Key;
    }
  }
  return keys.at(-1)!;
}

/** Words come out of a blur one after another: y, blur and opacity share one eased progress (blur-slide). */
function BlurWords({ text, f, start, gap = 4, dur = 22, dy = 0.38, blur = 14, style }: { text: string; f: number; start: number; gap?: number; dur?: number; dy?: number; blur?: number; style: CSSProperties }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0 0.26em", ...style }}>
      {text.split(" ").map((w, i) => {
        const p = ramp(f, start + i * gap, dur);
        return (
          <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${((1 - p) * dy).toFixed(3)}em)`, filter: p > 0.999 ? undefined : `blur(${((1 - p) * blur).toFixed(2)}px)` }}>
            {w}
          </span>
        );
      })}
    </div>
  );
}

/** Ogma mark from public/favicon.svg: four bars hanging off a line, on a rounded square. */
function Logo({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ flex: "none" }}>
      <rect width="100" height="100" rx="22" fill={C.accent} />
      <g fill="none" stroke={C.accentFg} strokeWidth="7" strokeLinejoin="miter">
        <line x1="14" y1="50" x2="86" y2="50" />
        <line x1="28" y1="50" x2="28" y2="26" />
        <line x1="44" y1="50" x2="44" y2="26" />
        <line x1="60" y1="74" x2="60" y2="50" />
        <line x1="76" y1="74" x2="76" y2="50" />
      </g>
    </svg>
  );
}

function Title({ f }: { f: number }) {
  const out = ramp(f, 46, 16, EASE.exit);
  if (out >= 1) return null;
  const mark = ramp(f, 4, 20);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: 1 - out, filter: out > 0 ? `blur(${(out * 10).toFixed(2)}px)` : undefined, transform: `scale(${1 + 0.04 * out})` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 30, opacity: mark, transform: `translateY(${(1 - mark) * 20}px)` }}>
        <Logo size={120} />
        <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 112, letterSpacing: "-0.02em", color: C.foreground }}>Ogma</span>
      </div>
      <BlurWords text="Dev-Dashboard für den Arbeitsrechner" f={f} start={12} style={{ marginTop: 44, fontFamily: sans, fontWeight: 500, fontSize: 52, color: C.dim, justifyContent: "center" }} />
    </AbsoluteFill>
  );
}

function Outro({ f }: { f: number }) {
  if (f < OUTRO) return null;
  const mark = ramp(f, OUTRO, 26, EASE.overshoot);
  const out = ramp(f, OUTRO + 24, 20, EASE.exit);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: 1 - out, filter: out > 0 ? `blur(${(out * 8).toFixed(2)}px)` : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <div style={{ opacity: Math.min(1, mark * 1.5), transform: `scale(${mix(0.6, 1, mark)})` }}>
          <Logo size={180} />
        </div>
        <BlurWords text="Ogma" f={f} start={OUTRO + 8} dur={26} style={{ fontFamily: sans, fontWeight: 700, fontSize: 168, letterSpacing: "-0.02em", color: C.foreground }} />
      </div>
    </AbsoluteFill>
  );
}

/** Lower third below the window: one factual label per shot. */
function Caption({ f }: { f: number }) {
  return (
    <>
      {SHOTS.map(({ from, to, text }) => {
        if (!text || f < from + 4 || f >= to) return null;
        const out = ramp(f, to - 12, 12, EASE.exit);
        return (
          <div key={from} style={{ position: "absolute", left: WIN.x, bottom: 40, opacity: 1 - out, filter: out > 0 ? `blur(${(out * 6).toFixed(2)}px)` : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "16px 30px 16px 22px", borderRadius: 14, background: `color-mix(in srgb, ${C.foreground} 5%, ${C.background})`, border: `1px solid color-mix(in srgb, ${C.foreground} 14%, transparent)` }}>
              <div style={{ width: 6, height: 40, borderRadius: 3, background: C.accent }} />
              <BlurWords text={text} f={f} start={from + 4} gap={2} dur={18} blur={8} style={{ fontFamily: sans, fontWeight: 600, fontSize: 40, lineHeight: 1.1, color: C.foreground }} />
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Dims everything except the highlighted widgets of the current shot (cut-out via a huge box-shadow). */
function Highlight({ f }: { f: number }) {
  return (
    <>
      {SHOTS.map(({ from, to, box }) => {
        if (!box) return null;
        const w = ramp(f, from, 18) * (1 - ramp(f, to - 14, 14, EASE.exit));
        if (w <= 0) return null;
        return <div key={from} style={{ position: "absolute", left: box.x - 8, top: box.y - 8, width: box.w + 16, height: box.h + 16, borderRadius: 20, boxShadow: `0 0 0 5000px color-mix(in srgb, ${C.background} ${(w * 30).toFixed(1)}%, transparent)` }} />;
      })}
    </>
  );
}

function App({ f, dark }: { f: number; dark: boolean }) {
  const [, cx, cy, zoom] = track(CAM, f, EASE.cam);
  const inn = ramp(f, APP_IN, 18);
  const out = ramp(f, APP_OUT, 14, EASE.exit);
  if (inn <= 0 || out >= 1) return null;
  const scale = zoom * FIT;
  const viewH = WIN.h - WIN.bar;
  return (
    <AbsoluteFill style={{ opacity: inn * (1 - out), transform: `translateY(${((1 - inn) * 24).toFixed(2)}px)`, filter: out > 0 ? `blur(${(out * 6).toFixed(2)}px)` : undefined }}>
      <div style={{ position: "absolute", left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h, borderRadius: WIN.r, overflow: "hidden", background: C.background, border: `1px solid color-mix(in srgb, ${C.foreground} 16%, transparent)`, boxShadow: `0 40px 90px color-mix(in srgb, ${C.foreground} 22%, transparent), 0 6px 20px color-mix(in srgb, ${C.foreground} 12%, transparent)` }}>
        <div style={{ height: WIN.bar, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", background: `color-mix(in srgb, ${C.foreground} 5%, ${C.background})`, borderBottom: `1px solid color-mix(in srgb, ${C.foreground} 12%, transparent)` }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: 12, height: 12, borderRadius: 6, background: `color-mix(in srgb, ${C.foreground} 22%, transparent)` }} />
          ))}
        </div>
        <div style={{ position: "relative", width: WIN.w, height: viewH, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: PAGE.w, height: PAGE.h, transformOrigin: "0 0", transform: `translate(${WIN.w / 2 - cx * scale}px, ${viewH / 2 - cy * scale}px) scale(${scale})` }}>
            <Img src={staticFile(`captures/${dark ? "dark" : "light"}/page.png`)} style={{ width: PAGE.w, height: PAGE.h }} />
            <Highlight f={f} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

export function Showcase({ dark }: { dark: boolean }) {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ ...themeVars(dark), background: `radial-gradient(ellipse at 50% 40%, ${C.background}, color-mix(in srgb, ${C.foreground} 9%, ${C.background}))`, fontFamily: sans }}>
      <App f={f} dark={dark} />
      {f < APP_OUT && <Caption f={f} />}
      <Title f={f} />
      <Outro f={f} />
    </AbsoluteFill>
  );
}
