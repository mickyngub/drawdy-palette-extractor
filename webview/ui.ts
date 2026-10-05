export function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    parent?: HTMLElement
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (parent) parent.appendChild(node);
    return node;
}

export type SliderSpec = {
    id: string;
    label: string;
    min: number;
    max: number;
    step: number;
};

export type SliderControl = {
    set(value: number): void;
    setDisabled(disabled: boolean): void;
};

export function makeSlider(
    parent: HTMLElement,
    spec: SliderSpec,
    initial: number,
    onInput: (value: number) => void
): SliderControl {
    const wrap = el("div", "field", parent);
    const head = el("div", "field-head", wrap);
    const label = el("label", undefined, head);
    label.textContent = spec.label;
    label.htmlFor = spec.id;
    const value = el("span", "value", head);
    const input = el("input", undefined, wrap);
    input.type = "range";
    input.id = spec.id;
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);

    const show = (v: number) => {
        value.textContent = String(v);
    };
    input.value = String(initial);
    show(initial);

    input.addEventListener("input", () => {
        const v = Number(input.value);
        show(v);
        onInput(v);
    });

    return {
        set(v) {
            input.value = String(v);
            show(v);
        },
        setDisabled(disabled) {
            input.disabled = disabled;
            wrap.classList.toggle("dim", disabled);
        },
    };
}

export function fillSegmented<T extends string | number>(
    row: HTMLElement,
    options: [T, string][],
    initial: T,
    onPick: (value: T) => void
): (value: T) => void {
    const buttons = options.map(([value, text]) => {
        const button = el("button", undefined, row);
        button.type = "button";
        button.textContent = text;
        button.addEventListener("click", () => {
            paint(value);
            onPick(value);
        });
        return { value, button };
    });

    const paint = (current: T) => {
        for (const entry of buttons) {
            const on = entry.value === current;
            entry.button.classList.toggle("on", on);
            entry.button.setAttribute("aria-pressed", String(on));
        }
    };
    paint(initial);
    return paint;
}

export function makeSegmented<T extends string | number>(
    parent: HTMLElement,
    label: string,
    options: [T, string][],
    initial: T,
    onPick: (value: T) => void
): (value: T) => void {
    const wrap = el("div", "field", parent);
    const head = el("div", "field-head", wrap);
    const text = el("label", undefined, head);
    text.textContent = label;
    const row = el("div", "seg", wrap);
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", label);
    return fillSegmented(row, options, initial, onPick);
}
