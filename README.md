# Palette Extractor

Pull the main colours out of any image, or out of anything already on your board. Check how readable each one is, copy the palette as code, and place a labelled swatch row on your Drawdy board.

![Palette Extractor reads the six main colours of an image selected on the board and places a labelled swatch row under it.](https://raw.githubusercontent.com/mickyngub/drawdy-palette-extractor/main/docs/media/palette-extractor.gif)

## What it's for

- **Moodboards and brand work**: get the palette of a photo, a logo or a screenshot in one click.
- **Accessible design**: see each colour's contrast against white and dark text, with the WCAG level it passes.
- **Handing off to developers**: copy the palette as HEX, CSS, Tailwind 3, Tailwind 4 or JSON.
- **Documenting a style**: swatches with hex values and colour names, right next to your designs.

## How to use

1. Click the **Palette Extractor** button on the right of the board.
2. Pick an image file, or drop or paste one into the panel. Or select something on the board and click **Use current selection**.
3. Choose how many colours you want (3 to 12), how to sort them (by share, lightness or hue) and the swatch layout (equal squares, or a bar where each colour's width shows its share).
4. Click any colour to copy its hex, or copy the whole palette under **Export**.
5. Click **Place on board**. Each colour becomes a rounded swatch with its hex and name.
6. To change a placed palette, select it and click **Edit selected**, then **Update on board**.

## What each colour shows

- Its hex, its share of the image and the nearest CSS colour name.
- Its contrast against white and against a dark background, rated AAA, AA, AA large (large text only) or Fail.
- **Roles**: a Vibrant, Muted, Dark vibrant and Light muted pick, the way Android's Palette does.

## Tips

- Selections made of shapes work too: the panel reads a picture of that area, so anything else overlapping it counts as well.
- Images on the board are read as you see them, crop and rotation included.
- A palette taken from the board lands just under what it came from, at the same width.
- Swatches keep their exact colours in light and dark mode.
- Changing the number of colours on a placed palette needs its source image: still on the board, or uploaded again.

## Privacy

- Nothing loads from the network. Your image stays in the panel; only the finished swatches go onto the board.
- Your colour count, sort, layout and export format are saved for next time.

## Credits and licence

- The extension's code is [MIT](https://github.com/mickyngub/drawdy-palette-extractor/blob/main/LICENSE). Building it yourself? See [DEVELOPMENT.md](https://github.com/mickyngub/drawdy-palette-extractor/blob/main/DEVELOPMENT.md).
