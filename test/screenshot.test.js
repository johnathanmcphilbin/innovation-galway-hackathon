import assert from "node:assert/strict";
import test from "node:test";
import { detectImage, inspectScreenshot, MAX_SCREENSHOT_BYTES } from "../src/screenshot.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("recognises png, jpeg, gif, and webp by magic bytes", () => {
  assert.equal(detectImage(PNG).contentType, "image/png");
  const jpeg = Buffer.alloc(16, 0);
  jpeg[0] = 0xff;
  jpeg[1] = 0xd8;
  jpeg[2] = 0xff;
  assert.equal(detectImage(jpeg).contentType, "image/jpeg");
  const gif = Buffer.from("GIF89a" + "012345");
  assert.equal(detectImage(gif).contentType, "image/gif");
  const webp = Buffer.alloc(16, 0);
  webp.write("RIFF", 0);
  webp.write("WEBP", 8);
  assert.equal(detectImage(webp).contentType, "image/webp");
  assert.equal(detectImage(Buffer.from("<html></html>!!")), null);
});

test("rejects a screenshot that is empty, the wrong type, or over 5 MB", () => {
  assert.equal(inspectScreenshot({ buffer: Buffer.alloc(0), originalname: "a.png" }).ok, false);
  assert.match(inspectScreenshot({ buffer: Buffer.from("not-an-image!!"), originalname: "a.png" }).error, /PNG, JPEG/);
  const huge = Buffer.alloc(MAX_SCREENSHOT_BYTES + 1);
  PNG.copy(huge);
  const rejected = inspectScreenshot({ buffer: huge, originalname: "a.png" });
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /5 MB/);
});

test("keeps a safe filename and the detected type", () => {
  const shot = inspectScreenshot({ buffer: PNG, originalname: "../My Shot!.jpeg" });
  assert.equal(shot.ok, true);
  assert.equal(shot.contentType, "image/png");
  assert.equal(shot.filename, "My-Shot.png");
});
