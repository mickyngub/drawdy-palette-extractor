import {
    chroma,
    deltaE,
    hexToOklab,
    hueDegrees,
    oklabToHex,
    rgbToOklab,
    type Lab,
} from "../../src/shared/colour";
import type { PaletteColour, SortKey } from "../../src/shared/spec";

export type Swatch = { hex: string; share: number; lab: Lab };

export type RoleKey = "vibrant" | "muted" | "darkVibrant" | "lightMuted";

export type Roles = Record<RoleKey, Swatch | null>;

export const MAX_PIXELS = 160_000;
export const MAX_ITERATIONS = 20;
export const MERGE_DISTANCE = 0.02;
export const ROLE_CLUSTERS = 16;
const SEED = 0x5eed;
const ALPHA_MIN = 128;
const NEUTRAL_CHROMA = 0.03;

type Point = { lab: Lab; weight: number };

export function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Five bits per channel, like Android's Palette. Each bin keeps the exact
// sum of its pixels, so a flat colour comes back exactly.
export function histogram(pixels: ArrayLike<number>): Point[] {
    const counts = new Uint32Array(32768);
    const sums = new Float64Array(32768 * 3);
    for (let i = 0; i + 3 < pixels.length; i += 4) {
        if (pixels[i + 3] < ALPHA_MIN) continue;
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        counts[key] += 1;
        sums[key * 3] += r;
        sums[key * 3 + 1] += g;
        sums[key * 3 + 2] += b;
    }
    const points: Point[] = [];
    for (let key = 0; key < counts.length; key++) {
        const n = counts[key];
        if (n === 0) continue;
        points.push({
            lab: rgbToOklab({
                r: sums[key * 3] / n,
                g: sums[key * 3 + 1] / n,
                b: sums[key * 3 + 2] / n,
            }),
            weight: n,
        });
    }
    return points;
}

const distance2 = (x: Lab, y: Lab): number =>
    (x.L - y.L) ** 2 + (x.a - y.a) ** 2 + (x.b - y.b) ** 2;

function pickWeighted(weights: number[], total: number, r: number): number {
    let target = r * total;
    for (let i = 0; i < weights.length; i++) {
        target -= weights[i];
        if (target < 0) return i;
    }
    return weights.length - 1;
}

export function kmeans(points: Point[], k: number, seed = SEED): Point[] {
    if (points.length <= k) return points.map((p) => ({ ...p }));
    const random = mulberry32(seed);

    const centres: Lab[] = [];
    const weights = points.map((p) => p.weight);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    centres.push({
        ...points[pickWeighted(weights, totalWeight, random())].lab,
    });
    const nearest = points.map((p) => distance2(p.lab, centres[0]));
    while (centres.length < k) {
        const scores = points.map((p, i) => p.weight * nearest[i]);
        const total = scores.reduce((sum, s) => sum + s, 0);
        if (total === 0) break;
        const centre = { ...points[pickWeighted(scores, total, random())].lab };
        centres.push(centre);
        for (let i = 0; i < points.length; i++) {
            nearest[i] = Math.min(nearest[i], distance2(points[i].lab, centre));
        }
    }

    const assignment = new Int32Array(points.length).fill(-1);
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        let changed = false;
        for (let i = 0; i < points.length; i++) {
            let best = 0;
            let bestDistance = Infinity;
            for (let c = 0; c < centres.length; c++) {
                const d = distance2(points[i].lab, centres[c]);
                if (d < bestDistance) {
                    best = c;
                    bestDistance = d;
                }
            }
            if (assignment[i] !== best) {
                assignment[i] = best;
                changed = true;
            }
        }
        if (!changed) break;
        const acc = centres.map(() => ({ L: 0, a: 0, b: 0, w: 0 }));
        for (let i = 0; i < points.length; i++) {
            const a = acc[assignment[i]];
            const { lab, weight } = points[i];
            a.L += lab.L * weight;
            a.a += lab.a * weight;
            a.b += lab.b * weight;
            a.w += weight;
        }
        acc.forEach((a, c) => {
            if (a.w > 0)
                centres[c] = { L: a.L / a.w, a: a.a / a.w, b: a.b / a.w };
        });
    }

    const clusters = centres.map((lab) => ({ lab, weight: 0 }));
    for (let i = 0; i < points.length; i++) {
        clusters[assignment[i]].weight += points[i].weight;
    }
    return clusters.filter((c) => c.weight > 0);
}

export function mergeClose(
    clusters: Point[],
    threshold = MERGE_DISTANCE
): Point[] {
    const merged = clusters.map((c) => ({
        lab: { ...c.lab },
        weight: c.weight,
    }));
    for (;;) {
        let pair: [number, number] | null = null;
        let closest = threshold;
        for (let i = 0; i < merged.length; i++) {
            for (let j = i + 1; j < merged.length; j++) {
                const d = deltaE(merged[i].lab, merged[j].lab);
                if (d < closest) {
                    closest = d;
                    pair = [i, j];
                }
            }
        }
        if (!pair) return merged;
        const [i, j] = pair;
        const x = merged[i];
        const y = merged[j];
        const w = x.weight + y.weight;
        merged[i] = {
            lab: {
                L: (x.lab.L * x.weight + y.lab.L * y.weight) / w,
                a: (x.lab.a * x.weight + y.lab.a * y.weight) / w,
                b: (x.lab.b * x.weight + y.lab.b * y.weight) / w,
            },
            weight: w,
        };
        merged.splice(j, 1);
    }
}

export function extractFromPoints(points: Point[], k: number): Swatch[] {
    const clusters = mergeClose(kmeans(points, k));
    const total = clusters.reduce((sum, c) => sum + c.weight, 0);
    if (total === 0) return [];
    return clusters
        .map((c) => ({
            hex: oklabToHex(c.lab),
            share: c.weight / total,
            lab: c.lab,
        }))
        .sort((x, y) => y.share - x.share || y.lab.L - x.lab.L);
}

export function extractPalette(pixels: ArrayLike<number>, k: number): Swatch[] {
    return extractFromPoints(histogram(pixels), k);
}

export function sortSwatches(swatches: Swatch[], by: SortKey): Swatch[] {
    const sorted = [...swatches];
    if (by === "share") {
        sorted.sort((x, y) => y.share - x.share || y.lab.L - x.lab.L);
    } else if (by === "lightness") {
        sorted.sort((x, y) => y.lab.L - x.lab.L);
    } else {
        const neutral = (s: Swatch) => chroma(s.lab) < NEUTRAL_CHROMA;
        sorted.sort((x, y) => {
            const nx = neutral(x);
            const ny = neutral(y);
            if (nx !== ny) return nx ? 1 : -1;
            if (nx) return y.lab.L - x.lab.L;
            return hueDegrees(x.lab) - hueDegrees(y.lab);
        });
    }
    return sorted;
}

export function swatchesFromColours(colours: PaletteColour[]): Swatch[] {
    return colours.map((c) => ({
        hex: c.hex,
        share: c.share,
        lab: hexToOklab(c.hex) ?? { L: 0, a: 0, b: 0 },
    }));
}

type RoleTarget = {
    key: RoleKey;
    minL: number;
    maxL: number;
    targetL: number;
    minC: number;
    maxC: number;
    targetC: number;
};

// Android's Palette targets, moved from HSL into OKLCh lightness and chroma.
// Picked in Android's order so each colour fills at most one role.
const ROLE_TARGETS: RoleTarget[] = [
    {
        key: "vibrant",
        minL: 0.5,
        maxL: 0.85,
        targetL: 0.68,
        minC: 0.1,
        maxC: 1,
        targetC: 0.3,
    },
    {
        key: "darkVibrant",
        minL: 0.2,
        maxL: 0.55,
        targetL: 0.4,
        minC: 0.08,
        maxC: 1,
        targetC: 0.3,
    },
    {
        key: "lightMuted",
        minL: 0.75,
        maxL: 1,
        targetL: 0.88,
        minC: 0,
        maxC: 0.08,
        targetC: 0.03,
    },
    {
        key: "muted",
        minL: 0.45,
        maxL: 0.8,
        targetL: 0.62,
        minC: 0,
        maxC: 0.1,
        targetC: 0.05,
    },
];

export function pickRoles(swatches: Swatch[]): Roles {
    const roles: Roles = {
        vibrant: null,
        muted: null,
        darkVibrant: null,
        lightMuted: null,
    };
    const used = new Set<Swatch>();
    const maxShare = Math.max(0, ...swatches.map((s) => s.share));
    for (const target of ROLE_TARGETS) {
        let best: Swatch | null = null;
        let bestScore = -Infinity;
        for (const swatch of swatches) {
            if (used.has(swatch)) continue;
            const L = swatch.lab.L;
            const C = chroma(swatch.lab);
            if (L < target.minL || L > target.maxL) continue;
            if (C < target.minC || C > target.maxC) continue;
            const score =
                0.52 * (1 - Math.abs(L - target.targetL)) +
                0.24 * (1 - Math.min(1, Math.abs(C - target.targetC) / 0.3)) +
                0.24 * (maxShare > 0 ? swatch.share / maxShare : 0);
            if (score > bestScore) {
                best = swatch;
                bestScore = score;
            }
        }
        if (best) {
            roles[target.key] = best;
            used.add(best);
        }
    }
    return roles;
}
