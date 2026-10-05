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
    | { type: "close" };

export type DriverToWebview =
    | {
          type: "init";
          params?: Record<string, unknown>;
          selection: SelectionInfo;
      }
    | { type: "selection"; selection: SelectionInfo }
    | {
          type: "source";
          images: (Blob | string)[];
          ref: BoardSource;
          label: string;
          forEdit: boolean;
      }
    | { type: "edit"; spec: PaletteSpec }
    | { type: "placed"; updated: boolean }
    | { type: "error"; message: string };
