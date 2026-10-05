import assert from "node:assert/strict";
import { test } from "node:test";
import { hexToOklab, parseHex } from "../src/shared/colour";
import {
    extractPalette,
    histogram,
    kmeans,
    mergeClose,
    mulberry32,
    pickRoles,
    sortSwatches,
    swatchesFromColours,
} from "../webview/lib/palette";

const SOURCE = [
    { hex: "#ef4444", count: 5000 },
    { hex: "#10b981", count: 3000 },
    { hex: "#3b82f6", count: 2000 },
];

function syntheticImage(noise: number): Uint8ClampedArray {
    const random = mulberry32(42);
    const total = SOURCE.reduce((sum, s) => sum + s.count, 0) + 1500;
    const pixels = new Uint8ClampedArray(total * 4);
    let p = 0;
    for (const { hex, count } of SOURCE) {
        const { r, g, b } = parseHex(hex)!;
        for (let i = 0; i < count; i++) {
            const jitter = () => Math.round((random() * 2 - 1) * noise);
            pixels[p++] = r + jitter();
            pixels[p++] = g + jitter();
            pixels[p++] = b + jitter();
            pixels[p++] = 255;
        }
    }
    for (let i = 0; i < 1500; i++) {
        pixels[p++] = 250;
        pixels[p++] = 204;
        pixels[p++] = 21;
        pixels[p++] = 100;
    }
    return pixels;
}

function assertWithinOneStep(actual: string, expected: string): void {
    const a = parseHex(actual)!;
    const e = parseHex(expected)!;
    for (const channel of ["r", "g", "b"] as const) {
        assert.ok(
            Math.abs(a[channel] - e[channel]) <= 1,
            `${actual} is more than one step from ${expected}`
        );
    }
}

test("k-means on a three-colour image returns those colours and shares", () => {
    const palette = extractPalette(syntheticImage(2), 3);
    assert.equal(palette.length, 3);
    palette.forEach((swatch, i) =>
        assertWithinOneStep(swatch.hex, SOURCE[i].hex)
    );
    assert.deepEqual(
        palette.map((s) => Math.round(s.share * 1000) / 1000),
        [0.5, 0.3, 0.2]
    );
});

test("a flat colour comes back exactly and transparent pixels are skipped", () => {
    const palette = extractPalette(syntheticImage(0), 3);
    assert.deepEqual(
        palette.map((s) => s.hex),
        SOURCE.map((s) => s.hex)
    );
    const points = histogram(syntheticImage(0));
    assert.equal(points.length, 3);
    assert.equal(
        points.reduce((sum, p) => sum + p.weight, 0),
        10000
    );
});

test("extraction is deterministic", () => {
    const image = syntheticImage(6);
    assert.deepEqual(extractPalette(image, 8), extractPalette(image, 8));
});

test("asking for more colours than the image has merges the near duplicates", () => {
    const palette = extractPalette(syntheticImage(2), 6);
    assert.equal(palette.length, 3);
    palette.forEach((swatch, i) =>
        assertWithinOneStep(swatch.hex, SOURCE[i].hex)
    );
});

test("k-means keeps every distinct point when there are no more than k", () => {
    const points = SOURCE.map((s) => ({
        lab: hexToOklab(s.hex)!,
        weight: s.count,
    }));
    assert.equal(kmeans(points, 5).length, 3);
    assert.equal(kmeans(points, 2).length, 2);
    assert.equal(
        kmeans(points, 2).reduce((sum, c) => sum + c.weight, 0),
        10000
    );
});

test("clusters closer than 0.02 merge with weighted means", () => {
    const merged = mergeClose([
        { lab: { L: 0.5, a: 0, b: 0 }, weight: 3 },
        { lab: { L: 0.51, a: 0, b: 0 }, weight: 1 },
        { lab: { L: 0.8, a: 0, b: 0 }, weight: 2 },
    ]);
    assert.equal(merged.length, 2);
    assert.ok(Math.abs(merged[0].lab.L - 0.5025) < 1e-9);
    assert.equal(merged[0].weight, 4);
    assert.equal(merged[1].weight, 2);
});

test("swatches sort by share, lightness and hue", () => {
    const swatches = swatchesFromColours([
        { hex: "#3b82f6", share: 0.2 },
        { hex: "#ef4444", share: 0.5 },
        { hex: "#f8fafc", share: 0.1 },
        { hex: "#10b981", share: 0.15 },
        { hex: "#171717", share: 0.05 },
    ]);
    assert.deepEqual(
        sortSwatches(swatches, "share").map((s) => s.hex),
        ["#ef4444", "#3b82f6", "#10b981", "#f8fafc", "#171717"]
    );
    assert.deepEqual(
        sortSwatches(swatches, "lightness").map((s) => s.hex),
        ["#f8fafc", "#10b981", "#ef4444", "#3b82f6", "#171717"]
    );
    assert.deepEqual(
        sortSwatches(swatches, "hue").map((s) => s.hex),
        ["#ef4444", "#10b981", "#3b82f6", "#f8fafc", "#171717"]
    );
});

test("roles pick vibrant, muted, dark vibrant and light muted colours", () => {
    const swatches = swatchesFromColours([
        { hex: "#ef4444", share: 0.3 },
        { hex: "#94a3b8", share: 0.2 },
        { hex: "#1e3a8a", share: 0.2 },
        { hex: "#f1f5f9", share: 0.3 },
    ]);
    const roles = pickRoles(swatches);
    assert.equal(roles.vibrant?.hex, "#ef4444");
    assert.equal(roles.muted?.hex, "#94a3b8");
    assert.equal(roles.darkVibrant?.hex, "#1e3a8a");
    assert.equal(roles.lightMuted?.hex, "#f1f5f9");
});

test("a role stays empty when no colour fits it", () => {
    const roles = pickRoles(
        swatchesFromColours([
            { hex: "#000000", share: 0.5 },
            { hex: "#ffffff", share: 0.5 },
        ])
    );
    assert.equal(roles.vibrant, null);
    assert.equal(roles.darkVibrant, null);
    assert.equal(roles.muted, null);
    assert.equal(roles.lightMuted?.hex, "#ffffff");
});
