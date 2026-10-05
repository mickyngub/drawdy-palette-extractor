export type Layout = "squares" | "bar";
export type SortKey = "share" | "lightness" | "hue";
export type ExportFormat = "hex" | "css" | "tw3" | "tw4" | "json";

export type PaletteColour = { hex: string; share: number };

export type SourceRef =
    | { kind: "board"; ids: string[]; images: boolean }
    | { kind: "upload"; key: string };

export type PaletteSpec = {
    colours: PaletteColour[];
    layout: Layout;
    k: number;
    sort: SortKey;
    source?: SourceRef;
};

export type Params = {
    k: number;
    sort: SortKey;
    layout: Layout;
    format: ExportFormat;
};

export const K_MIN = 3;
export const K_MAX = 12;

export const DEFAULT_PARAMS: Params = {
    k: 6,
    sort: "share",
    layout: "squares",
    format: "hex",
};

export const LAYOUTS: Layout[] = ["squares", "bar"];
export const SORTS: SortKey[] = ["share", "lightness", "hue"];
export const FORMATS: ExportFormat[] = ["hex", "css", "tw3", "tw4", "json"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const oneOf = <T extends string>(
    options: readonly T[],
    value: unknown,
    fallback: T
): T => (options.includes(value as T) ? (value as T) : fallback);

function parseK(value: unknown, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.min(K_MAX, Math.max(K_MIN, Math.round(value)));
}

export function parseParams(raw: unknown): Params {
    const r = isRecord(raw) ? raw : {};
    return {
        k: parseK(r.k, DEFAULT_PARAMS.k),
        sort: oneOf(SORTS, r.sort, DEFAULT_PARAMS.sort),
        layout: oneOf(LAYOUTS, r.layout, DEFAULT_PARAMS.layout),
        format: oneOf(FORMATS, r.format, DEFAULT_PARAMS.format),
    };
}

function parseSource(raw: unknown): SourceRef | undefined {
    if (!isRecord(raw)) return undefined;
    if (raw.kind === "upload" && typeof raw.key === "string") {
        return { kind: "upload", key: raw.key };
    }
    if (
        raw.kind === "board" &&
        Array.isArray(raw.ids) &&
        raw.ids.length > 0 &&
        raw.ids.every((id) => typeof id === "string")
    ) {
        return {
            kind: "board",
            ids: raw.ids as string[],
            images: raw.images === true,
        };
    }
    return undefined;
}

export function parseSpec(raw: unknown): PaletteSpec | null {
    if (!isRecord(raw) || !Array.isArray(raw.colours)) return null;
    const colours: PaletteColour[] = [];
    for (const colour of raw.colours) {
        if (!isRecord(colour) || typeof colour.hex !== "string") return null;
        if (!/^#[0-9a-f]{6}$/i.test(colour.hex)) return null;
        const share =
            typeof colour.share === "number" && Number.isFinite(colour.share)
                ? Math.min(1, Math.max(0, colour.share))
                : 0;
        colours.push({ hex: colour.hex.toLowerCase(), share });
    }
    if (colours.length === 0 || colours.length > K_MAX) return null;
    const spec: PaletteSpec = {
        colours,
        layout: oneOf(LAYOUTS, raw.layout, DEFAULT_PARAMS.layout),
        k: parseK(raw.k, Math.max(K_MIN, colours.length)),
        sort: oneOf(SORTS, raw.sort, DEFAULT_PARAMS.sort),
    };
    const source = parseSource(raw.source);
    if (source) spec.source = source;
    return spec;
}
