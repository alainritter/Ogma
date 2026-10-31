import { continueRender, delayRender, staticFile } from "remotion";
import type { CSSProperties } from "react";

// Satoshi from Harmonia (the font Ogma itself uses), loaded once before the first frame renders.
export const sans = "Satoshi, sans-serif";
const handle = delayRender("Satoshi");
new FontFace("Satoshi", `url(${staticFile("fonts/Satoshi-Variable.woff2")})`, { weight: "300 900" })
  .load()
  .then((face) => {
    document.fonts.add(face);
    continueRender(handle);
  });

// Tokens from Harmonia/tokens.css (dark and light theme).
const LIGHT = { background: "#faf7f2", foreground: "#2a2620", dim: "#5f594f", accent: "#9a6a35", accentFg: "#fdfaf5" };
const DARK: typeof LIGHT = { background: "#0d1017", foreground: "#e6e1d8", dim: "#9a948a", accent: "#d4a574", accentFg: "#0d1017" };

/** CSS variables for one theme; set them on the root element, the components read them through `C`. */
export const themeVars = (dark: boolean) =>
  Object.fromEntries(Object.entries(dark ? DARK : LIGHT).map(([k, v]) => [`--${k}`, v])) as CSSProperties;

export const C = {
  background: "var(--background)",
  foreground: "var(--foreground)",
  dim: "var(--dim)",
  accent: "var(--accent)",
  accentFg: "var(--accentFg)",
};
