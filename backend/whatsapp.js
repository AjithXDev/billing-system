/**
 * iVA Smart Billing — WhatsApp Auto-Messenger
 * Uses whatsapp-web.js to send messages directly from the
 * billing owner's own WhatsApp account to the customer.
 *
 * First run: A QR code window pops up. Scan it once with the
 *            owner's phone. Session is saved — future runs
 *            connect automatically.
 */

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const path = require("path");
const fs = require("fs");
const { app } = require("electron");

// Find system Chrome/Edge
function getChromePath() {
  const paths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ];
  for (let p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

let client = null;
let isReady = false;
let qrWindow = null;        // Electron BrowserWindow for QR display
let pendingMessages = [];   // queue while client is initialising

// ─── Initialise ──────────────────────────────────────────────
function initWhatsApp(mainWindow) {
  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: path.join(app.getPath("userData"), "whatsapp-session"),
    }),
    puppeteer: {
      headless: true,
      executablePath: getChromePath(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    },
  });

  // ── QR code: notify renderer so it can display it ──────────
  client.on("qr", (qr) => {
    console.log("[WhatsApp] Scan this QR code to link your phone:");
    qrcode.generate(qr, { small: true });

    // Send QR string to the main renderer window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("whatsapp-qr", qr);
    }
  });

  // ── Authentication confirmed ────────────────────────────────
  client.on("authenticated", () => {
    console.log("[WhatsApp] Authenticated ✅");
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("whatsapp-status", "authenticated");
    }
  });

  // ── Client is ready to send messages ───────────────────────
  client.on("ready", () => {
    console.log("[WhatsApp] Ready ✅ — messages will be sent automatically");
    isReady = true;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("whatsapp-status", "ready");
    }

    // Flush any messages that arrived before client was ready
    pendingMessages.forEach(({ phone, message }) => {
      _send(phone, message);
    });
    pendingMessages = [];
  });

  // ── Disconnected ────────────────────────────────────────────
  client.on("disconnected", (reason) => {
    console.warn("[WhatsApp] Disconnected:", reason);
    isReady = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("whatsapp-status", "disconnected");
    }
  });

  client.initialize().catch((err) => {
    console.error("[WhatsApp] Init error:", err.message);
  });
}

// ─── Internal send helper ────────────────────────────────────
async function _send(phone, message) {
  try {
    // WhatsApp chat ID format: 91XXXXXXXXXX@c.us
    const digits = String(phone).replace(/\D/g, "");
    const chatId = digits.startsWith("91")
      ? `${digits}@c.us`
      : `91${digits}@c.us`;

    await client.sendMessage(chatId, message);
    console.log(`[WhatsApp] ✅ Sent to ${chatId}`);
    return { success: true };
  } catch (err) {
    console.error("[WhatsApp] Send error:", err.message);
    return { success: false, error: err.message };
  }
}

// ─── Public: send a message ──────────────────────────────────
async function sendMessage(phone, message) {
  if (!phone) return { success: false, error: "No phone number" };

  if (!isReady) {
    // Queue it — will fire once client becomes ready
    pendingMessages.push({ phone, message });
    console.log(`[WhatsApp] Queued message for ${phone} (client not ready yet)`);
    return { success: true, queued: true };
  }

  return _send(phone, message);
}

// ─── Public: status ──────────────────────────────────────────
function getStatus() {
  return { ready: isReady };
}

module.exports = { initWhatsApp, sendMessage, getStatus };
