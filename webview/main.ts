import type {
    DriverToWebview,
    SelectionInfo,
    WebviewToDriver,
} from "../src/shared/messages";
import {
    contrastRatio,
    DARK_SURFACE,
    formatRatio,
    parseHex,
    wcagLevel,
    type WcagLevel,
} from "../src/shared/colour";
import { nearestCssName } from "../src/shared/css-names";
import {
    DEFAULT_PARAMS,
    K_MAX,
    K_MIN,
    parseParams,
    type ExportFormat,
    type Layout,
    type PaletteSpec,
    type Params,
    type SortKey,
    type SourceRef,
} from "../src/shared/spec";
import { FORMAT_LABELS, formatExport } from "./lib/exports";
import {
    extractFromPoints,
    histogram,
    MAX_PIXELS,
    pickRoles,
    ROLE_CLUSTERS,
    sortSwatches,
    swatchesFromColours,
    type RoleKey,
    type Roles,
    type Swatch,
} from "./lib/palette";
import {
    concatPixels,
    decodeImage,
    drawPreview,
    fingerprint,
    toPixels,
    type Decoded,
} from "./lib/source";
import { el, fillSegmented, makeSegmented, makeSlider } from "./ui";

type DrawdyWebviewApi = {
    postMessage(message: unknown, transfer?: Transferable[]): void;
    onMessage(listener: (message: unknown) => void): () => void;
};

declare function acquireDrawdyApi(): DrawdyWebviewApi;

type Source = {
    points: ReturnType<typeof histogram>;
    ref: SourceRef;
};

const PARAMS_DEBOUNCE_MS = 400;
const UPLOAD_HINT = "Click to upload an image, or drop or paste one here.";
const EDIT_HINT =
    "The image behind this palette is not loaded. Upload it again to change the number of colours.";
const ROLE_LABELS: [RoleKey, string][] = [
    ["vibrant", "Vibrant"],
    ["muted", "Muted"],
    ["darkVibrant", "Dark vibrant"],
    ["lightMuted", "Light muted"],
];
const LEVEL_CLASS: Record<WcagLevel, string> = {
    AAA: "pass",
    AA: "pass",
    "AA large": "large",
    Fail: "fail",
};
const LEVEL_WORDS: Record<WcagLevel, string> = {
    AAA: "passes AAA",
    AA: "passes AA",
    "AA large": "passes AA for large text only",
    Fail: "fails AA",
};
const WHITE = parseHex("#ffffff")!;
const DARK = parseHex(DARK_SURFACE)!;

const api = acquireDrawdyApi();

const stage = document.getElementById("stage") as HTMLDivElement;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const hint = document.getElementById("hint") as HTMLDivElement;
const hintText = document.getElementById("hint-text") as HTMLSpanElement;
const uploadInput = document.getElementById("upload-input") as HTMLInputElement;
const selectionText = document.getElementById(
    "selection-text"
) as HTMLSpanElement;
const useSelection = document.getElementById(
    "use-selection"
) as HTMLButtonElement;
const controlsEl = document.getElementById("controls") as HTMLElement;
const paletteCount = document.getElementById(
    "palette-count"
) as HTMLSpanElement;
const swatchList = document.getElementById("swatches") as HTMLDivElement;
const rolesEl = document.getElementById("roles") as HTMLDivElement;
const formatRow = document.getElementById("format") as HTMLDivElement;
const exportArea = document.getElementById("export") as HTMLTextAreaElement;
const copyExport = document.getElementById("copy-export") as HTMLButtonElement;
const statusLine = document.getElementById("status") as HTMLDivElement;
const editButton = document.getElementById(
    "edit-selected"
) as HTMLButtonElement;
const stopButton = document.getElementById("stop-editing") as HTMLButtonElement;
const placeButton = document.getElementById("place") as HTMLButtonElement;
const clip = document.getElementById("clip") as HTMLTextAreaElement;

let params: Params = { ...DEFAULT_PARAMS };
let source: Source | null = null;
let palette: Swatch[] = [];
let roles: Roles | null = null;
let selection: SelectionInfo = { count: 0, images: 0, editable: false };
let editing: { source?: SourceRef } | null = null;
let busy = false;
let paramsTimer = 0;
let adoptToken = 0;

function send(message: WebviewToDriver): void {
    api.postMessage(message);
}

function queueParams(): void {
    if (paramsTimer) clearTimeout(paramsTimer);
    paramsTimer = setTimeout(() => {
        paramsTimer = 0;
        send({
            type: "params",
            params: params as unknown as Record<string, unknown>,
        });
    }, PARAMS_DEBOUNCE_MS) as unknown as number;
}

function setStatus(text: string, tone: "" | "good" | "bad" = ""): void {
    statusLine.textContent = text;
    statusLine.className = `status${tone ? ` ${tone}` : ""}`;
}

function plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function sharePercent(share: number): string {
    const percent = share * 100;
    if (percent > 0 && percent < 1) return "<1%";
    return `${Math.round(percent)}%`;
}

function sorted(): Swatch[] {
    return sortSwatches(palette, params.sort);
}

function currentSpec(): PaletteSpec {
    const spec: PaletteSpec = {
        colours: sorted().map((s) => ({
            hex: s.hex,
            share: Math.round(s.share * 10000) / 10000,
        })),
        layout: params.layout,
        k: params.k,
        sort: params.sort,
    };
    const ref = source?.ref ?? editing?.source;
    if (ref) spec.source = ref;
    return spec;
}

function copy(text: string, what: string, area: HTMLTextAreaElement): void {
    const back = document.activeElement as HTMLElement | null;
    if (area === clip) clip.value = text;
    area.focus();
    area.select();
    let copied = false;
    try {
        copied = document.execCommand("copy");
    } catch {
        copied = false;
    }
    if (copied) {
        if (area === clip) back?.focus();
        setStatus(`Copied ${what}.`, "good");
        return;
    }
    setStatus(`Press ⌘C or Ctrl+C to copy ${what}.`);
}

const sliders = {
    k: makeSlider(
        controlsEl,
        { id: "colours", label: "Colours", min: K_MIN, max: K_MAX, step: 1 },
        params.k,
        (k) => {
            params = { ...params, k };
            if (source) palette = extractFromPoints(source.points, k);
            renderPalette();
            queueParams();
        }
    ),
};

const paintSort = makeSegmented<SortKey>(
    controlsEl,
    "Sort",
    [
        ["share", "Share"],
        ["lightness", "Lightness"],
        ["hue", "Hue"],
    ],
    params.sort,
    (sort) => {
        params = { ...params, sort };
        renderPalette();
        queueParams();
    }
);

const paintLayout = makeSegmented<Layout>(
    controlsEl,
    "Layout on the board",
    [
        ["squares", "Equal squares"],
        ["bar", "Share bar"],
    ],
    params.layout,
    (layout) => {
        params = { ...params, layout };
        queueParams();
    }
);

const paintFormat = fillSegmented<ExportFormat>(
    formatRow,
    FORMAT_LABELS,
    params.format,
    (format) => {
        params = { ...params, format };
        renderExport();
        queueParams();
    }
);
formatRow.setAttribute("role", "group");
formatRow.setAttribute("aria-label", "Export format");

function pushControls(): void {
    sliders.k.set(params.k);
    paintSort(params.sort);
    paintLayout(params.layout);
    paintFormat(params.format);
}

function contrastPill(
    parent: HTMLElement,
    hex: string,
    against: "light" | "dark"
): string {
    const rgb = parseHex(hex)!;
    const ratio = contrastRatio(rgb, against === "light" ? WHITE : DARK);
    const level = wcagLevel(ratio);
    const pill = el("span", `pill on-${against}`, parent);
    const sample = el("span", "aa", pill);
    sample.textContent = "Aa";
    sample.style.color = hex;
    const value = el("span", undefined, pill);
    value.textContent = formatRatio(ratio);
    const badge = el("span", `lvl ${LEVEL_CLASS[level]}`, pill);
    badge.textContent = level;
    const where = against === "light" ? "white" : DARK_SURFACE;
    const words = `On ${where}: ${formatRatio(ratio)} to 1, ${LEVEL_WORDS[level]}`;
    pill.title = words;
    return words;
}

function renderSwatches(list: Swatch[]): void {
    swatchList.textContent = "";
    if (list.length === 0) {
        const note = el("div", "empty-note", swatchList);
        note.textContent = editing
            ? "This palette has no colours."
            : "Upload an image or use your selection to see its colours.";
        return;
    }
    for (const swatch of list) {
        const hex = swatch.hex.toUpperCase();
        const name = nearestCssName(swatch.hex);
        const button = el("button", "swatch", swatchList);
        button.type = "button";
        const chip = el("span", "chip", button);
        chip.style.background = swatch.hex;
        const body = el("span", "swatch-body", button);
        const top = el("span", "swatch-top", body);
        el("span", "hex", top).textContent = hex;
        const nameEl = el("span", "name ellipsis", top);
        nameEl.textContent = name.name;
        nameEl.title = `CSS name: ${name.keyword}`;
        el("span", "share", top).textContent = sharePercent(swatch.share);
        const contrast = el("span", "contrast", body);
        const onLight = contrastPill(contrast, swatch.hex, "light");
        const onDark = contrastPill(contrast, swatch.hex, "dark");
        button.setAttribute(
            "aria-label",
            `Copy ${hex}, near ${name.name}, ${sharePercent(swatch.share)}. ${onLight}. ${onDark}.`
        );
        button.addEventListener("click", () => copy(hex, hex, clip));
    }
}

function renderRoles(): void {
    rolesEl.textContent = "";
    for (const [key, label] of ROLE_LABELS) {
        const swatch = roles?.[key] ?? null;
        if (!swatch) {
            const none = el("div", "role none", rolesEl);
            el("span", "chip", none);
            const body = el("span", "role-body", none);
            el("span", "role-name", body).textContent = label;
            el("span", "muted", body).textContent = "None found";
            continue;
        }
        const hex = swatch.hex.toUpperCase();
        const button = el("button", "role", rolesEl);
        button.type = "button";
        button.setAttribute("aria-label", `Copy ${label.toLowerCase()} ${hex}`);
        el("span", "chip", button).style.background = swatch.hex;
        const body = el("span", "role-body", button);
        el("span", "role-name", body).textContent = label;
        el("span", "hex", body).textContent = hex;
        button.addEventListener("click", () => copy(hex, hex, clip));
    }
}

function renderExport(): void {
    const list = sorted();
    exportArea.value = list.length
        ? formatExport(
              params.format,
              list.map((s) => ({
                  hex: s.hex,
                  share: s.share,
                  keyword: nearestCssName(s.hex).keyword,
              }))
          )
        : "";
    exportArea.placeholder = "The code for your palette shows here.";
    copyExport.disabled = list.length === 0;
}

function renderPalette(): void {
    const list = sorted();
    paletteCount.textContent = list.length
        ? list.length < params.k && source
            ? `Only ${list.length} distinct colour${list.length === 1 ? "" : "s"}`
            : plural(list.length, "colour")
        : "";
    renderSwatches(list);
    renderExport();
    renderFooter();
}

function renderStage(): void {
    stage.classList.toggle("empty", !source);
    stage.setAttribute(
        "aria-label",
        source ? "Change image" : "Upload an image"
    );
    if (source) {
        hint.hidden = true;
    } else {
        hintText.textContent = editing ? EDIT_HINT : UPLOAD_HINT;
        hint.hidden = false;
    }
    sliders.k.setDisabled(!!editing && !source);
}

function renderSelection(): void {
    const { count, images } = selection;
    selectionText.textContent =
        count === 0
            ? "Nothing selected on the board"
            : images === count
              ? `${plural(count, "image")} selected`
              : `${plural(count, "element")} selected`;
    useSelection.disabled = count === 0 || busy;
}

function renderFooter(): void {
    editButton.hidden = !selection.editable || !!editing;
    stopButton.hidden = !editing;
    placeButton.textContent = editing ? "Update on board" : "Place on board";
    placeButton.disabled = palette.length === 0 || busy;
    renderSelection();
}

function render(): void {
    renderStage();
    renderPalette();
    renderRoles();
}

async function adopt(
    inputs: (Blob | string)[],
    ref: SourceRef | null,
    keepPalette: boolean
): Promise<boolean> {
    const token = ++adoptToken;
    const decoded = (await Promise.all(inputs.map(decodeImage))).filter(
        (d): d is Decoded => d !== null
    );
    if (token !== adoptToken) {
        decoded.forEach((d) => d.release());
        return false;
    }
    if (decoded.length === 0) {
        setStatus("That image could not be read.", "bad");
        return false;
    }
    const budget = Math.floor(MAX_PIXELS / decoded.length);
    const pixels = concatPixels(decoded.map((d) => toPixels(d, budget)));
    const points = histogram(pixels);
    if (points.length === 0) {
        decoded.forEach((d) => d.release());
        setStatus(
            "That image is fully transparent, so it has no colours to read.",
            "bad"
        );
        return false;
    }
    drawPreview(canvas, decoded);
    decoded.forEach((d) => d.release());
    source = {
        points,
        ref: ref ?? { kind: "upload", key: fingerprint(pixels) },
    };
    roles = pickRoles(extractFromPoints(points, ROLE_CLUSTERS));
    if (!keepPalette) palette = extractFromPoints(points, params.k);
    render();
    return true;
}

async function adoptUpload(file: File): Promise<void> {
    setStatus("Reading the image…");
    if (await adopt([file], null, false)) setStatus("");
}

function imageFileFrom(items: DataTransfer | null): File | null {
    if (!items) return null;
    for (const file of Array.from(items.files)) {
        if (file.type.startsWith("image/")) return file;
    }
    return null;
}

function place(): void {
    if (palette.length === 0) {
        setStatus("Upload an image first.", "bad");
        return;
    }
    busy = true;
    renderFooter();
    setStatus(editing ? "Updating…" : "Placing…");
    send(
        editing
            ? { type: "update", spec: currentSpec() }
            : { type: "place", spec: currentSpec() }
    );
}

function startEdit(spec: PaletteSpec): void {
    editing = spec.source ? { source: spec.source } : {};
    params = { ...params, k: spec.k, sort: spec.sort, layout: spec.layout };
    pushControls();
    const sameUpload =
        spec.source?.kind === "upload" &&
        source?.ref.kind === "upload" &&
        source.ref.key === spec.source.key;
    if (!sameUpload) {
        adoptToken += 1;
        source = null;
    }
    palette = swatchesFromColours(spec.colours);
    if (!source) roles = pickRoles(palette);
    busy = false;
    setStatus(
        "Editing the selected palette. Change it, then click Update on board."
    );
    render();
}

function stopEdit(): void {
    editing = null;
    send({ type: "stop-editing" });
    setStatus("");
    render();
}

function wire(): void {
    stage.addEventListener("click", () => uploadInput.click());
    stage.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        uploadInput.click();
    });
    uploadInput.addEventListener("change", () => {
        const file = uploadInput.files?.[0];
        uploadInput.value = "";
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setStatus("That file is not an image.", "bad");
            return;
        }
        void adoptUpload(file);
    });
    const over = (event: DragEvent) => {
        event.preventDefault();
        stage.classList.add("dragover");
    };
    stage.addEventListener("dragover", over);
    stage.addEventListener("dragenter", over);
    stage.addEventListener("dragleave", () =>
        stage.classList.remove("dragover")
    );
    stage.addEventListener("drop", (event) => {
        event.preventDefault();
        stage.classList.remove("dragover");
        const file = imageFileFrom(event.dataTransfer);
        if (file) void adoptUpload(file);
    });
    document.addEventListener("paste", (event) => {
        const file = imageFileFrom(event.clipboardData);
        if (!file) return;
        event.preventDefault();
        void adoptUpload(file);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        send({ type: "close" });
    });
    useSelection.addEventListener("click", () => {
        busy = true;
        renderFooter();
        setStatus("Reading the selection…");
        send({ type: "read-selection" });
    });
    copyExport.addEventListener("click", () =>
        copy(exportArea.value, "the code", exportArea)
    );
    editButton.addEventListener("click", () => {
        setStatus("Loading the palette…");
        send({ type: "edit-selected" });
    });
    stopButton.addEventListener("click", stopEdit);
    placeButton.addEventListener("click", place);
}

async function handle(message: DriverToWebview): Promise<void> {
    switch (message.type) {
        case "init": {
            params = parseParams(message.params);
            selection = message.selection;
            pushControls();
            if (source) palette = extractFromPoints(source.points, params.k);
            render();
            return;
        }
        case "selection": {
            selection = message.selection;
            renderFooter();
            return;
        }
        case "source": {
            const ok = await adopt(
                message.images,
                message.ref,
                message.forEdit
            );
            busy = false;
            renderFooter();
            if (ok && !message.forEdit)
                setStatus(`Read ${message.label}.`, "good");
            return;
        }
        case "edit": {
            startEdit(message.spec);
            return;
        }
        case "placed": {
            busy = false;
            renderFooter();
            setStatus(
                message.updated
                    ? "Updated the palette on the board."
                    : "Placed on the board.",
                "good"
            );
            return;
        }
        case "error": {
            busy = false;
            renderFooter();
            setStatus(message.message, "bad");
            return;
        }
    }
}

wire();
render();

api.onMessage((raw) => {
    if (!raw || typeof raw !== "object") return;
    void handle(raw as DriverToWebview);
});

send({ type: "ready" });
