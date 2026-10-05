export type Decoded = {
    image: CanvasImageSource;
    width: number;
    height: number;
    release(): void;
};

// SVG images have no intrinsic size when they only set a viewBox.
const FALLBACK_SIZE = 512;

function readAsDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

async function decodeWithImg(url: string): Promise<Decoded> {
    const img = new Image();
    img.src = url;
    await img.decode();
    return {
        image: img,
        width: img.naturalWidth || FALLBACK_SIZE,
        height: img.naturalHeight || FALLBACK_SIZE,
        release() {},
    };
}

export async function decodeImage(
    input: Blob | string
): Promise<Decoded | null> {
    try {
        if (typeof input === "string") return await decodeWithImg(input);
        try {
            const bitmap = await createImageBitmap(input);
            return {
                image: bitmap,
                width: bitmap.width,
                height: bitmap.height,
                release: () => bitmap.close(),
            };
        } catch {
            // createImageBitmap refuses SVG blobs; an <img> decodes them.
            return await decodeWithImg(await readAsDataUrl(input));
        }
    } catch {
        return null;
    }
}

export function fitWithin(
    width: number,
    height: number,
    budget: number
): { width: number; height: number } {
    const scale = Math.min(1, Math.sqrt(budget / (width * height)));
    return {
        width: Math.max(1, Math.floor(width * scale)),
        height: Math.max(1, Math.floor(height * scale)),
    };
}

export function toPixels(decoded: Decoded, budget: number): Uint8ClampedArray {
    const size = fitWithin(decoded.width, decoded.height, budget);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return new Uint8ClampedArray(0);
    context.imageSmoothingQuality = "high";
    context.drawImage(decoded.image, 0, 0, size.width, size.height);
    return context.getImageData(0, 0, size.width, size.height).data;
}

export function concatPixels(parts: Uint8ClampedArray[]): Uint8ClampedArray {
    const total = parts.reduce((sum, p) => sum + p.length, 0);
    const out = new Uint8ClampedArray(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

export function fingerprint(bytes: ArrayLike<number>): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
        hash ^= bytes[i];
        hash = Math.imul(hash, 0x01000193);
    }
    return `${bytes.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

const PREVIEW_HEIGHT = 240;
const PREVIEW_GAP = 12;
const PREVIEW_MAX = 4;

export function drawPreview(
    canvas: HTMLCanvasElement,
    images: Decoded[]
): void {
    const shown = images.slice(0, PREVIEW_MAX);
    const widths = shown.map((d) => (d.width / d.height) * PREVIEW_HEIGHT);
    const total =
        widths.reduce((sum, w) => sum + w, 0) +
        PREVIEW_GAP * (shown.length - 1);
    canvas.width = Math.max(1, Math.round(total));
    canvas.height = PREVIEW_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    let x = 0;
    shown.forEach((d, i) => {
        context.drawImage(d.image, x, 0, widths[i], PREVIEW_HEIGHT);
        x += widths[i] + PREVIEW_GAP;
    });
}
