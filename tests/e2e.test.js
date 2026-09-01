import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This exercises the actual fork's own rewritten flow: a "PC" tab creates a
// room and renders a QR code that encodes `send.html?room_id=<id>`; a real
// phone scans that with its camera. Playwright can't drive a camera, so the
// test does what a real scan produces — navigating a second real browser tab
// straight to that URL — then lets the real signaling server and a real
// WebRTC data channel between two real Chromium instances do the rest.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(rootDir, "tests", "fixtures");
const PORT = 3399;
const baseUrl = `http://localhost:${PORT}`;

let serverProcess;
let browser;
let context;

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      fetch(url)
        .then(() => resolve())
        .catch((err) => {
          if (Date.now() > deadline) reject(err);
          else setTimeout(attempt, 200);
        });
    };
    attempt();
  });
}

before(async () => {
  serverProcess = spawn("node", ["server/index.js"], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(PORT) },
    stdio: "pipe",
  });
  await waitForServer(baseUrl, 15000);

  browser = await chromium.launch();
  context = await browser.newContext();
});

after(async () => {
  await context.close();
  await browser.close();
  serverProcess.kill();
});

async function openPairedPages() {
  const pc = await context.newPage();
  await pc.goto(baseUrl, { waitUntil: "networkidle" });
  const roomId = await pc.waitForFunction(() => localStorage.getItem("qrdrop_room_id")).then((h) => h.jsonValue());

  const phone = await context.newPage();
  await phone.goto(`${baseUrl}/send.html?room_id=${roomId}`);
  await phone.waitForFunction(() => !document.getElementById("btn-files").disabled, undefined, {
    timeout: 20000,
  });

  return { pc, phone };
}

test("sends a real file from phone to PC over an actual WebRTC data channel", async () => {
  const { pc, phone } = await openPairedPages();

  const fixturePath = path.join(fixturesDir, "sample.bin");
  await phone.setInputFiles("#input-files", fixturePath);

  await pc.waitForSelector(".file-row .dl", { timeout: 20000 });

  const [download] = await Promise.all([pc.waitForEvent("download"), pc.click(".file-row .dl")]);
  const downloadedPath = await download.path();

  const original = readFileSync(fixturePath);
  const received = readFileSync(downloadedPath);

  assert.equal(received.length, original.length, "received file size matches the original");
  assert.equal(
    createHash("sha256").update(received).digest("hex"),
    createHash("sha256").update(original).digest("hex"),
    "received file is byte-identical to the original (real transfer, not a stub)"
  );

  await pc.close();
  await phone.close();
});

test("sends a real text message from phone to PC", async () => {
  const { pc, phone } = await openPairedPages();

  const message = `hola desde el telefono ${Date.now()}`;

  await phone.click("#btn-text");
  await phone.fill("#text-input", message);
  await phone.click("#text-send-btn");

  await pc.waitForSelector("#text-log .file-row .meta", { timeout: 20000 });
  const received = await pc.textContent("#text-log .file-row .meta");

  assert.equal(received, message);

  await pc.close();
  await phone.close();
});

test("the PC's room persists across a reload, so an already-scanned QR keeps working", async () => {
  const pc = await context.newPage();
  await pc.goto(baseUrl, { waitUntil: "networkidle" });
  const roomId1 = await pc.waitForFunction(() => localStorage.getItem("qrdrop_room_id")).then((h) => h.jsonValue());

  await pc.reload({ waitUntil: "networkidle" });
  await pc.waitForFunction(
    (previous) => localStorage.getItem("qrdrop_room_id") === previous,
    roomId1,
    { timeout: 5000 }
  );
  const roomId2 = await pc.evaluate(() => localStorage.getItem("qrdrop_room_id"));

  assert.equal(roomId2, roomId1, "the room id must survive a reload or the already-displayed QR breaks");

  await pc.close();
});

test("a fresh visit without a room_id shows the invalid-link screen instead of a broken UI", async () => {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/send.html`);
  await page.waitForSelector("#invalid-screen", { state: "visible", timeout: 5000 });
  const chooseVisible = await page.isVisible("#choose-screen");
  assert.equal(chooseVisible, false);
  await page.close();
});
