import type { DrawdyElementSchema } from "@drawdy/driver-protocol";
import { labelColour } from "./shared/colour";
import { nearestCssName } from "./shared/css-names";
import type { Layout, PaletteSpec } from "./shared/spec";

export type Point = { x: number; y: number };

export type Cell = { x: number; width: number };

export type Row = { cells: Cell[]; height: number };

export const PLACE_WIDTH = 480;
export const MIN_ROW_WIDTH = 240;
export const SQUARE_GAP = 8;
export const BAR_GAP = 4;
export const MIN_BAR_WIDTH = 3;
export const NAME_GAP = 8;
export const CORNER_RADIUS = 8;
export const MIN_FONT = 8;
export const HEX_FONT_MAX = 16;
export const NAME_FONT_MAX = 14;
// Measured in Drawdy's handwriting font: a hex label runs up to 0.6 em per
// character, and colour-name words 0.47 to 0.61.
export const CHAR_EM = 0.6;
// The host pads a shape's label by 8 on each side.
const SHAPE_TEXT_PADDING = 8;
const LINE_HEIGHT = 1.4;

export function barHeight(width: number): number {
    return Math.min(160, Math.max(64, Math.round(width / 5)));
}

function barWidths(shares: number[], available: number): number[] {
    const total = shares.reduce((sum, s) => sum + Math.max(0, s), 0);
    const n = shares.length;
    const raw = shares.map((s) =>
        total > 0 ? (Math.max(0, s) / total) * available : available / n
    );
    const pinned = new Set<number>();
    for (;;) {
        const free = raw.map((_, i) => i).filter((i) => !pinned.has(i));
        const freeRaw = free.reduce((sum, i) => sum + raw[i], 0);
        const room = available - pinned.size * MIN_BAR_WIDTH;
        const widths = raw.map((w, i) =>
            pinned.has(i)
                ? MIN_BAR_WIDTH
                : freeRaw > 0
                  ? (w / freeRaw) * room
                  : room / free.length
        );
        const tooThin = free.filter((i) => widths[i] < MIN_BAR_WIDTH);
        if (tooThin.length === 0 || free.length === tooThin.length) {
            return widths.map((w) => Math.max(MIN_BAR_WIDTH, w));
        }
        for (const i of tooThin) pinned.add(i);
    }
}

export function rowGeometry(
    shares: number[],
    layout: Layout,
    width: number
): Row {
    const n = shares.length;
    if (n === 0) return { cells: [], height: 0 };
    if (layout === "squares") {
        const size = (width - (n - 1) * SQUARE_GAP) / n;
        return {
            cells: shares.map((_, i) => ({
                x: i * (size + SQUARE_GAP),
                width: size,
            })),
            height: size,
        };
    }
    const widths = barWidths(shares, width - (n - 1) * BAR_GAP);
    const cells: Cell[] = [];
    let x = 0;
    for (const w of widths) {
        cells.push({ x, width: w });
        x += w + BAR_GAP;
    }
    return { cells, height: barHeight(width) };
}

export function fitFont(
    chars: number,
    available: number,
    max: number
): number | null {
    if (chars <= 0) return null;
    const size = Math.min(max, Math.floor(available / (chars * CHAR_EM)));
    return size >= MIN_FONT ? size : null;
}

export function hexFont(cellWidth: number): number | null {
    return fitFont(7, cellWidth - SHAPE_TEXT_PADDING * 2, HEX_FONT_MAX);
}

export function nameFont(name: string, cellWidth: number): number | null {
    const longest = Math.max(...name.split(" ").map((word) => word.length));
    return fitFont(longest, cellWidth, NAME_FONT_MAX);
}

function nameLines(name: string, font: number, cellWidth: number): number {
    const perLine = Math.max(1, Math.floor(cellWidth / (font * CHAR_EM)));
    let lines = 1;
    let used = 0;
    for (const word of name.split(" ")) {
        const need = used === 0 ? word.length : used + 1 + word.length;
        if (need > perLine && used > 0) {
            lines += 1;
            used = word.length;
        } else {
            used = need;
        }
    }
    return lines;
}

export type SwatchPlan = {
    x: number;
    width: number;
    hex: string;
    label: { text: string; font: number; colour: string } | null;
    name: { text: string; font: number } | null;
};

export type PalettePlan = {
    swatches: SwatchPlan[];
    rowHeight: number;
    width: number;
    height: number;
};

export function planPalette(
    spec: Pick<PaletteSpec, "colours" | "layout">,
    width: number
): PalettePlan {
    const row = rowGeometry(
        spec.colours.map((c) => c.share),
        spec.layout,
        width
    );
    let nameHeight = 0;
    const swatches = spec.colours.map((colour, i) => {
        const cell = row.cells[i];
        const hex = colour.hex.toUpperCase();
        const labelSize = hexFont(cell.width);
        const name = nearestCssName(colour.hex).name;
        const nameSize = nameFont(name, cell.width);
        if (nameSize !== null) {
            const lines = nameLines(name, nameSize, cell.width);
            nameHeight = Math.max(
                nameHeight,
                NAME_GAP + ((lines - 1) * LINE_HEIGHT + 1) * nameSize
            );
        }
        return {
            x: cell.x,
            width: cell.width,
            hex,
            label:
                labelSize === null
                    ? null
                    : {
                          text: hex,
                          font: labelSize,
                          colour: labelColour(colour.hex),
                      },
            name: nameSize === null ? null : { text: name, font: nameSize },
        };
    });
    return {
        swatches,
        rowHeight: row.height,
        width,
        height: row.height + nameHeight,
    };
}

export function paletteElements({
    spec,
    origin,
    width,
    ink,
    driverId,
    generateId,
}: {
    spec: PaletteSpec;
    origin: Point;
    width: number;
    ink: string;
    driverId: string;
    generateId: () => string;
}): DrawdyElementSchema[] {
    const plan = planPalette(spec, width);
    const groupId = generateId();
    const part = { [driverId]: { v: 1, part: true } };
    const rects: DrawdyElementSchema[] = plan.swatches.map((s, i) => ({
        type: "shape",
        componentType: "rect",
        drawdyElementId: generateId(),
        groupId,
        x: origin.x + s.x,
        y: origin.y,
        width: s.width,
        height: plan.rowHeight,
        // Upper case so the host's theme swap, which matches its own lower
        // case palette hexes exactly, never repaints a swatch in dark mode.
        strokeColor: s.hex,
        fillColor: s.hex,
        fillStyle: "solid",
        strokeWidth: 1,
        roughness: 0,
        cornerRadius: Math.min(CORNER_RADIUS, s.width / 2, plan.rowHeight / 2),
        ...(s.label
            ? {
                  text: s.label.text,
                  fontSize: s.label.font,
                  textColor: s.label.colour,
                  textAlign: "center" as const,
                  textVerticalAlign: "middle" as const,
              }
            : {}),
        meta: i === 0 ? { [driverId]: { v: 1, spec } } : part,
    }));
    const names: DrawdyElementSchema[] = [];
    for (const s of plan.swatches) {
        if (!s.name) continue;
        names.push({
            type: "text",
            drawdyElementId: generateId(),
            groupId,
            x: origin.x + s.x,
            y: origin.y + plan.rowHeight + NAME_GAP,
            width: s.width,
            text: s.name.text,
            fontSize: s.name.font,
            color: ink,
            textAlign: "center",
            meta: part,
        });
    }
    return [...rects, ...names];
}

export function centredOrigin(
    view: { x: number; y: number; width: number; height: number },
    size: { width: number; height: number }
): Point {
    return {
        x: view.x + (view.width - size.width) / 2,
        y: view.y + (view.height - size.height) / 2,
    };
}

// Read from the swatch corners rather than the elements' bounding rects, so
// repeated updates in place neither drift nor grow.
export function rowFrame(
    elements: { type?: string; points?: [number, number][] }[]
): { origin: Point; width: number } | null {
    const points = elements
        .filter((e) => e.type === "path")
        .flatMap((e) => e.points ?? []);
    if (points.length === 0) return null;
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const left = Math.min(...xs);
    return {
        origin: { x: left, y: Math.min(...ys) },
        width: Math.max(...xs) - left,
    };
}

export const SOURCE_GAP = 24;

export function belowSource(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
}): { origin: Point; width: number } {
    return {
        origin: { x: rect.x, y: rect.y + rect.height + SOURCE_GAP },
        width: Math.max(MIN_ROW_WIDTH, rect.width),
    };
}
