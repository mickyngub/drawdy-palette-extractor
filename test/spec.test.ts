import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PARAMS, parseParams, parseSpec } from "../src/shared/spec";

test("params fall back to defaults and clamp the colour count", () => {
    assert.deepEqual(parseParams(undefined), DEFAULT_PARAMS);
    assert.deepEqual(
        parseParams({ k: 40, sort: "hue", layout: "bar", format: "tw4" }),
        { k: 12, sort: "hue", layout: "bar", format: "tw4" }
    );
    assert.deepEqual(parseParams({ k: 1.4, sort: "nope", format: 3 }), {
        ...DEFAULT_PARAMS,
        k: 3,
    });
});

test("a stored spec is read back and bad ones are refused", () => {
    assert.deepEqual(
        parseSpec({
            colours: [
                { hex: "#EF4444", share: 0.6 },
                { hex: "#10b981", share: 0.4 },
            ],
            layout: "bar",
            k: 6,
            sort: "lightness",
            source: { kind: "board", ids: ["a", "b"], images: true },
        }),
        {
            colours: [
                { hex: "#ef4444", share: 0.6 },
                { hex: "#10b981", share: 0.4 },
            ],
            layout: "bar",
            k: 6,
            sort: "lightness",
            source: { kind: "board", ids: ["a", "b"], images: true },
        }
    );
    assert.deepEqual(parseSpec({ colours: [{ hex: "#abcdef" }] }), {
        colours: [{ hex: "#abcdef", share: 0 }],
        layout: "squares",
        k: 3,
        sort: "share",
    });
    assert.equal(parseSpec(null), null);
    assert.equal(parseSpec({ colours: [] }), null);
    assert.equal(parseSpec({ colours: [{ hex: "red", share: 1 }] }), null);
    assert.equal(
        parseSpec({
            colours: [{ hex: "#abcdef", share: 1 }],
            source: { kind: "board", ids: [] },
        })?.source,
        undefined
    );
});
