import type { PaletteSpec, SourceRef } from "./spec";

export type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type SelectionInfo = {
    count: number;
    images: number;
    editable: boolean;
};

export type BoardSource = Extract<SourceRef, { kind: "board" }>;

export type WebviewToDriver =
    | { type: "ready" }
    | { type: "params"; params: Record<string, unknown> }
    | { type: "read-selection" }
    | { type: "edit-selected" }
    | { type: "stop-editing" }
    | { type: "place"; spec: PaletteSpec }
    | { type: "update"; spec: PaletteSpec }
    | { type: "history"; action: "undo" | "redo" }
    | { type: "close" };

export type DriverToWebview =
    | {
          type: "init";
          params?: Record<string, unknown>;
          selection: SelectionInfo;
      }
    | { type: "theme"; css: string }
    | { type: "selection"; selection: SelectionInfo }
    | {
          type: "source";
          images: (Blob | string)[];
          ref: BoardSource;
          label: string;
          forEdit: boolean;
          note: string | null;
      }
    | { type: "edit"; spec: PaletteSpec }
    | {
          type: "placed";
          updated: boolean;
          rotationReset: boolean;
          undoSteps: number;
      }
    | { type: "error"; message: string };
