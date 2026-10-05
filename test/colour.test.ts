import assert from "node:assert/strict";
import { test } from "node:test";
import {
    contrastRatio,
    formatRatio,
    hexToOklab,
    labelColour,
    oklabToHex,
    parseHex,
    toHex,
    wcagLevel,
} from "../src/shared/colour";
import {
    CSS_NAME_COUNT,
    cssKeyword,
    nearestCssName,
} from "../src/shared/css-names";

test("hex parses in short and long form and formats back in lower case", () => {
    assert.deepEqual(parseHex("#EF4444"), { r: 239, g: 68, b: 68 });
    assert.deepEqual(parseHex("fff"), { r: 255, g: 255, b: 255 });
    assert.equal(parseHex("#12345"), null);
    assert.equal(parseHex("tomato"), null);
    assert.equal(toHex({ r: 239.4, g: 68.6, b: -3 }), "#ef4500");
});

test("OKLab matches the reference values and round-trips every hex", () => {
    const white = hexToOklab("#ffffff")!;
    assert.ok(Math.abs(white.L - 1) < 1e-6);
    assert.ok(Math.abs(white.a) < 1e-6 && Math.abs(white.b) < 1e-6);
    const red = hexToOklab("#ff0000")!;
    assert.ok(Math.abs(red.L - 0.62796) < 1e-4);
    assert.ok(Math.abs(red.a - 0.22486) < 1e-4);
    assert.ok(Math.abs(red.b - 0.12585) < 1e-4);
    for (let n = 0; n < 0x1000000; n += 0x010203 * 7) {
        const hex = `#${n.toString(16).padStart(6, "0")}`;
        assert.equal(oklabToHex(hexToOklab(hex)!), hex);
    }
});

test("contrast of black and white is 21 and the levels follow WCAG", () => {
    assert.equal(contrastRatio(parseHex("#000")!, parseHex("#fff")!), 21);
    assert.equal(contrastRatio(parseHex("#777")!, parseHex("#777")!), 1);
    const grey = contrastRatio(parseHex("#767676")!, parseHex("#ffffff")!);
    assert.equal(formatRatio(grey), "4.5");
    assert.equal(wcagLevel(grey), "AA");
    assert.equal(formatRatio(4.4999), "4.4");
    assert.equal(formatRatio(21), "21.0");
    assert.equal(wcagLevel(7), "AAA");
    assert.equal(wcagLevel(3.2), "AA large");
    assert.equal(wcagLevel(2.9), "Fail");
});

test("the swatch label takes whichever of #1f2937 and #ffffff contrasts more", () => {
    assert.equal(labelColour("#fde047"), "#1f2937");
    assert.equal(labelColour("#f1f5f9"), "#1f2937");
    assert.equal(labelColour("#1e3a8a"), "#ffffff");
    assert.equal(labelColour("#111827"), "#ffffff");
});

test("the 148 CSS names are shipped and the nearest one is found", () => {
    assert.equal(CSS_NAME_COUNT, 148);
    assert.deepEqual(nearestCssName("#FF6347"), {
        name: "tomato",
        keyword: "tomato",
        hex: "#ff6347",
        exact: true,
    });
    assert.equal(nearestCssName("#fe6449").name, "tomato");
    assert.equal(nearestCssName("#fe6449").exact, false);
    assert.equal(nearestCssName("#808080").name, "gray");
    assert.equal(nearestCssName("#00ffff").name, "aqua");
    assert.equal(nearestCssName("#ef4444").name, "orange red");
    assert.equal(nearestCssName("#3b82f6").name, "dodger blue");
    assert.equal(nearestCssName("#fafad2").keyword, "lightgoldenrodyellow");
    assert.equal(cssKeyword("medium spring green"), "mediumspringgreen");
});
