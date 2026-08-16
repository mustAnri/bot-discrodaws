/**
 * dev-admin.js — Jalankan HANYA panel web admin (tanpa bot Discord).
 * Dipakai untuk testing lokal tampilan web & fitur AUTO VERIF.
 *
 * Cara pakai:  node dev-admin.js
 * Lalu buka:   http://localhost:3000
 *
 * Semua route yang butuh bot asli sudah di-guard dengan
 * `!discordClient || !discordClient.isReady()`, jadi stub client di bawah aman.
 */
require("dotenv").config();

// Port default 3000 kalau belum diset.
if (!process.env.PORT) process.env.PORT = "3000";

// Password admin: pakai dari .env jika ada isinya, kalau tidak pakai default dev.
const usingDevPassword = !process.env.ADMIN_PASSWORD;
if (usingDevPassword) process.env.ADMIN_PASSWORD = "admin123";

const { startAdminServer } = require("./admin/server.js");

// Stub client Discord — bot tidak ikut jalan di mode ini.
const stubClient = {
    isReady: () => false,
    channels: { cache: new Map() },
    guilds: { cache: new Map() },
    user: null,
    ws: { ping: null }
};

startAdminServer(stubClient);

console.log("──────────────────────────────────────────────");
console.log("🧪 MODE DEV: panel web saja (bot Discord TIDAK jalan)");
console.log(`🌐 Buka: http://localhost:${process.env.PORT}`);
console.log(usingDevPassword
    ? "🔑 Login dengan password dev: admin123"
    : "🔑 Login dengan ADMIN_PASSWORD dari .env kamu");
console.log("──────────────────────────────────────────────");
