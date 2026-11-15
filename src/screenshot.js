export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function detectImage(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) return null;
  if (bytes.subarray(0, 8).equals(PNG)) return { contentType: "image/png", extension: "png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  const head = bytes.subarray(0, 6).toString("ascii");
  if (head === "GIF87a" || head === "GIF89a") return { contentType: "image/gif", extension: "gif" };
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return { contentType: "image/webp", extension: "webp" };
  }
  return null;
}

export function imageBytes(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") {
    if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
    try {
      const parsed = JSON.parse(value);
      if (parsed && parsed.type === "Buffer" && Array.isArray(parsed.data)) {
        return Buffer.from(parsed.data);
      }
    } catch {
      // Not a JSON buffer dump.
    }
    return Buffer.from(value, "latin1");
  }
  if (value && value.type === "Buffer" && Array.isArray(value.data)) {
    return Buffer.from(value.data);
  }
  return null;
}

export function screenshotFilename(originalName, extension) {
  const base = String(originalName || "screenshot")
    .replace(/[/\\]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const stem = base.replace(/\.[A-Za-z0-9]+$/, "").replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "") || "screenshot";
  return `${stem}.${extension}`;
}

export function inspectScreenshot(file) {
  const bytes = file?.buffer;
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    return { ok: false, error: "Upload a screenshot, or paste a public image link." };
  }
  if (bytes.length > MAX_SCREENSHOT_BYTES) {
    return { ok: false, error: "That screenshot is larger than 5 MB." };
  }
  const detected = detectImage(bytes);
  if (!detected) {
    return { ok: false, error: "Upload a PNG, JPEG, WebP, or GIF." };
  }
  return {
    ok: true,
    bytes,
    contentType: detected.contentType,
    filename: screenshotFilename(file.originalname, detected.extension),
  };
}
