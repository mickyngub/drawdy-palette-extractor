import type {
    DriverCommandIssuer,
    DriverManifest,
    DriverModule,
    ModuleStyling,
    SubscribeableKey,
    SubscribedDrawdyElement,
} from "@drawdy/driver-protocol";
import {
    belowSource,
    centredOrigin,
    paletteElements,
    planPalette,
    PLACE_WIDTH,
    rowFrame,
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
const FLY_DURATION_MS = 350;
// LIGHT_FOREGROUND in Drawdy's palette: adaptive, so it flips to light ink in dark mode.
const FALLBACK_INK = "oklch(0.25 0.005 260)";

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
    const next = chain.then(task).catch(() => undefined);
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
        issueCommand({
            type: "subscription:scene:drawdy-element-selection",
            driverId,
            requestId: nextRequestId(),
        }),
    ]);

    const stored = await issueCommand({
        type: "command:kv-storage:get",
        driverId,
        requestId: nextRequestId(),
        req: { key: PARAMS_KV_KEY },
    });
    if (driver && stored.res.error === undefined) {
        const restored = stored.res.value?.got?.[PARAMS_KV_KEY];
        if (restored && typeof restored === "object") {
            driver.params = restored as Record<string, unknown>;
        }
    }
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
            await handleWebviewMessage(message as WebviewToDriver);
            return;
        }
        case "subscription:scene:drawdy-element-selection": {
            driver.selection = [...event.body.drawdyElementIds];
            if (driver.webviewOpen) await postSelection();
            return;
        }
        case "subscription:dom:theme-changed": {
            driver.styling = event.body.styling;
            if (!driver.webviewOpen) driver.webviewHtml = null;
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
    await postSelection();
}

async function getElements(
    properties: SubscribeableKey[],
    ids?: string[]
): Promise<SubscribedDrawdyElement[]> {
    if (!driver) return [];
    const res = await driver.issueCommand({
        type: "command:scene:get-drawdy-elements",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: ids ? { properties, drawdyElementIds: ids } : { properties },
    });
    if (res.res.error !== undefined) return [];
    return [...res.res.value.drawdyElements];
}

async function currentSelection(): Promise<string[]> {
    if (!driver) return [];
    const res = await driver.issueCommand({
        type: "command:scene:get-current-selected-drawdy-elements",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
    });
    if (res.res.error !== undefined) return driver?.selection ?? [];
    return [...res.res.value.drawdyElementIds];
}

function ownMeta(
    element: SubscribedDrawdyElement
): Record<string, unknown> | null {
    if (!driver) return null;
    const meta = element.meta?.[driver.manifest.driverId];
    return meta && typeof meta === "object"
        ? (meta as Record<string, unknown>)
        : null;
}

async function postSelection(): Promise<void> {
    if (!driver) return;
    const seq = ++driver.selectionSeq;
    const ids = driver.selection;
    const elements = ids.length ? await getElements(["type", "meta"], ids) : [];
    if (!driver || seq !== driver.selectionSeq) return;
    const selection: SelectionInfo = {
        count: elements.length,
        images: elements.filter((e) => e.type === "image").length,
        editable: elements.some((e) => ownMeta(e) !== null),
    };
    post({ type: "selection", selection });
}

async function handleWebviewMessage(message: WebviewToDriver): Promise<void> {
    if (!driver) return;
    switch (message.type) {
        case "ready": {
            driver.webviewOpen = true;
            driver.selection = await currentSelection();
            if (!driver) return;
            const elements = driver.selection.length
                ? await getElements(["type", "meta"], driver.selection)
                : [];
            if (!driver) return;
            post({
                type: "init",
                params: driver.params ?? undefined,
                selection: {
                    count: elements.length,
                    images: elements.filter((e) => e.type === "image").length,
                    editable: elements.some((e) => ownMeta(e) !== null),
                },
            });
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
        case "close": {
            driver.webviewOpen = false;
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

async function badSpec(): Promise<void> {
    post({ type: "error", message: "That palette could not be read." });
}

async function combinedRect(ids: string[]): Promise<Rect | null> {
    if (!driver || ids.length === 0) return null;
    const res = await driver.issueCommand({
        type: "command:scene:query-combined-rect",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: { drawdyElementIds: ids },
    });
    if (res.res.error !== undefined) return null;
    return res.res.value.rect;
}

async function readSource(ids: string[], forEdit: boolean): Promise<void> {
    if (!driver) return;
    const elements = ids.length ? await getElements(["type"], ids) : [];
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
        for (const image of images) {
            const res = await driver.issueCommand({
                type: "command:scene:get-image-source",
                driverId: driver.manifest.driverId,
                requestId: nextRequestId(),
                req: { drawdyElementId: image.id },
            });
            if (!driver) return;
            if (res.res.error === undefined) blobs.push(res.res.value.blob);
        }
        if (blobs.length === 0) {
            post({ type: "error", message: "Those images could not be read." });
            return;
        }
        post({
            type: "source",
            images: blobs,
            ref: { kind: "board", ids: found, images: true },
            label: blobs.length === 1 ? "1 image" : `${blobs.length} images`,
            forEdit,
        });
        return;
    }
    const rect = await combinedRect(found);
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
            message: "The selection could not be captured.",
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
    });
}

async function editSelected(): Promise<void> {
    if (!driver) return;
    const selected = await getElements(
        ["groupId", "meta"],
        await currentSelection()
    );
    if (!driver) return;
    const mine = selected.filter((e) => ownMeta(e) !== null);
    if (mine.length === 0) {
        post({
            type: "error",
            message: "Select a palette that Palette Extractor placed.",
        });
        return;
    }
    const groupId = mine.find((e) => e.groupId)?.groupId;
    const members = groupId
        ? (await getElements(["groupId", "meta"])).filter(
              (e) => e.groupId === groupId && ownMeta(e) !== null
          )
        : mine;
    if (!driver) return;
    let spec: PaletteSpec | null = null;
    for (const member of members) {
        spec = parseSpec(ownMeta(member)?.spec);
        if (spec) break;
    }
    if (!spec) {
        post({
            type: "error",
            message:
                "This palette has lost its settings, so it cannot be edited.",
        });
        return;
    }
    const memberIds = members.map((m) => m.id);
    const frame = await paletteFrame(memberIds);
    if (!driver) return;
    if (!frame) {
        post({ type: "error", message: "The palette could not be found." });
        return;
    }
    driver.editing = {
        versions: [memberIds],
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
    const elements = ids.length
        ? await getElements(["type", "points"], ids)
        : [];
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
    origin: Point,
    width: number
): Promise<string[] | null> {
    if (!driver) return null;
    const elements = paletteElements({
        spec,
        origin,
        width,
        ink: await inkColour(),
        driverId: driver.manifest.driverId,
        generateId: driver.generateId,
    });
    if (!driver) return null;
    const added = await driver.issueCommand({
        type: "command:scene:add-drawdy-elements",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: { elements },
    });
    if (added.res.error !== undefined) return null;
    return elements.map((e) => e.drawdyElementId);
}

async function viewRect(): Promise<Rect> {
    const fallback = { x: 0, y: 0, width: 0, height: 0 };
    if (!driver) return fallback;
    const res = await driver.issueCommand({
        type: "command:camera:get-viewport-rect",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
    });
    return res.res.error === undefined ? res.res.value.rect : fallback;
}

async function place(spec: PaletteSpec): Promise<void> {
    if (!driver) return;
    const anchor =
        spec.source?.kind === "board" && spec.source.images
            ? await combinedRect(spec.source.ids)
            : null;
    let origin: Point;
    let width: number;
    if (anchor) {
        ({ origin, width } = belowSource(anchor));
    } else {
        width = PLACE_WIDTH;
        origin = centredOrigin(await viewRect(), planPalette(spec, width));
    }
    const ids = await addPalette(spec, origin, width);
    if (!driver) return;
    if (!ids) {
        post({ type: "error", message: "The board rejected the swatches." });
        return;
    }
    await driver.issueCommand({
        type: "command:camera:fly-to-elements",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: {
            drawdyElementIds: ids,
            flyDurationMs: FLY_DURATION_MS,
            zoom: 1,
        },
    });
    post({ type: "placed", updated: false });
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
    // Undo can bring back any earlier version, so replace whichever exist.
    const frame = await paletteFrame([...new Set(editing.versions.flat())]);
    if (!driver) return;
    const origin = frame?.origin ?? editing.origin;
    const width = frame?.width ?? editing.width;
    if (frame) {
        await driver.issueCommand({
            type: "command:scene:remove-drawdy-elements",
            driverId: driver.manifest.driverId,
            requestId: nextRequestId(),
            req: { drawdyElementIds: frame.ids },
        });
    }
    const ids = await addPalette(spec, origin, width);
    if (!driver) return;
    if (!ids) {
        post({ type: "error", message: "The board rejected the swatches." });
        return;
    }
    driver.editing = {
        versions: [...editing.versions, ids],
        origin,
        width,
    };
    await driver.issueCommand({
        type: "command:scene:set-selection",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: { drawdyElementIds: ids },
    });
    post({ type: "placed", updated: true });
}
