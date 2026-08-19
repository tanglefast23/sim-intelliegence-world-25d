/** Kindergrimm-style pencil: a stroke is a filled ribbon, never ctx.stroke(). */

export type Point = Readonly<{ x: number; y: number }>;

export const PAPER: readonly [number, number, number] = [246, 241, 229];
export const INK: readonly [number, number, number] = [31, 29, 26];

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(...parts: readonly (string | number)[]): number {
  let h = 2166136261;
  const text = parts.join(':');
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Sketch {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  j: () => number = mulberry32(1);

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
    this.clear();
  }

  boil(seed: number): void {
    this.j = mulberry32(seed >>> 0);
  }

  jr(min: number, max: number): number {
    return min + (max - min) * this.j();
  }

  clear(): void {
    this.data.fill(0);
  }

  fillPaper(): void {
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = PAPER[0];
      this.data[i + 1] = PAPER[1];
      this.data[i + 2] = PAPER[2];
      this.data[i + 3] = 255;
    }
  }

  put(x: number, y: number, r: number, g: number, b: number, a: number): void {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height || a <= 0) return;
    const i = (py * this.width + px) * 4;
    const srcA = a;
    const dstA = (this.data[i + 3] ?? 0) / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA <= 0) return;
    this.data[i] = Math.round((r * srcA + (this.data[i] ?? 0) * dstA * (1 - srcA)) / outA);
    this.data[i + 1] = Math.round((g * srcA + (this.data[i + 1] ?? 0) * dstA * (1 - srcA)) / outA);
    this.data[i + 2] = Math.round((b * srcA + (this.data[i + 2] ?? 0) * dstA * (1 - srcA)) / outA);
    this.data[i + 3] = Math.round(outA * 255);
  }

  blobPts(cx: number, cy: number, rx: number, ry: number, rot: number, wob: number): Point[] {
    const pts: Point[] = [];
    for (let i = 0; i < 16; i += 1) {
      const theta = (i / 16) * Math.PI * 2;
      const radius = 1 + (0.17 * Math.sin(2 * theta) + 0.1 * Math.sin(5 * theta)) * wob;
      const x = rx * Math.cos(theta) * radius;
      const y = ry * Math.sin(theta) * radius;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      pts.push({ x: cx + x * c - y * s, y: cy + x * s + y * c });
    }
    return chaikin(pts);
  }

  stroke(pts: readonly Point[], width: number, alpha = 0.62): void {
    if (pts.length < 2) return;
    const step = Math.max(2.2, width * 0.9);
    const spine = resample(pts, step);
    if (spine.length < 2) return;
    const f1 = this.jr(1.5, 3.5);
    const f2 = this.jr(5, 9);
    const f3 = this.jr(11, 17);
    const p1 = this.jr(0, Math.PI * 2);
    const p2 = this.jr(0, Math.PI * 2);
    const p3 = this.jr(0, Math.PI * 2);
    const p4 = this.jr(0, Math.PI * 2);
    const amp = width * 0.22;
    const left: Point[] = [];
    const right: Point[] = [];
    for (let i = 0; i < spine.length; i += 1) {
      const t = i / Math.max(1, spine.length - 1);
      const prev = spine[Math.max(0, i - 1)]!;
      const next = spine[Math.min(spine.length - 1, i + 1)]!;
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const off = amp * (
        0.55 * Math.sin(t * f1 * 2 + p1)
        + 0.3 * Math.sin(t * f2 + p2)
        + 0.15 * Math.sin(t * f3 + p3)
      );
      const grit = this.jr(-0.35, 0.35);
      const px = spine[i]!.x + nx * off + grit;
      const py = spine[i]!.y + ny * off + grit;
      const taper = t < 0.08 ? t / 0.08 : t > 0.92 ? (1 - t) / 0.08 : 1;
      const half = (width / 2) * taper
        * (1 + 0.38 * Math.sin(t * 7.3 + p4) + 0.14 * Math.sin(t * 19 + p2))
        * this.jr(0.88, 1.14);
      left.push({ x: px + nx * half, y: py + ny * half });
      right.push({ x: px - nx * half, y: py - ny * half });
      if (width >= 1.2) {
        const crumbs = 1 + Math.floor(this.j() * 4);
        for (let c = 0; c < crumbs; c += 1) {
          const spread = this.jr(-1.05, 1.05) * half;
          const ink = this.jr(0.2, 0.55);
          this.put(px + nx * spread, py + ny * spread, INK[0], INK[1], INK[2], ink * alpha);
          if (this.j() < 0.45) {
            this.put(px + nx * spread * 0.7, py + ny * spread * 0.7, PAPER[0], PAPER[1], PAPER[2], 0);
          }
        }
      }
    }
    this.fillPoly([...left, ...right.reverse()], INK[0], INK[1], INK[2], alpha);
  }

  sline(pts: readonly Point[], width: number, alpha = 0.45): void {
    this.stroke(pts, Math.max(0.8, width * 0.45), alpha);
  }

  broken(pts: readonly Point[], width: number): void {
    const passes = 2 + (this.j() > 0.5 ? 1 : 0);
    for (let i = 0; i < passes; i += 1) {
      const jittered = pts.map((pt) => ({ x: pt.x + this.jr(-0.6, 0.6), y: pt.y + this.jr(-0.6, 0.6) }));
      this.stroke(jittered, width * this.jr(0.86, 1.08), this.jr(0.48, 0.7));
    }
  }

  fill(pts: readonly Point[], rgb: readonly [number, number, number], alpha: number): void {
    this.fillPoly(pts, rgb[0], rgb[1], rgb[2], alpha);
  }

  smooth(pts: readonly Point[]): Point[] {
    return chaikin(pts);
  }

  private fillPoly(pts: readonly Point[], r: number, g: number, b: number, a: number): void {
    if (pts.length < 3) return;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const pt of pts) {
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(this.height - 1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y += 1) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i += 1) {
        const aPt = pts[i]!;
        const bPt = pts[(i + 1) % pts.length]!;
        if ((aPt.y <= y && bPt.y > y) || (bPt.y <= y && aPt.y > y)) {
          const t = (y - aPt.y) / ((bPt.y - aPt.y) || 1);
          xs.push(aPt.x + t * (bPt.x - aPt.x));
        }
      }
      xs.sort((left, right) => left - right);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const x0 = Math.max(0, Math.floor(xs[i]!));
        const x1 = Math.min(this.width - 1, Math.ceil(xs[i + 1]!));
        for (let x = x0; x <= x1; x += 1) this.put(x, y, r, g, b, a);
      }
    }
  }
}

function chaikin(pts: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    out.push(
      { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 },
      { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 },
    );
  }
  return out;
}

function resample(pts: readonly Point[], step: number): Point[] {
  const out: Point[] = [pts[0]!];
  let carry = 0;
  for (let i = 1; i < pts.length; i += 1) {
    let x0 = out[out.length - 1]!.x;
    let y0 = out[out.length - 1]!.y;
    let x1 = pts[i]!.x;
    let y1 = pts[i]!.y;
    let dist = Math.hypot(x1 - x0, y1 - y0);
    while (carry + dist >= step) {
      const remain = step - carry;
      const t = remain / dist;
      x0 += (x1 - x0) * t;
      y0 += (y1 - y0) * t;
      out.push({ x: x0, y: y0 });
      dist = Math.hypot(x1 - x0, y1 - y0);
      carry = 0;
    }
    carry += dist;
  }
  out.push(pts[pts.length - 1]!);
  return out;
}
