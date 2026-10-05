# Palette Extractor

Pull the main colours out of an image or a board selection, check their names and contrast, and place a swatch row on your Drawdy board.

## How to use

1. Click the Palette Extractor button (a striped tile with a white dropper) on the right of the board.
2. Give it an image:
   - Click the dashed box and pick an image file, or drop or paste one into the panel.
   - Or select something on the board and click **Use current selection**. Selected images are read from their original files; with several selected, their pixels are pooled. Any other selection, such as a design made of shapes, is read as a picture of that area.
3. Shape the palette:
   - **Colours**: how many colours to pull out, from 3 to 12. Colours that come out almost the same are merged, so you may get fewer.
   - **Sort**: by share of the image, by lightness (light to dark) or by hue.
   - **Layout on the board**: Equal squares, or a Share bar where each colour's width follows its share.
4. Read the palette. Each colour shows its hex, its share, the nearest CSS colour name, and its contrast against white and against a dark background (#111827) with the WCAG level it reaches: AAA, AA, AA large (large text only) or Fail. **Roles** picks a Vibrant, Muted, Dark vibrant and Light muted colour, the way Android's Palette does. Click any colour to copy its hex.
5. Under **Export**, pick HEX, CSS, Tailwind 3, Tailwind 4 or JSON and click **Copy**.
6. Click **Place on board**. Each colour becomes a rounded swatch with its hex inside and its name underneath, grouped together. When the palette came from a board image, the row lands 24 units under the image at the image's width. Otherwise it lands in the middle of your view, 480 units wide. The board then moves to it.
7. To change a placed palette, select it and click **Edit selected**. Switch the layout, the sort or the number of colours, then click **Update on board**. The new row replaces the old one at the same spot and width. **Stop editing** goes back to placing new palettes. Press Escape to close the panel.

Your colour count, sort, layout and export format are remembered for next time.

## Good to know

- The panel loads nothing from the network. Your image stays in the panel; only the finished swatches go onto the board.
- Settings are saved with Drawdy's extension storage (`kv-storage`) a moment after you change them.
- Each placed palette keeps its colours and settings on its first swatch, so Edit selected works after a reload. To change the number of colours, the panel needs the source image: a board source is read again if it is still on the board, and an uploaded image must still be loaded in the panel or be uploaded again.
- Images are scaled down to at most 160,000 pixels before the colours are counted. Pixels that are more than half transparent are skipped.
- Reading a selection that is not only images takes a picture of the area it covers, so anything else overlapping that area is counted too.
- On a narrow swatch, a hex or name that would be smaller than 8 units is left off. The panel always lists every colour.
- A row placed under a small image is at least 240 units wide.
- Swatch colours are exact hex values, so they look the same in light and dark mode. The names use your text tool's colour.
- Update on board is two steps in the board's history: undo once removes the new row, undo again brings the old one back.

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
