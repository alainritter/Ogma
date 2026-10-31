import type { CSSProperties } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { EASE, mix, ramp } from "./motion";
import { C, sans, themeVars } from "./theme";

// Looping 16:10 clip for the portfolio card, built from captures of the Ogma dashboard with fictional data
// (see capture/README.md): title, a camera ride over the real page (kanban, git and docker, live metrics, services),
// outro. Starts and ends on the empty background. Shot recipes from video-shotcraft: blur-slide (titles, captions),
// overhead camera moves (the ride over the page).
export const FPS = 30;
export const DURATION = 600;
export const WIDTH = 1920;
export const HEIGHT = 1200;

const PAGE = { w: 1920, h: 4829 }; // CSS px of the captured page
const APP_IN = 60;
const APP_OUT = 520;
const OUTRO = 540;

const CAPTIONS: [from: number, to: number, text: string][] = [
  [78, 156, "Alles auf einem Bildschirm"],
  [174, 262, "Aufgaben mit Fortschritt im Blick"],
  [286, 366, "Repos und Container im Griff"],
  [390, 466, "Live-Metriken deines Systems"],
  [476, 520, "Dienste und Netz geprüft"],
];

// Camera over the captured page (CSS px): point centered on screen and zoom.
type Key = [frame: number, cx: number, cy: number, zoom: number];
const CAM: Key[] = [
  [APP_IN, 960, 500, 0.86],
  [150, 960, 520, 0.98],
  [170, 960, 520, 0.98],
  [200, 960, 450, 1.0], // kanban
  [262, 960, 450, 1.03],
  [286, 960, 1060, 1.0], // git and docker
  [366, 960, 1100, 1.02],
  [390, 960, 1830, 1.0], // metrics and graph
  [466, 960, 1860, 1.03],
  [490, 960, 2640, 1.0], // services
  [APP_OUT, 960, 2680, 1.02],
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
      <BlurWords text="Das Dashboard für Entwickler" f={f} start={12} style={{ marginTop: 44, fontFamily: sans, fontWeight: 500, fontSize: 60, color: C.dim, justifyContent: "center" }} />
    </AbsoluteFill>
  );
}

function Outro({ f }: { f: number }) {
  if (f < OUTRO) return null;
  const mark = ramp(f, OUTRO, 26, EASE.overshoot);
  const out = ramp(f, 576, 20, EASE.exit);
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

function Caption({ f }: { f: number }) {
  return (
    <>
      {CAPTIONS.map(([from, to, text]) => {
        if (f < from || f >= to) return null;
        const out = ramp(f, to - 12, 12, EASE.exit);
        return (
          <div key={from} style={{ position: "absolute", left: 90, right: 90, bottom: 70, opacity: 1 - out, filter: out > 0 ? `blur(${(out * 6).toFixed(2)}px)` : undefined }}>
            <BlurWords text={text} f={f} start={from} gap={3} dur={20} blur={10} style={{ fontFamily: sans, fontWeight: 700, fontSize: 78, lineHeight: 1.1, letterSpacing: "-0.01em", color: C.foreground }} />
          </div>
        );
      })}
    </>
  );
}

function App({ f, dark }: { f: number; dark: boolean }) {
  const [, cx, cy, zoom] = track(CAM, f, EASE.cam);
  const inn = ramp(f, APP_IN, 16);
  const out = ramp(f, APP_OUT, 14, EASE.exit);
  if (inn <= 0 || out >= 1) return null;
  return (
    <AbsoluteFill style={{ opacity: inn * (1 - out), filter: out > 0 ? `blur(${(out * 6).toFixed(2)}px)` : undefined }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: PAGE.w, height: PAGE.h, transformOrigin: "0 0", transform: `translate(${WIDTH / 2 - cx * zoom}px, ${HEIGHT / 2 - cy * zoom}px) scale(${zoom})` }}>
        <Img src={staticFile(`captures/${dark ? "dark" : "light"}/page.png`)} style={{ width: PAGE.w, height: PAGE.h }} />
      </div>
      {/* caption band: the page fades into the background towards the bottom edge */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 300, background: `linear-gradient(to bottom, color-mix(in srgb, ${C.background} 0%, transparent), color-mix(in srgb, ${C.background} 90%, transparent) 55%, ${C.background})` }} />
    </AbsoluteFill>
  );
}

export function Showcase({ dark }: { dark: boolean }) {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ ...themeVars(dark), background: C.background, fontFamily: sans }}>
      <App f={f} dark={dark} />
      {f < APP_OUT + 14 && <Caption f={f} />}
      <Title f={f} />
      <Outro f={f} />
    </AbsoluteFill>
  );
}
