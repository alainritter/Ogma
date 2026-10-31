// Easing and timing primitives from video-shotcraft (demos/_fixtures/Polish.tsx).

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** cubic-bezier(x1, y1, x2, y2) as in CSS; y may leave [0, 1] for anticipation and overshoot. */
const bezier = (x1: number, y1: number, x2: number, y2: number) => {
  const ax = 1 - 3 * x2 + 3 * x1, bx = 3 * x2 - 6 * x1, cx = 3 * x1;
  const ay = 1 - 3 * y2 + 3 * y1, by = 3 * y2 - 6 * y1, cy = 3 * y1;
  const x = (t: number) => ((ax * t + bx) * t + cx) * t;
  const y = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (input: number) => {
    const target = clamp01(input);
    let t = target;
    for (let i = 0; i < 8; i++) {
      const err = x(t) - target;
      if (Math.abs(err) < 1e-6) return y(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0, hi = 1;
    t = target;
    for (let i = 0; i < 30; i++) {
      if (x(t) < target) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return y(t);
  };
};

export const EASE = {
  out: bezier(0.22, 1, 0.36, 1), // soft ease-out: entrances, captions
  smooth: bezier(0.65, 0, 0.35, 1), // symmetric in-out: slow pushes
  swift: bezier(0.4, 0, 0.2, 1), // cursor travel
  cam: bezier(0.55, 0, 0.18, 1), // camera: decisive start, very soft landing (cursor-flyover)
  exit: bezier(0.7, 0, 0.84, 0), // exits
  overshoot: bezier(0.34, 1.45, 0.64, 1), // landing in a slot
};

/** Progress of a segment starting at `start`, `dur` frames long, eased and clamped. */
export const ramp = (frame: number, start: number, dur: number, ease: (t: number) => number = EASE.out) =>
  ease(clamp01((frame - start) / Math.max(1e-6, dur)));

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
