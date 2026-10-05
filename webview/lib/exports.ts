import type { ExportFormat } from "../../src/shared/spec";

export type ExportColour = { hex: string; share: number; keyword: string };

export const FORMAT_LABELS: [ExportFormat, string][] = [
    ["hex", "HEX"],
    ["css", "CSS"],
    ["tw3", "Tailwind 3"],
    ["tw4", "Tailwind 4"],
    ["json", "JSON"],
];

export function formatExport(
    format: ExportFormat,
    colours: ExportColour[]
): string {
    const hex = colours.map((c) => c.hex.toLowerCase());
    switch (format) {
        case "hex":
            return hex.join("\n");
        case "css":
            return [
                ":root {",
                ...hex.map((h, i) => `  --palette-${i + 1}: ${h};`),
                "}",
            ].join("\n");
        case "tw3":
            return [
                "colors: {",
                "  palette: {",
                ...hex.map((h, i) => `    ${i + 1}: "${h}",`),
                "  },",
                "}",
            ].join("\n");
        case "tw4":
            return [
                "@theme {",
                ...hex.map((h, i) => `  --color-palette-${i + 1}: ${h};`),
                "}",
            ].join("\n");
        case "json":
            return JSON.stringify(
                colours.map((c, i) => ({
                    hex: hex[i],
                    name: c.keyword,
                    share: Math.round(c.share * 1000) / 1000,
                })),
                null,
                2
            );
    }
}
