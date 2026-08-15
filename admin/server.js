require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");

const handler = require("../Data/handlerData");
const config = require("../Data/config");
const logStore = require("./logStore");
const systemInfo = require("./systemInfo");

// ================= KONSTANTA =================
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_COOKIE = "barokah_admin";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 jam
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // bersihkan session expired tiap 1 jam
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 menit
const JSON_BODY_LIMIT = "100kb";

const sessions = new Map(); // token -> expiresAt (ms)
const loginAttempts = new Map(); // ip -> { count, resetAt }
const actionCooldowns = new Map(); // key -> lastRun (ms), untuk rate-limit aksi berat
let discordClient = null; // di-set saat startAdminServer(client)

const COOLDOWN_MS = 30000; // 30 detik antar aksi speed/clear-memory

// ================= UTIL =================
function timingSafeEqual(a, b) {
    const bufA = Buffer.from(String(a), "utf8");
    const bufB = Buffer.from(String(b), "utf8");
    const hashA = crypto.createHash("sha256").update(bufA).digest();
    const hashB = crypto.createHash("sha256").update(bufB).digest();
    return crypto.timingSafeEqual(hashA, hashB);
}

function isValidUserId(id) {
    return /^\d{5,25}$/.test(id);
}

function isProduction() {
    return process.env.NODE_ENV === "production" || Boolean(process.env.RAILWAY_PROJECT_ID);
}

function inCooldown(key) {
    const last = actionCooldowns.get(key) || 0;
    if (Date.now() - last < COOLDOWN_MS) return true;
    actionCooldowns.set(key, Date.now());
    return false;
}

// Pangkas cache pesan discord.js yang aman dibuang (mengurangi RAM saat idle)
const SWEEP_LIFETIME_MS = 30 * 60 * 1000; // buang pesan cache lebih tua dari 30 menit

/**
 * Sweep cache pesan lama dari semua channel yang ter-cache.
 * @returns {number} jumlah pesan yang dibuang dari cache
 */
function sweepDiscordCaches() {
    if (!discordClient || !discordClient.isReady()) return 0;
    let swept = 0;
    try {
        const isOldMessage = (msg) => Date.now() - msg.createdTimestamp > SWEEP_LIFETIME_MS;
        for (const [, channel] of discordClient.channels.cache) {
            if (channel.messages && typeof channel.messages.cache.sweep === "function") {
                swept += channel.messages.cache.sweep(isOldMessage);
            }
        }
    } catch (err) {
        console.warn("Sweep cache gagal:", err.message);
    }
    return swept;
}

// ================= MIDDLEWARE =================
function requireAuth(req, res, next) {
    const token = req.cookies[SESSION_COOKIE];
    const expiresAt = token ? sessions.get(token) : undefined;

    if (!expiresAt || expiresAt < Date.now()) {
        if (token) sessions.delete(token);
        return res.status(401).json({ success: false, error: "Belum login atau session berakhir." });
    }
    return next();
}

function loginRateLimit(req, res, next) {
    const ip = req.ip || "unknown";
    const now = Date.now();
    const entry = loginAttempts.get(ip);

    if (!entry || entry.resetAt < now) {
        loginAttempts.set(ip, { count: 0, resetAt: now + LOGIN_WINDOW_MS });
        return next();
    }
    if (entry.count >= LOGIN_MAX_ATTEMPTS) {
        return res.status(429).json({
            success: false,
            error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit."
        });
    }
    return next();
}

function recordFailedLogin(req) {
    const ip = req.ip || "unknown";
    const entry = loginAttempts.get(ip);
    if (entry) entry.count += 1;
}

// ================= APP =================
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "..", "public")));

// ================= AUTH ROUTES =================
app.get("/api/auth/me", (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    const expiresAt = token ? sessions.get(token) : undefined;
    const loggedIn = Boolean(expiresAt && expiresAt >= Date.now());
    res.json({ success: true, data: { loggedIn } });
});

app.post("/api/login", loginRateLimit, (req, res) => {
    if (!ADMIN_PASSWORD) {
        return res.status(503).json({
            success: false,
            error: "ADMIN_PASSWORD belum diatur di environment variables."
        });
    }

    const password = String(req.body?.password || "");
    if (!password || !timingSafeEqual(password, ADMIN_PASSWORD)) {
        recordFailedLogin(req);
        return res.status(401).json({ success: false, error: "Password salah." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, Date.now() + SESSION_TTL_MS);

    res.cookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction(),
        maxAge: SESSION_TTL_MS
    });
    return res.json({ success: true });
});

app.post("/api/logout", (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) sessions.delete(token);
    res.clearCookie(SESSION_COOKIE);
    res.json({ success: true });
});

// ================= CONFIG ROUTES =================
app.get("/api/config", requireAuth, (req, res) => {
    res.json({ success: true, data: config.getConfig() });
});

app.put("/api/config", requireAuth, (req, res) => {
    try {
        const updated = config.updateConfig(req.body || {});
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// ================= HANDLER ROUTES =================
app.get("/api/handlers", requireAuth, (req, res) => {
    res.json({ success: true, data: handler.getAllHandlers() });
});

app.put("/api/handlers/:id", requireAuth, (req, res) => {
    const userId = req.params.id;
    if (!isValidUserId(userId)) {
        return res.status(400).json({ success: false, error: "User ID tidak valid." });
    }

    try {
        const updated = handler.updateHandler(userId, req.body || {});
        res.json({ success: true, data: updated });
    } catch (err) {
        const status = err.message.includes("tidak ditemukan") ? 404 : 400;
        res.status(status).json({ success: false, error: err.message });
    }
});

app.post("/api/handlers/:id/reset", requireAuth, (req, res) => {
    const userId = req.params.id;
    if (!isValidUserId(userId)) {
        return res.status(400).json({ success: false, error: "User ID tidak valid." });
    }

    const ok = handler.resetHandler(userId);
    if (!ok) {
        return res.status(404).json({ success: false, error: "Handler tidak ditemukan." });
    }
    res.json({ success: true, data: handler.getHandler(userId) });
});

app.delete("/api/handlers/:id", requireAuth, (req, res) => {
    const userId = req.params.id;
    if (!isValidUserId(userId)) {
        return res.status(400).json({ success: false, error: "User ID tidak valid." });
    }

    const ok = handler.deleteHandler(userId);
    if (!ok) {
        return res.status(404).json({ success: false, error: "Handler tidak ditemukan." });
    }
    res.json({ success: true });
});

// ================= BACKUP / RESTORE / SYNC =================
// Download backup data (JSON)
app.get("/api/backup", requireAuth, (req, res) => {
    const backup = handler.exportData();
    const filename = `backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json(backup);
});

// Restore data dari backup JSON (di-paste/upload oleh admin)
app.post("/api/restore", requireAuth, (req, res) => {
    try {
        const count = handler.importData(req.body || {});
        res.json({ success: true, data: { imported: count } });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// Sync data lokal mengikuti leaderboard di channel ranking Discord
app.post("/api/sync-ranking", requireAuth, async (req, res) => {
    if (!discordClient || !discordClient.isReady()) {
        return res.status(503).json({ success: false, error: "Discord client belum siap." });
    }

    try {
        // Prioritaskan guild dari GUILD_ID env, fallback ke guild pertama di cache
        const guild = (process.env.GUILD_ID && discordClient.guilds.cache.get(process.env.GUILD_ID))
            || discordClient.guilds.cache.first();

        if (!guild) {
            return res.status(404).json({ success: false, error: "Bot belum masuk ke server mana pun." });
        }
        const result = await handler.syncFromRankingChannel(guild);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// ================= SYSTEM MONITORING =================
// Info spesifikasi & status server (+ ping ke Discord)
app.get("/api/system", requireAuth, async (req, res) => {
    const info = systemInfo.getSystemInfo({
        ready: Boolean(discordClient && discordClient.isReady()),
        guildCount: discordClient && discordClient.isReady() ? discordClient.guilds.cache.size : null
    });
    info.network = { discordPingMs: await systemInfo.pingDiscord() };
    res.json({ success: true, data: info });
});

// Log ring buffer (polling: kirim ?after=<ISO timestamp> untuk delta)
app.get("/api/logs", requireAuth, (req, res) => {
    const after = typeof req.query.after === "string" ? req.query.after : null;
    res.json({ success: true, data: logStore.getLogs(after) });
});

// Bersihkan buffer log
app.post("/api/logs/clear", requireAuth, (req, res) => {
    logStore.clear();
    res.json({ success: true });
});

// Bersihkan memori: GC (jika tersedia) + pangkas cache discord.js
app.post("/api/system/clear-memory", requireAuth, (req, res) => {
    if (inCooldown("clear-memory")) {
        return res.status(429).json({
            success: false,
            error: "Tunggu sebentar sebelum menjalankan lagi (cooldown 30 detik)."
        });
    }

    const sweptMessages = sweepDiscordCaches();
    const { gcRan, heapBeforeMB, heapAfterMB } = systemInfo.clearMemory();

    console.log(`🧹 Clear memory: GC=${gcRan}, heap ${heapBeforeMB}MB → ${heapAfterMB}MB, pesan cache dibuang=${sweptMessages}`);
    res.json({
        success: true,
        data: {
            gcRan,
            gcHint: gcRan ? "" : "Tambahkan --expose-gc di start command Railway agar GC manual aktif.",
            heapBeforeMB,
            heapAfterMB,
            sweptMessages
        }
    });
});

// Speed test internet (async — polling status, bisa makan ~20 detik)
const speedTestState = { busy: false, result: null, error: null };

app.post("/api/system/speed", requireAuth, (req, res) => {
    if (speedTestState.busy) {
        return res.status(409).json({ success: false, error: "Speed test sedang berjalan." });
    }
    if (inCooldown("speed-test")) {
        return res.status(429).json({
            success: false,
            error: "Tunggu sebentar sebelum menjalankan lagi (cooldown 30 detik)."
        });
    }

    speedTestState.busy = true;
    speedTestState.result = null;
    speedTestState.error = null;

    systemInfo.runSpeedTest()
        .then((result) => {
            speedTestState.result = result;
            console.log(`🌐 Speed test: ${result.downMbps} Mbps download, latensi ${result.latencyMs}ms`);
        })
        .catch((err) => {
            speedTestState.error = err.message;
            console.error("Speed test gagal:", err.message);
        })
        .finally(() => { speedTestState.busy = false; });

    res.json({ success: true, data: { started: true } });
});

// Status/hasil speed test (untuk polling dari UI)
app.get("/api/system/speed/status", requireAuth, (req, res) => {
    res.json({ success: true, data: { ...speedTestState } });
});

// ================= FALLBACK =================
// SPA fallback: semua GET non-API mengarah ke index.html (Express 5 syntax)
app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// 404 untuk API yang tidak ada
app.use((req, res) => {
    res.status(404).json({ success: false, error: "Endpoint tidak ditemukan." });
});

// ================= ERROR HANDLERS =================
// JSON body tidak valid / error lain → respon rapi, bukan error HTML
app.use((err, req, res, next) => {
    if (err?.type === "entity.parse.failed") {
        return res.status(400).json({ success: false, error: "Body JSON tidak valid." });
    }
    console.error("ADMIN SERVER ERROR:", err);
    return res.status(500).json({ success: false, error: "Terjadi error pada server." });
});

// ================= START =================
function startAdminServer(client = null) {
    discordClient = client;

    if (!ADMIN_PASSWORD) {
        console.warn("⚠️ ADMIN_PASSWORD belum diatur — admin panel aktif tapi login diblokir.");
    }

    setInterval(() => {
        const now = Date.now();
        for (const [token, expiresAt] of sessions) {
            if (expiresAt < now) sessions.delete(token);
        }
        for (const [ip, entry] of loginAttempts) {
            if (entry.resetAt < now) loginAttempts.delete(ip);
        }
    }, CLEANUP_INTERVAL_MS).unref();

    app.listen(PORT, () => {
        console.log(`🌐 Admin panel berjalan di port ${PORT}`);
    });
}

module.exports = { startAdminServer };
