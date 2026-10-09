import type {
    DriverCommandIssuer,
    DriverManifest,
    DriverModule,
    ModuleStyling,
    SubscribeableKey,
    SubscribedDrawdyElement,
} from "@drawdy/driver-protocol";
import { isRotated, readBoardImage } from "./lib/board-image";
import {
    findFreeRect,
    revealAndSelect,
    union,
    visibleArea,
} from "./lib/free-spot";
import {
    BOARD_COLOURS,
    paletteElements,
    planPalette,
    preferredRect,
    rowFrame,
    type Carry,
    type Point,
} from "./layout";
import type {
    DriverToWebview,
    Rect,
    SelectionInfo,
    WebviewToDriver,
} from "./shared/messages";
import { parseSpec, type PaletteSpec } from "./shared/spec";
import { WEBVIEW_HTML } from "./webview-html";

// Drawdy shows this through <img>, where currentColor is black, so the colours are explicit.
const ACTION_BUTTON_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="18" height="18"><defs><clipPath id="t"><rect x="1" y="1" width="22" height="22" rx="6"/></clipPath></defs><g clip-path="url(#t)"><rect x="1" y="1" width="5.5" height="22" fill="#ef4444"/><rect x="6.5" y="1" width="5.5" height="22" fill="#f59e0b"/><rect x="12" y="1" width="5.5" height="22" fill="#10b981"/><rect x="17.5" y="1" width="5.5" height="22" fill="#3b82f6"/></g><g fill="#ffffff" stroke="#1f2937" stroke-opacity="0.35" stroke-width="0.6" paint-order="stroke" transform="rotate(45 12 12)"><rect x="10" y="2.5" width="4" height="6" rx="2"/><rect x="8.5" y="8.5" width="7" height="2.2" rx="1.1"/><path d="M10.6 10.7h2.8v6.8l-1.4 3.2l-1.4-3.2z"/></g></svg>`;

const PARAMS_KV_KEY = "params";
// LIGHT_FOREGROUND in Drawdy's palette: adaptive, so it flips to light ink in dark mode.
const FALLBACK_INK = "oklch(0.25 0.005 260)";
const PERMISSION_MESSAGE =
    "Palette Extractor needs permission to read the board. Reload the page and click Allow.";
const BOARD_FULL_MESSAGE =
    "The board is full: it holds at most 10,000 elements. Remove some, then try again.";
const REJECTED_MESSAGE = "The board rejected the swatches.";
const FAILED_MESSAGE = "Something went wrong. Try again.";

let requestId = 0;

let driver: {
    manifest: DriverManifest;
    issueCommand: DriverCommandIssuer;
    generateId: () => string;
    styling: ModuleStyling;
    actionButtonId: string;
    webviewId: string;
    webviewHtml: string | null;
    webviewOpen: boolean;
    panelLoaded: boolean;
    panelReady: boolean;
    started: boolean;
    params: Record<string, unknown> | null;
    selection: string[];
    selectionSeq: number;
    editing: { versions: string[][]; origin: Point; width: number } | null;
} | null = null;

let chain: Promise<void> = Promise.resolve();

const nextRequestId = (): string => String(requestId++);

function stylingCssVars(styling: ModuleStyling): string {
    return Object.entries(styling)
        .map(([key, value]) =>
            key === "theme"
                ? `color-scheme: ${value};`
                : `--drawdy-${key.replace(
                      /[A-Z]/g,
                      (c) => `-${c.toLowerCase()}`
                  )}: ${value};`
        )
        .join("");
}

function enqueue(task: () => Promise<void>): Promise<void> {
    const next = chain
        .then(task)
        .catch(() => post({ type: "error", message: FAILED_MESSAGE }));
    chain = next;
    return next;
}

function post(message: DriverToWebview): void {
    if (!driver) return;
    void driver.issueCommand({
        type: "command:webview:post-message",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: { webviewDomId: driver.webviewId, message },
    });
}

function boardContext() {
    return {
        issueCommand: driver!.issueCommand,
        driverId: driver!.manifest.driverId,
        nextRequestId,
        webviewDomId: driver!.webviewId,
    };
}

function reportDenied(error: { type: string } | undefined): void {
    if (error?.type === "unauthorized") {
        post({ type: "error", message: PERMISSION_MESSAGE });
    }
}

export const activate: DriverModule["activate"] = async ({
    manifest,
    issueCommand,
    styling,
    generateId,
}) => {
    driver = {
        manifest,
        issueCommand,
        generateId,
        styling,
        actionButtonId: `${manifest.driverId}:action-button`,
        webviewId: `${manifest.driverId}:webview`,
        webviewHtml: null,
        webviewOpen: false,
        panelLoaded: false,
        panelReady: false,
        started: false,
        params: null,
        selection: [],
        selectionSeq: 0,
        editing: null,
    };
    const { driverId } = manifest;

    const created = await issueCommand({
        type: "command:dom:create-action-button",
        driverId,
        requestId: nextRequestId(),
        req: { domElementId: driver.actionButtonId, svg: ACTION_BUTTON_SVG },
    });
    if (created.res.error !== undefined) return;

    await Promise.all([
        issueCommand({
            type: "subscription:dom:element-clicked",
            driverId,
            requestId: nextRequestId(),
            req: { domElementId: driver.actionButtonId },
        }),
        issueCommand({
            type: "subscription:webview:message",
            driverId,
            requestId: nextRequestId(),
            req: { webviewDomId: driver.webviewId },
        }),
        issueCommand({
            type: "subscription:dom:theme-changed",
            driverId,
            requestId: nextRequestId(),
        }),
    ]);
};

export const onEvent: DriverModule["onEvent"] = async (event) => {
    if (!driver) return;
    switch (event.type) {
        case "subscription:dom:element-clicked": {
            if (event.body.domElementId !== driver.actionButtonId) return;
            await enqueue(openWebview);
            return;
        }
        case "subscription:webview:message": {
            if (event.body.webviewDomId !== driver.webviewId) return;
            const message = event.body.message;
            if (typeof message !== "object" || message === null) return;
            try {
                await handleWebviewMessage(message as WebviewToDriver);
            } catch {
                post({ type: "error", message: FAILED_MESSAGE });
            }
            return;
        }
        case "subscription:scene:drawdy-element-selection": {
            if (!driver.webviewOpen || !driver.panelReady) return;
            driver.selection = [...event.body.drawdyElementIds];
            await postSelection();
            return;
        }
        case "subscription:dom:theme-changed": {
            driver.styling = event.body.styling;
            driver.webviewHtml = null;
            if (driver.panelReady) {
                post({ type: "theme", css: stylingCssVars(driver.styling) });
            }
            return;
        }
        default: {
            return;
        }
    }
};

async function openWebview(): Promise<void> {
    if (!driver) return;
    if (driver.webviewHtml === null) {
        driver.webviewHtml = WEBVIEW_HTML.replace(
            "/*__DRAWDY_STYLING__*/",
            stylingCssVars(driver.styling)
        );
    }
    await driver.issueCommand({
        type: "command:webview:create",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: {
            webviewDomId: driver.webviewId,
            htmlContent: driver.webviewHtml,
            keepStateWhenClosed: true,
        },
    });
    if (!driver) return;
    driver.webviewOpen = true;
    // The host keeps the hidden panel alive, so it sends no second ready.
    if (!driver.panelLoaded) return;
    driver.panelReady = true;
    post({ type: "theme", css: stylingCssVars(driver.styling) });
    driver.selection = await currentSelection();
    await postSelection();
}

// Runs on the panel's first ready, so no prompt appears before the user opens Palette Extractor.
async function start(): Promise<void> {
    if (!driver || driver.started) return;
    driver.started = true;
    const { driverId } = driver.manifest;
    const stored = await driver.issueCommand({
        type: "command:kv-storage:get",
        driverId,
        requestId: nextRequestId(),
        req: { key: PARAMS_KV_KEY },
    });
    if (!driver) return;
    if (stored.res.error === undefined) {
        const restored = stored.res.value?.got?.[PARAMS_KV_KEY];
        if (restored && typeof restored === "object") {
            driver.params = restored as Record<string, unknown>;
        }
    }
    await driver.issueCommand({
        type: "subscription:scene:drawdy-element-selection",
        driverId,
        requestId: nextRequestId(),
    });
}

async function getElements(
    properties: SubscribeableKey[],
    ids: string[]
): Promise<SubscribedDrawdyElement[]> {
    if (!driver || ids.length === 0) return [];
    const res = await driver.issueCommand({
        type: "command:scene:get-drawdy-elements",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: { properties, drawdyElementIds: ids },
    });
    if (res.res.error !== undefined) {
        reportDenied(res.res.error);
        return [];
    }
    return [...res.res.value.drawdyElements];
}

async function currentSelection(): Promise<string[]> {
    if (!driver) return [];
    const res = await driver.issueCommand({
        type: "command:scene:get-current-selected-drawdy-elements",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
    });
    if (res.res.error !== undefined) {
        reportDenied(res.res.error);
        return driver?.selection ?? [];
    }
    return [...res.res.value.drawdyElementIds];
}

function ownMeta(
    element: SubscribedDrawdyElement | undefined
): Record<string, unknown> | null {
    if (!driver || !element) return null;
    const meta = element.meta?.[driver.manifest.driverId];
    return meta && typeof meta === "object"
        ? (meta as Record<string, unknown>)
        : null;
}

const idList = (value: unknown): string[] | null =>
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((id) => typeof id === "string")
        ? (value as string[])
        : null;

async function selectionInfo(ids: string[]): Promise<SelectionInfo> {
    const elements = await getElements(["type", "meta"], ids);
    return {
        count: elements.length,
        images: elements.filter((e) => e.type === "image").length,
        editable: elements.some((e) => ownMeta(e) !== null),
    };
}

async function postSelection(): Promise<void> {
    if (!driver) return;
    const seq = ++driver.selectionSeq;
    const selection = await selectionInfo(driver.selection);
    if (!driver || seq !== driver.selectionSeq) return;
    post({ type: "selection", selection });
}

async function handleWebviewMessage(message: WebviewToDriver): Promise<void> {
    if (!driver) return;
    switch (message.type) {
        case "ready": {
            driver.panelLoaded = true;
            driver.panelReady = true;
            driver.webviewOpen = true;
            await start();
            if (!driver) return;
            driver.selection = await currentSelection();
            const selection = await selectionInfo(driver.selection);
            if (!driver) return;
            post({
                type: "init",
                params: driver.params ?? undefined,
                selection,
            });
            post({ type: "theme", css: stylingCssVars(driver.styling) });
            return;
        }
        case "params": {
            const params = message.params;
            if (typeof params !== "object" || params === null) return;
            driver.params = params;
            await driver.issueCommand({
                type: "command:kv-storage:set",
                driverId: driver.manifest.driverId,
                requestId: nextRequestId(),
                req: {
                    key: PARAMS_KV_KEY,
                    payload: { [PARAMS_KV_KEY]: params },
                },
            });
            return;
        }
        case "read-selection": {
            await enqueue(async () =>
                readSource(await currentSelection(), false)
            );
            return;
        }
        case "edit-selected": {
            await enqueue(editSelected);
            return;
        }
        case "stop-editing": {
            driver.editing = null;
            return;
        }
        case "place": {
            const spec = parseSpec(message.spec);
            await enqueue(() => (spec ? place(spec) : badSpec()));
            return;
        }
        case "update": {
            const spec = parseSpec(message.spec);
            await enqueue(() => (spec ? update(spec) : badSpec()));
            return;
        }
        case "history": {
            await history(message.action);
            return;
        }
        case "close": {
            driver.webviewOpen = false;
            driver.panelReady = false;
            await driver.issueCommand({
                type: "command:webview:hide",
                driverId: driver.manifest.driverId,
                requestId: nextRequestId(),
                req: { webviewDomId: driver.webviewId },
            });
            return;
        }
    }
}

async function history(action: "undo" | "redo"): Promise<void> {
    if (!driver) return;
    const { driverId } = driver.manifest;
    const requestId = nextRequestId();
    await (action === "redo"
        ? driver.issueCommand({
              type: "command:history:redo",
              driverId,
              requestId,
          })
        : driver.issueCommand({
              type: "command:history:undo",
              driverId,
              requestId,
          }));
}

async function badSpec(): Promise<void> {
    post({ type: "error", message: "That palette could not be read." });
}

// query-combined-rect only uses the anchor point of text and images, so build the union here.
async function unionRect(ids: string[]): Promise<Rect | null> {
    if (!driver || ids.length === 0) return null;
    const res = await driver.issueCommand({
        type: "command:scene:element-rects",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: { drawdyElementIds: ids },
    });
    if (res.res.error !== undefined) {
        reportDenied(res.res.error);
        return null;
    }
    return union(res.res.value.rects.map((r) => r.rect));
}

async function readSource(ids: string[], forEdit: boolean): Promise<void> {
    if (!driver) return;
    const elements = await getElements(["type"], ids);
    if (!driver) return;
    if (elements.length === 0) {
        if (!forEdit) {
            post({
                type: "error",
                message: "Select an image or some shapes on the board first.",
            });
        }
        return;
    }
    const found = elements.map((e) => e.id);
    const images = elements.filter((e) => e.type === "image");
    if (images.length === elements.length) {
        const blobs: Blob[] = [];
        let note: string | null = null;
        for (const image of images) {
            const read = await readBoardImage(boardContext(), image.id);
            if (!driver) return;
            if (read.ok) {
                blobs.push(read.image.blob);
                note ??= read.image.note;
            } else if (read.reason === "permission") {
                post({ type: "error", message: PERMISSION_MESSAGE });
                return;
            }
        }
        if (blobs.length === 0) {
            post({
                type: "error",
                message:
                    images.length === 1
                        ? "The selected image could not be read."
                        : "Those images could not be read.",
            });
            return;
        }
        post({
            type: "source",
            images: blobs,
            ref: { kind: "board", ids: found, images: true },
            label: blobs.length === 1 ? "1 image" : `${blobs.length} images`,
            forEdit,
            note,
        });
        return;
    }
    const rect = await unionRect(found);
    if (!driver) return;
    if (!rect) {
        post({ type: "error", message: "The selection could not be found." });
        return;
    }
    const shot = await driver.issueCommand({
        type: "command:scene:capture-screenshot",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: { area: rect },
    });
    if (!driver) return;
    if (shot.res.error !== undefined) {
        post({
            type: "error",
            message:
                shot.res.error.type === "unauthorized"
                    ? PERMISSION_MESSAGE
                    : "The selection could not be captured.",
        });
        return;
    }
    post({
        type: "source",
        images: [shot.res.value.png],
        ref: { kind: "board", ids: found, images: false },
        label:
            found.length === 1
                ? "1 element from the board"
                : `${found.length} elements from the board`,
        forEdit,
        note: null,
    });
}

async function editSelected(): Promise<void> {
    if (!driver) return;
    const selected = await getElements(["meta"], await currentSelection());
    if (!driver) return;
    const mine = selected.filter((e) => ownMeta(e) !== null);
    if (mine.length === 0) {
        post({
            type: "error",
            message: "Select a palette that Palette Extractor placed.",
        });
        return;
    }
    // The first swatch holds the spec and every member's id; the others point at it.
    const pointer = ownMeta(mine[0])?.first;
    const firstId =
        mine.find((e) => ownMeta(e)?.spec !== undefined)?.id ??
        (typeof pointer === "string" ? pointer : undefined);
    const first =
        mine.find((e) => e.id === firstId) ??
        (firstId ? (await getElements(["meta"], [firstId]))[0] : undefined);
    if (!driver) return;
    const own = ownMeta(first);
    const spec = parseSpec(own?.spec);
    if (!spec) {
        post({
            type: "error",
            message:
                "This palette has lost its settings, so it cannot be edited.",
        });
        return;
    }
    const memberIds = idList(own?.members) ?? mine.map((m) => m.id);
    const frame = await paletteFrame(memberIds);
    if (!driver) return;
    if (!frame) {
        post({ type: "error", message: "The palette could not be found." });
        return;
    }
    driver.editing = {
        versions: [frame.ids],
        origin: frame.origin,
        width: frame.width,
    };
    post({ type: "edit", spec });
    if (spec.source?.kind === "board") {
        await readSource(spec.source.ids, true);
    }
}

async function paletteFrame(
    ids: string[]
): Promise<{ ids: string[]; origin: Point; width: number } | null> {
    const elements = await getElements(["type", "points"], ids);
    const frame = rowFrame(elements);
    return frame ? { ids: elements.map((e) => e.id), ...frame } : null;
}

async function inkColour(): Promise<string> {
    if (!driver) return FALLBACK_INK;
    const res = await driver.issueCommand({
        type: "command:scene:query-tool-style-state",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: { toolId: "text" },
    });
    if (res.res.error !== undefined) return FALLBACK_INK;
    const state = res.res.value.state;
    return state && state.toolId === "text" && state.color
        ? state.color
        : FALLBACK_INK;
}

async function addPalette(
    spec: PaletteSpec,
    rect: Rect,
    carry: Carry
): Promise<{ ids: string[] } | { failure: string }> {
    if (!driver) return { failure: REJECTED_MESSAGE };
    const elements = paletteElements({
        spec,
        origin: { x: rect.x, y: rect.y },
        width: rect.width,
        ink: await inkColour(),
        board: BOARD_COLOURS[driver.styling.theme],
        carry,
        driverId: driver.manifest.driverId,
        generateId: driver.generateId,
    });
    if (!driver) return { failure: REJECTED_MESSAGE };
    const added = await driver.issueCommand({
        type: "command:scene:add-drawdy-elements",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: { elements },
    });
    if (added.res.error !== undefined) return { failure: REJECTED_MESSAGE };
    const ids = elements.map((e) => e.drawdyElementId);
    // Over the board's element cap the host adds nothing and still reports success.
    if (!(await unionRect([ids[0]]))) return { failure: BOARD_FULL_MESSAGE };
    return { ids };
}

async function place(spec: PaletteSpec): Promise<void> {
    if (!driver) return;
    const board = boardContext();
    const anchor =
        spec.source?.kind === "board"
            ? await unionRect(spec.source.ids)
            : null;
    const area = anchor ? null : await visibleArea(board);
    const rect = await findFreeRect(board, preferredRect(spec, anchor, area));
    const added = await addPalette(spec, rect, {});
    if (!driver) return;
    if ("failure" in added) {
        post({ type: "error", message: added.failure });
        return;
    }
    await revealAndSelect(board, added.ids, rect);
    post({ type: "placed", updated: false, rotationReset: false, undoSteps: 1 });
}

async function update(spec: PaletteSpec): Promise<void> {
    if (!driver) return;
    const editing = driver.editing;
    if (!editing) {
        post({
            type: "error",
            message: "Select the palette again and click Edit selected.",
        });
        return;
    }
    const { driverId } = driver.manifest;
    // Undo can bring back any earlier version, so replace whichever exist, read as they are now.
    const existing = await getElements(
        [
            "type",
            "points",
            "rotation",
            "opacity",
            "layer",
            "frameId",
            "groupId",
            "locked",
            "meta",
        ],
        [...new Set(editing.versions.flat())]
    );
    if (!driver) return;
    const frame = rowFrame(existing);
    const origin = frame?.origin ?? editing.origin;
    const width = frame?.width ?? editing.width;
    const first =
        existing.find((e) => ownMeta(e)?.spec !== undefined) ??
        existing.find((e) => e.type === "path");
    const carry: Carry = {
        groupId: first?.groupId,
        frameId: first?.frameId,
        layer: first?.layer,
        opacity: first?.opacity,
    };
    const rotationReset = existing.some((e) => isRotated(e.rotation));
    const locked = existing.some((e) => e.locked === true);
    const oldIds = existing.map((e) => e.id);

    const board = boardContext();
    const rect = await findFreeRect(
        board,
        {
            x: origin.x,
            y: origin.y,
            width,
            height: planPalette(spec, width).height,
        },
        oldIds
    );
    if (oldIds.length > 0) {
        const removed = await driver.issueCommand({
            type: "command:scene:remove-drawdy-elements",
            driverId,
            requestId: nextRequestId(),
            req: { drawdyElementIds: oldIds },
        });
        if (!driver) return;
        if (removed.res.error !== undefined) {
            post({
                type: "error",
                message: "The old palette could not be removed.",
            });
            return;
        }
    }
    const added = await addPalette(spec, rect, carry);
    if (!driver) return;
    if ("failure" in added) {
        if (oldIds.length > 0) await history("undo");
        post({ type: "error", message: added.failure });
        return;
    }
    let undoSteps = oldIds.length > 0 ? 2 : 1;
    if (locked) {
        await driver.issueCommand({
            type: "command:scene:update-drawdy-elements",
            driverId,
            requestId: nextRequestId(),
            req: {
                updates: added.ids.map((drawdyElementId) => ({
                    drawdyElementId,
                    properties: { locked: true },
                })),
            },
        });
        undoSteps += 1;
    }
    if (!driver) return;
    driver.editing = {
        versions: [...editing.versions, added.ids],
        origin: { x: rect.x, y: rect.y },
        width: rect.width,
    };
    await revealAndSelect(board, added.ids, rect);
    post({ type: "placed", updated: true, rotationReset, undoSteps });
}
