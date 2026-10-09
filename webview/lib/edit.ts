import type { SourceRef } from "../../src/shared/spec";

export function sameSource(
    a: SourceRef | undefined,
    b: SourceRef | undefined
): boolean {
    if (!a || !b) return false;
    if (a.kind === "upload" || b.kind === "upload") {
        return a.kind === "upload" && b.kind === "upload" && a.key === b.key;
    }
    return (
        a.ids.length === b.ids.length && a.ids.every((id) => b.ids.includes(id))
    );
}

export function placedStatus(placed: {
    updated: boolean;
    rotationReset: boolean;
    undoSteps: number;
}): string {
    if (!placed.updated) return "Placed the palette. Press ⌘Z or Ctrl+Z to undo.";
    const done = placed.rotationReset
        ? "Updated the palette (rotation reset)."
        : "Updated the palette.";
    if (placed.undoSteps <= 1) return `${done} Press ⌘Z or Ctrl+Z to undo.`;
    const times = placed.undoSteps === 2 ? "twice" : "three times";
    return `${done} Press ⌘Z or Ctrl+Z ${times} to get the old version back.`;
}
