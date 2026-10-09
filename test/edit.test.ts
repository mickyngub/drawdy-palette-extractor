import assert from "node:assert/strict";
import { test } from "node:test";
import { placedStatus, sameSource } from "../webview/lib/edit";

test("the same upload or the same board selection is not a new source", () => {
    assert.equal(
        sameSource({ kind: "upload", key: "a" }, { kind: "upload", key: "a" }),
        true
    );
    assert.equal(
        sameSource({ kind: "upload", key: "a" }, { kind: "upload", key: "b" }),
        false
    );
    assert.equal(
        sameSource(
            { kind: "board", ids: ["x", "y"], images: true },
            { kind: "board", ids: ["y", "x"], images: true }
        ),
        true
    );
    assert.equal(
        sameSource(
            { kind: "board", ids: ["x"], images: true },
            { kind: "board", ids: ["x", "y"], images: true }
        ),
        false
    );
    assert.equal(
        sameSource(
            { kind: "upload", key: "x" },
            { kind: "board", ids: ["x"], images: true }
        ),
        false
    );
    assert.equal(sameSource(undefined, { kind: "upload", key: "a" }), false);
});

test("the status says how many undo steps bring the old palette back", () => {
    assert.equal(
        placedStatus({ updated: false, rotationReset: false, undoSteps: 1 }),
        "Placed the palette. Press ⌘Z or Ctrl+Z to undo."
    );
    assert.equal(
        placedStatus({ updated: true, rotationReset: false, undoSteps: 2 }),
        "Updated the palette. Press ⌘Z or Ctrl+Z twice to get the old version back."
    );
    assert.equal(
        placedStatus({ updated: true, rotationReset: true, undoSteps: 3 }),
        "Updated the palette (rotation reset). Press ⌘Z or Ctrl+Z three times to get the old version back."
    );
    assert.equal(
        placedStatus({ updated: true, rotationReset: false, undoSteps: 1 }),
        "Updated the palette. Press ⌘Z or Ctrl+Z to undo."
    );
});
