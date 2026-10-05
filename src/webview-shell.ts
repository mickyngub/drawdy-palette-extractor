const CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    background: var(--drawdy-background, #ffffff);
    color: var(--drawdy-foreground, #111111);
    font-size: 12px;
    line-height: 1.4;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
}
button, input, select, textarea { font: inherit; color: inherit; }
button:focus-visible, textarea:focus-visible, input:focus-visible {
    outline: 2px solid var(--drawdy-primary, #4f46e5);
    outline-offset: 1px;
}

main {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}
section { display: flex; flex-direction: column; gap: 8px; }

.stage {
    position: relative;
    height: 120px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--drawdy-radius-md, 8px);
    border: 1px solid var(--drawdy-border, #e5e7eb);
    background: var(--drawdy-surface, #fafafa);
    overflow: hidden;
    cursor: pointer;
}
.stage.empty { border-style: dashed; }
.stage:focus-visible { outline: 2px solid var(--drawdy-primary, #4f46e5); outline-offset: 1px; }
.stage canvas { display: block; max-width: 100%; max-height: 100%; }
.stage.empty canvas { display: none; }
.stage.dragover::after {
    content: "";
    position: absolute;
    inset: 4px;
    border: 2px dashed var(--drawdy-primary, #4f46e5);
    border-radius: var(--drawdy-radius-md, 8px);
    pointer-events: none;
}
.hint {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 16px 24px;
    color: var(--drawdy-muted-foreground, #6b7280);
    font-size: 11px;
    pointer-events: none;
}
.hint[hidden] { display: none; }
.pick {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    color: #ffffff;
    font-size: 11px;
    opacity: 0;
    transition: opacity 120ms ease;
    pointer-events: none;
}
.stage:hover .pick, .stage:focus-visible .pick { opacity: 1; }
.stage.empty .pick { display: none; }

.row {
    display: flex;
    align-items: center;
    gap: 8px;
}
.row .grow { flex: 1; min-width: 0; }
.muted {
    color: var(--drawdy-muted-foreground, #6b7280);
    font-size: 11px;
}
.ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
}
.section-head h2 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
}
.section-head span {
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    color: var(--drawdy-muted-foreground, #6b7280);
}

.field { display: flex; flex-direction: column; gap: 3px; }
.field.dim { opacity: 0.45; }
.field-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
}
.field-head label {
    font-size: 10px;
    letter-spacing: 0.02em;
    color: var(--drawdy-muted-foreground, #6b7280);
}
.field-head .value { font-size: 10px; font-variant-numeric: tabular-nums; }
.field .note { font-size: 10px; color: var(--drawdy-muted-foreground, #6b7280); }
.field .note[hidden] { display: none; }
input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 14px;
    margin: 0;
    background: transparent;
    cursor: pointer;
}
input[type="range"]:disabled { cursor: default; }
input[type="range"]::-webkit-slider-runnable-track {
    height: 3px;
    border-radius: 999px;
    background: var(--drawdy-border, #e5e7eb);
}
input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 11px;
    height: 11px;
    margin-top: -4px;
    border-radius: 50%;
    background: var(--drawdy-primary, #4f46e5);
}
input[type="range"]::-moz-range-track {
    height: 3px;
    border-radius: 999px;
    background: var(--drawdy-border, #e5e7eb);
}
input[type="range"]::-moz-range-thumb {
    width: 11px;
    height: 11px;
    border: none;
    border-radius: 50%;
    background: var(--drawdy-primary, #4f46e5);
}

.seg { display: flex; flex-wrap: wrap; gap: 3px; }
.seg button {
    flex: 1 1 auto;
    min-width: 0;
    padding: 3px 6px;
    border: 1px solid var(--drawdy-border, #e5e7eb);
    background: transparent;
    color: var(--drawdy-muted-foreground, #6b7280);
    border-radius: var(--drawdy-radius-sm, 4px);
    cursor: pointer;
    font-size: 10px;
    white-space: nowrap;
}
.seg button:hover { color: var(--drawdy-foreground, #111111); }
.seg button.on {
    background: var(--drawdy-primary, #4f46e5);
    border-color: var(--drawdy-primary, #4f46e5);
    color: var(--drawdy-primary-foreground, #ffffff);
}

.empty-note {
    padding: 14px 12px;
    border-radius: var(--drawdy-radius-md, 8px);
    border: 1px dashed var(--drawdy-border, #e5e7eb);
    color: var(--drawdy-muted-foreground, #6b7280);
    font-size: 11px;
    text-align: center;
}

.swatches { display: flex; flex-direction: column; gap: 4px; }
.swatch {
    display: flex;
    align-items: stretch;
    gap: 10px;
    width: 100%;
    padding: 6px;
    border: 1px solid var(--drawdy-border, #e5e7eb);
    border-radius: var(--drawdy-radius-md, 8px);
    background: transparent;
    text-align: left;
    cursor: pointer;
}
.swatch:hover { border-color: var(--drawdy-muted-foreground, #6b7280); }
.chip {
    flex: none;
    width: 40px;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.25);
}
.swatch-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.swatch-top { display: flex; align-items: baseline; gap: 6px; }
.hex { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; font-weight: 600; }
.name { flex: 1; min-width: 0; color: var(--drawdy-muted-foreground, #6b7280); font-size: 11px; }
.share { font-size: 10px; font-variant-numeric: tabular-nums; color: var(--drawdy-muted-foreground, #6b7280); }
.contrast { display: flex; gap: 4px; }
.pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 6px 1px 4px;
    border-radius: 999px;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.pill.on-light { background: #ffffff; color: #1f2937; box-shadow: inset 0 0 0 1px #e5e7eb; }
.pill.on-dark { background: #111827; color: #f9fafb; }
.pill .aa { font-weight: 700; font-size: 11px; }
.pill .lvl { font-weight: 600; }
.on-light .lvl.pass { color: #15803d; }
.on-light .lvl.large { color: #b45309; }
.on-light .lvl.fail { color: #b91c1c; }
.on-dark .lvl.pass { color: #4ade80; }
.on-dark .lvl.large { color: #fbbf24; }
.on-dark .lvl.fail { color: #f87171; }

.roles { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.role {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 5px 6px;
    border: 1px solid var(--drawdy-border, #e5e7eb);
    border-radius: var(--drawdy-radius-md, 8px);
    background: transparent;
    text-align: left;
    cursor: pointer;
}
button.role:hover { border-color: var(--drawdy-muted-foreground, #6b7280); }
.role.none { cursor: default; border-style: dashed; }
.role .chip { width: 22px; height: 22px; border-radius: 5px; }
.role.none .chip { box-shadow: inset 0 0 0 1px var(--drawdy-border, #e5e7eb); background: transparent; }
.role-body { min-width: 0; display: flex; flex-direction: column; }
.role-name { font-size: 10px; color: var(--drawdy-muted-foreground, #6b7280); }

textarea.code {
    width: 100%;
    height: 112px;
    resize: none;
    padding: 6px 8px;
    border-radius: var(--drawdy-radius-sm, 4px);
    border: 1px solid var(--drawdy-border, #e5e7eb);
    background: var(--drawdy-surface, #fafafa);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    line-height: 1.45;
    white-space: pre;
}
.clip {
    position: fixed;
    left: -9999px;
    top: 0;
    width: 10px;
    height: 10px;
    opacity: 0;
}

footer {
    flex: none;
    border-top: 1px solid var(--drawdy-border, #e5e7eb);
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--drawdy-surface, transparent);
}
.status {
    min-height: 15px;
    font-size: 10px;
    color: var(--drawdy-muted-foreground, #6b7280);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.status.bad { color: var(--drawdy-destructive, #dc2626); }
.status.good { color: var(--drawdy-success, #16a34a); }
.actions { display: flex; justify-content: flex-end; gap: 6px; }
.btn {
    flex: none;
    padding: 5px 11px;
    border-radius: var(--drawdy-radius-sm, 4px);
    border: 1px solid var(--drawdy-border, #e5e7eb);
    background: transparent;
    cursor: pointer;
    font-size: 11px;
    white-space: nowrap;
}
.btn[hidden] { display: none; }
.btn:hover:not(:disabled) { border-color: var(--drawdy-foreground, #111111); }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn.primary {
    background: var(--drawdy-primary, #4f46e5);
    border-color: var(--drawdy-primary, #4f46e5);
    color: var(--drawdy-primary-foreground, #ffffff);
}
.btn.small { padding: 3px 9px; font-size: 10px; }
`;

const BODY = `
<main>
    <section aria-label="Source">
        <div class="stage empty" id="stage" role="button" tabindex="0" aria-label="Upload an image">
            <canvas id="canvas"></canvas>
            <div class="hint" id="hint"><span id="hint-text"></span></div>
            <div class="pick"><span>Click to change image</span></div>
        </div>
        <div class="row">
            <span class="muted grow ellipsis" id="selection-text"></span>
            <button class="btn small" id="use-selection" type="button">Use current selection</button>
        </div>
        <input type="file" id="upload-input" accept="image/*" hidden />
    </section>
    <section id="controls" aria-label="Settings"></section>
    <section aria-labelledby="palette-title">
        <div class="section-head"><h2 id="palette-title">Palette</h2><span id="palette-count"></span></div>
        <div class="swatches" id="swatches"></div>
    </section>
    <section aria-labelledby="roles-title">
        <div class="section-head"><h2 id="roles-title">Roles</h2><span>Click a colour to copy it</span></div>
        <div class="roles" id="roles"></div>
    </section>
    <section aria-labelledby="export-title">
        <div class="section-head"><h2 id="export-title">Export</h2></div>
        <div class="seg" id="format"></div>
        <textarea class="code" id="export" readonly spellcheck="false" aria-labelledby="export-title"></textarea>
        <div class="actions"><button class="btn small" id="copy-export" type="button">Copy</button></div>
    </section>
</main>
<footer>
    <div class="status" id="status" role="status" aria-live="polite"></div>
    <div class="actions">
        <button class="btn" id="edit-selected" type="button" hidden>Edit selected</button>
        <button class="btn" id="stop-editing" type="button" hidden>Stop editing</button>
        <button class="btn primary" id="place" type="button" disabled>Place on board</button>
    </div>
</footer>
<textarea class="clip" id="clip" readonly tabindex="-1" aria-hidden="true"></textarea>
`;

export function shellHtml(js: string): string {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>:root{/*__DRAWDY_STYLING__*/}</style>
<style>${CSS}</style>
</head>
<body>
${BODY}
<script>${js}</script>
</body>
</html>`;
}
