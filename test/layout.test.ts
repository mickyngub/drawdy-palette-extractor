import assert from "node:assert/strict";
import { test } from "node:test";
import { PLACE_GAP } from "../src/lib/free-spot";
import {
    barHeight,
    BOARD_COLOURS,
    fitFont,
    hexFont,
    nameFont,
    nearBoard,
    NEUTRAL_STROKE,
    paletteElements,
    planPalette,
    preferredRect,
    rowFrame,
    rowGeometry,
} from "../src/layout";
import type { PaletteSpec } from "../src/shared/spec";

const DRIVER_ID = "mickyngub.palette-extractor";

const SPEC: PaletteSpec = {
    colours: [
        { hex: "#ef4444", share: 0.4 },
        { hex: "#f59e0b", share: 0.3 },
        { hex: "#10b981", share: 0.2 },
        { hex: "#1e3a8a", share: 0.1 },
    ],
    layout: "squares",
    k: 4,
    sort: "share",
    source: { kind: "upload", key: "abc" },
};

const ids = () => {
    let n = 0;
    return () => `id-${n++}`;
};

test("equal squares split the width with 8 unit gaps", () => {
    const row = rowGeometry([0.4, 0.3, 0.2, 0.1], "squares", 480);
    assert.equal(row.height, 114);
    assert.deepEqual(row.cells, [
        { x: 0, width: 114 },
        { x: 122, width: 114 },
        { x: 244, width: 114 },
        { x: 366, width: 114 },
    ]);
});

test("a share bar gives each colour its share of the width", () => {
    const row = rowGeometry([0.5, 0.3, 0.2], "bar", 480);
    assert.equal(row.height, 96);
    const widths = row.cells.map((c) => Math.round(c.width * 100) / 100);
    assert.deepEqual(widths, [236, 141.6, 94.4]);
    assert.deepEqual(
        row.cells.map((c) => Math.round(c.x * 100) / 100),
        [0, 240, 385.6]
    );
    const last = row.cells[2];
    assert.ok(Math.abs(last.x + last.width - 480) < 1e-9);
});

test("a tiny share still gets a 3 unit sliver and the bar keeps its width", () => {
    const row = rowGeometry([0.99, 0.005, 0.005], "bar", 480);
    assert.deepEqual(
        row.cells.map((c) => c.width),
        [466, 3, 3]
    );
    assert.equal(barHeight(200), 64);
    assert.equal(barHeight(1200), 160);
});

test("labels shrink to fit and drop out below 8 units", () => {
    assert.equal(fitFont(7, 1000, 16), 16);
    assert.equal(fitFont(7, 42, 16), 10);
    assert.equal(fitFont(7, 34, 16), 8);
    assert.equal(fitFont(7, 30, 16), null);
    assert.equal(hexFont(114), 16);
    assert.equal(hexFont(50), 8);
    assert.equal(hexFont(40), null);
    assert.equal(nameFont("light goldenrod yellow", 114), 14);
    assert.equal(nameFont("goldenrod", 60), 11);
    assert.equal(nameFont("goldenrod", 30), null);
});

test("a plan names each swatch and picks a readable label colour", () => {
    const plan = planPalette(SPEC, 480);
    assert.deepEqual(
        plan.swatches.map((s) => [s.hex, s.label?.colour, s.name?.text]),
        [
            ["#EF4444", "#1f2937", "orange red"],
            ["#F59E0B", "#1f2937", "orange"],
            ["#10B981", "#1f2937", "medium sea green"],
            ["#1E3A8A", "#ffffff", "dark slate blue"],
        ]
    );
    assert.equal(plan.rowHeight, 114);
    assert.ok(plan.height > plan.rowHeight);
});

test("the elements share one group and only the first carries the spec and member ids", () => {
    const elements = paletteElements({
        spec: SPEC,
        origin: { x: 100, y: 50 },
        width: 480,
        ink: "oklch(0.25 0.005 260)",
        driverId: DRIVER_ID,
        generateId: ids(),
    });
    assert.equal(elements.length, 8);
    const rects = elements.filter((e) => e.type === "shape");
    const texts = elements.filter((e) => e.type === "text");
    assert.equal(rects.length, 4);
    assert.equal(texts.length, 4);
    assert.ok(elements.every((e) => e.groupId === "id-0"));
    const members = elements.map((e) => e.drawdyElementId);
    assert.deepEqual(elements[0].meta, {
        [DRIVER_ID]: { v: 1, spec: SPEC, members },
    });
    assert.ok(
        elements.slice(1).every(
            (e) =>
                JSON.stringify(e.meta) ===
                JSON.stringify({
                    [DRIVER_ID]: { v: 1, part: true, first: members[0] },
                })
        )
    );
    const first = rects[0];
    assert.equal(first.type, "shape");
    if (first.type !== "shape") return;
    assert.deepEqual(
        {
            x: first.x,
            y: first.y,
            width: first.width,
            height: first.height,
            fillColor: first.fillColor,
            strokeColor: first.strokeColor,
            roughness: first.roughness,
            cornerRadius: first.cornerRadius,
            fillStyle: first.fillStyle,
            text: first.text,
            textColor: first.textColor,
        },
        {
            x: 100,
            y: 50,
            width: 114,
            height: 114,
            fillColor: "#EF4444",
            strokeColor: "#EF4444",
            roughness: 0,
            cornerRadius: 8,
            fillStyle: "solid",
            text: "#EF4444",
            textColor: "#1f2937",
        }
    );
    const name = texts[3];
    if (name.type !== "text") return;
    assert.deepEqual(
        {
            x: name.x,
            y: name.y,
            width: name.width,
            text: name.text,
            color: name.color,
            textAlign: name.textAlign,
        },
        {
            x: 466,
            y: 172,
            width: 114,
            text: "dark slate blue",
            color: "oklch(0.25 0.005 260)",
            textAlign: "center",
        }
    );
    assert.equal(new Set(elements.map((e) => e.drawdyElementId)).size, 8);
});

test("narrow share bar slivers keep their swatch but lose labels that cannot fit", () => {
    const elements = paletteElements({
        spec: {
            ...SPEC,
            layout: "bar",
            colours: [
                { hex: "#ef4444", share: 0.97 },
                { hex: "#1e3a8a", share: 0.03 },
            ],
        },
        origin: { x: 0, y: 0 },
        width: 480,
        ink: "#000000",
        driverId: DRIVER_ID,
        generateId: ids(),
    });
    const rects = elements.filter((e) => e.type === "shape");
    assert.equal(rects.length, 2);
    const sliver = rects[1];
    if (sliver.type !== "shape") return;
    assert.equal(sliver.text, undefined);
    assert.equal(sliver.cornerRadius, Math.min(8, sliver.width / 2));
    assert.equal(elements.filter((e) => e.type === "text").length, 1);
});

test("placement prefers 40 units under the source, or the middle of the visible area", () => {
    const under = preferredRect(SPEC, { x: 10, y: 20, width: 600, height: 400 }, null);
    assert.equal(under.x, 10);
    assert.equal(under.y, 20 + 400 + PLACE_GAP);
    assert.equal(under.width, 600);
    assert.equal(under.height, planPalette(SPEC, 600).height);
    assert.equal(
        preferredRect(SPEC, { x: 0, y: 0, width: 90, height: 90 }, null).width,
        240
    );
    const middle = preferredRect(
        SPEC,
        null,
        { x: -100, y: -200, width: 1000, height: 800 }
    );
    assert.equal(middle.width, 480);
    assert.equal(middle.x, 160);
    assert.equal(middle.y, -200 + (800 - middle.height) / 2);
});

test("a swatch close to the board colour gets a neutral edge", () => {
    assert.equal(nearBoard("#FFFFFF", BOARD_COLOURS.light), true);
    assert.equal(nearBoard("#E6E8EB", BOARD_COLOURS.light), true);
    assert.equal(nearBoard("#0F172A", BOARD_COLOURS.dark), true);
    assert.equal(nearBoard("#0F172A", BOARD_COLOURS.light), false);
    assert.equal(nearBoard("#EF4444", BOARD_COLOURS.dark), false);
    const elements = paletteElements({
        spec: {
            ...SPEC,
            colours: [
                { hex: "#ffffff", share: 0.5 },
                { hex: "#ef4444", share: 0.5 },
            ],
        },
        origin: { x: 0, y: 0 },
        width: 480,
        ink: "#000000",
        board: BOARD_COLOURS.light,
        driverId: DRIVER_ID,
        generateId: ids(),
    });
    const [white, red] = elements.filter((e) => e.type === "shape");
    if (white.type !== "shape" || red.type !== "shape") return;
    assert.equal(white.strokeColor, NEUTRAL_STROKE);
    assert.equal(red.strokeColor, "#EF4444");
});

test("a replaced palette's group, frame, layer and opacity carry over", () => {
    const elements = paletteElements({
        spec: SPEC,
        origin: { x: 0, y: 0 },
        width: 480,
        ink: "#000000",
        carry: { groupId: "outer", frameId: "frame-1", layer: 3, opacity: 0.5 },
        driverId: DRIVER_ID,
        generateId: ids(),
    });
    assert.ok(
        elements.every(
            (e) =>
                e.groupId === "outer" &&
                e.frameId === "frame-1" &&
                e.type !== "component" &&
                e.layer === 3 &&
                e.opacity === 0.5
        )
    );
    assert.ok(!elements.some((e) => e.drawdyElementId === "outer"));
});

test("the row frame comes from the swatch corners and ignores the names", () => {
    assert.deepEqual(
        rowFrame([
            {
                type: "path",
                points: [
                    [100, 50],
                    [214, 50],
                    [214, 164],
                    [100, 164],
                ],
            },
            {
                type: "path",
                points: [
                    [466, 50],
                    [580, 50],
                    [580, 164],
                    [466, 164],
                ],
            },
            { type: "text", points: [[40, 172]] },
        ]),
        { origin: { x: 100, y: 50 }, width: 480 }
    );
    assert.equal(rowFrame([{ type: "text", points: [[0, 0]] }]), null);
});
