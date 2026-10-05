import assert from "node:assert/strict";
import { test } from "node:test";
import { formatExport, type ExportColour } from "../webview/lib/exports";

const COLOURS: ExportColour[] = [
    { hex: "#EF4444", share: 0.5004, keyword: "tomato" },
    { hex: "#10b981", share: 0.3, keyword: "lightseagreen" },
];

test("HEX list", () => {
    assert.equal(formatExport("hex", COLOURS), "#ef4444\n#10b981");
});

test("CSS custom properties", () => {
    assert.equal(
        formatExport("css", COLOURS),
        ":root {\n  --palette-1: #ef4444;\n  --palette-2: #10b981;\n}"
    );
});

test("Tailwind 3 colors object", () => {
    assert.equal(
        formatExport("tw3", COLOURS),
        'colors: {\n  palette: {\n    1: "#ef4444",\n    2: "#10b981",\n  },\n}'
    );
});

test("Tailwind 4 theme block", () => {
    assert.equal(
        formatExport("tw4", COLOURS),
        "@theme {\n  --color-palette-1: #ef4444;\n  --color-palette-2: #10b981;\n}"
    );
});

test("JSON", () => {
    const text = formatExport("json", COLOURS);
    assert.equal(
        text,
        '[\n  {\n    "hex": "#ef4444",\n    "name": "tomato",\n    "share": 0.5\n  },\n  {\n    "hex": "#10b981",\n    "name": "lightseagreen",\n    "share": 0.3\n  }\n]'
    );
    assert.deepEqual(JSON.parse(text)[1], {
        hex: "#10b981",
        name: "lightseagreen",
        share: 0.3,
    });
});
