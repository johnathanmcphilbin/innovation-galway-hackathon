import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const HASHED_FILES = ["public/styles.css", "public/form.js"];

function computeAssetVersion() {
  const hash = createHash("sha256");
  for (const file of HASHED_FILES) {
    hash.update(readFileSync(path.join(root, file)));
  }
  return hash.digest("hex").slice(0, 12);
}

export const ASSET_VERSION = computeAssetVersion();

export function asset(urlPath) {
  const separator = urlPath.includes("?") ? "&" : "?";
  return `${urlPath}${separator}v=${ASSET_VERSION}`;
}
