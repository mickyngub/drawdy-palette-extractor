# Palette Extractor

Pull the main colours out of an image or a board selection, check their names and contrast, and place a swatch row on your Drawdy board.

## How to use

1. Click the Palette Extractor button (a striped tile with a white dropper) on the right of the board.
2. Give it an image:
   - Click the dashed box and pick an image file, or drop or paste one into the panel.
   - Or select something on the board and click **Use current selection**. Selected images are read as you see them on the board, crop and rotation included; with several selected, their pixels are pooled. Any other selection, such as a design made of shapes, is read as a picture of that area.
3. Shape the palette:
   - **Colours**: how many colours to pull out, from 3 to 12. Colours that come out almost the same are merged, so you may get fewer.
   - **Sort**: by share of the image, by lightness (light to dark) or by hue.
   - **Layout on the board**: Equal squares, or a Share bar where each colour's width follows its share.
4. Read the palette. Each colour shows its hex, its share, the nearest CSS colour name, and its contrast against white and against a dark background (#111827) with the WCAG level it reaches: AAA, AA, AA large (large text only) or Fail. **Roles** picks a Vibrant, Muted, Dark vibrant and Light muted colour, the way Android's Palette does. Click any colour to copy its hex.
5. Under **Export**, pick HEX, CSS, Tailwind 3, Tailwind 4 or JSON and click **Copy**.
6. Click **Place on board**. Each colour becomes a rounded swatch with its hex inside and its name underneath, grouped together. When the palette came from the board, the row lands 40 units under what it was read from, at its width. An upload lands in the middle of the part of your view the panel does not cover, 480 units wide. If something is already there, the row moves right, then down, to the first free spot. The row is selected, and the board only moves if it is out of view, keeping your zoom. The panel says **Placed the palette. Press ⌘Z or Ctrl+Z to undo.**
7. To change a placed palette, select it and click **Edit selected**. A banner says **Editing a palette from the board.** Switch the layout, the sort or the number of colours, then click **Update on board**. The new row replaces the old one at the same spot and width, keeping its group, frame, layer, opacity and lock; a rotation cannot be kept, and the panel says **(rotation reset)**. **Place as new** places a separate copy and ends editing, and so does loading a different image. **Stop editing** goes back to placing new palettes.
8. ⌘Z and ⇧⌘Z (or Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y) work from the panel too, outside text fields. Press Escape to close the panel; in a field, Escape leaves the field first.

Your colour count, sort, layout and export format are remembered for next time. The panel follows the board's light or dark theme as you switch it.

## Good to know

- The panel loads nothing from the network. Your image stays in the panel; only the finished swatches go onto the board.
- Settings are saved with Drawdy's extension storage (`kv-storage`) a moment after you change them. Palette Extractor asks for storage and board access the first time you open it, not when the page loads.
- A crop is spotted when an image's shape on the board differs from its file by more than 1%. Then the panel reads a picture of the board at screen resolution, so anything drawn over the image comes along. A crop that keeps the image's aspect ratio, and a flip, are not detected yet. If the picture fails, the panel says **Using the full original image.**
- Each placed palette keeps its colours, settings and the ids of all its parts on its first swatch, so Edit selected works after a reload, whichever part you select. To change the number of colours, the panel needs the source image: a board source is read again if it is still on the board, and an uploaded image must still be loaded in the panel or be uploaded again.
- Images are scaled down to at most 160,000 pixels before the colours are counted. Pixels that are more than half transparent are skipped.
- Reading a selection that is not only images takes a picture of the area it covers, so anything else overlapping that area is counted too.
- On a narrow swatch, a hex or name that would be smaller than 8 units is left off. The panel always lists every colour.
- A row placed under a small image is at least 240 units wide.
- Swatch colours are exact hex values, so they look the same in light and dark mode. A swatch close to the board's colour gets a thin grey edge so it does not disappear. The names use your text tool's colour.
- Update on board is two steps in the board's history: undo once removes the new row, undo again brings the old one back. The panel says **Press ⌘Z or Ctrl+Z twice to get the old version back.** (three times for a locked palette, which is locked again after the update). If the board refuses the new row, the old one comes back by itself.
- A board holds at most 10,000 elements. If the palette would go over, the panel says so and nothing is added.

## Licence

This extension's code is [MIT](LICENSE).

## Development

```bash
npm install
npm test
npm run typecheck
npm run dev          # dev server on :5194; in Drawdy run ⌘K → "Add extension dev server" on a local board
npm run build        # regenerates src/webview-html.ts and dist/*.drawdyx
npm run preflight    # before submitting: committed, built, pushed, under Drawdy's limits, above the live version
```

Drawdy builds published versions from this repository's `src/index.ts`, so commit `src/webview-html.ts` after `npm run build`. Bump `driverVersion` in `manifest.json` for every release and add it to `CHANGELOG.md`. `npm test` holds the manifest and listing files to Drawdy's submission rules (a description of at most 500 characters, an icon of at most 256 KB, only `@drawdy/driver-protocol` imported from outside the repository).
