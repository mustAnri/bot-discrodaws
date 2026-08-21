require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");

const handler = require("../Data/handlerData");
const config = require("../Data/config");
const autoClickAccounts = require("../Data/autoClickAccounts");
const autoClickConfig = require("./autoclick/config");
const autoClickManager = require("./autoclick/manager");
const autoClickLogStore = require("./autoclick/logStore");
const autopostStore = require("../Data/autopostStore");
const autopostEngine = require("./autopost/engine");
const autopostLogStore = require("./autopost/logStore");
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

// ================= BUILD INFO =================
// Versi app dari package.json + info commit git (untuk badge di web UI).
// Di environment deploy tanpa folder .git, fallback ke env Railway.
const pkg = require("../package.json");
const { execSync } = require("child_process");

function readGitInfo() {
    const git = { commit: null, branch: null, committedAt: null };
    const repoRoot = path.join(__dirname, "..");
    try {
        const opts = { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"], timeout: 3000 };
        git.commit = execSync("git rev-parse --short HEAD", opts).toString().trim();
        git.branch = execSync("git rev-parse --abbrev-ref HEAD", opts).toString().trim();
        git.committedAt = execSync("git log -1 --format=%ci", opts).toString().trim();
    } catch (err) {
        // Repo tanpa .git — dicoba dari env Railway di bawah.
    }
    if (!git.commit && process.env.RAILWAY_GIT_COMMIT_SHA) {
        git.commit = String(process.env.RAILWAY_GIT_COMMIT_SHA).slice(0, 7);
        git.branch = process.env.RAILWAY_GIT_BRANCH || null;
    }
    return git;
}

const BUILD_INFO = Object.freeze({
    name: pkg.name || "bot-barokah",
    version: pkg.version || "0.0.0",
    git: Object.freeze(readGitInfo())
});

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
app.use(express.static(path.join(__dirname, "..", "public"), {
    // Anti-cache basi: browser/CDN harus selalu revalidasi, supaya update UI
    // langsung terlihat (sebelumnya user bisa dapat app.js lama dari cache).
    setHeaders(res) {
        res.setHeader("Cache-Control", "no-cache");
    }
}));

// ================= AUTH ROUTES =================
app.get("/api/auth/me", (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    const expiresAt = token ? sessions.get(token) : undefined;
    const loggedIn = Boolean(expiresAt && expiresAt >= Date.now());
    res.json({ success: true, data: { loggedIn } });
});

// Info versi app + commit git (untuk badge di topbar web)
app.get("/api/version", requireAuth, (req, res) => {
    res.json({ success: true, data: BUILD_INFO });
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

// ================= AUTO VERIF (AUTO-CLICK) ROUTES =================
// Port fitur auto-click.py — kontrol HANYA via web panel, tanpa command bot.
// Token akun tidak pernah dikirim penuh ke frontend (selalu di-mask).

// Dashboard akun + status worker (untuk polling UI)
app.get("/api/autoclick/status", requireAuth, (req, res) => {
    res.json({
        success: true,
        data: {
            accounts: autoClickManager.getDashboard(),
            encryptionEnabled: autoClickAccounts.isEncryptionEnabled()
        }
    });
});

// Daftar akun (alias dari status, supaya semantik REST jelas)
app.get("/api/autoclick/accounts", requireAuth, (req, res) => {
    res.json({ success: true, data: { accounts: autoClickManager.getDashboard() } });
});

// Tambah akun baru
app.post("/api/autoclick/accounts", requireAuth, (req, res) => {
    const { name, token, channelId } = req.body || {};
    const cleanName = String(name || "").trim();

    if (autoClickAccounts.getAccount(cleanName)) {
        return res.status(409).json({
            success: false,
            error: `Akun "${cleanName}" sudah ada. Gunakan EDIT untuk mengubahnya.`
        });
    }

    try {
        const account = autoClickAccounts.addAccount(cleanName, token, channelId);
        console.log(`🤖 Auto-click: akun "${cleanName}" ditambahkan`);
        return res.json({
            success: true,
            data: {
                name: cleanName,
                channelId: account.channel_id,
                tokenMasked: autoClickAccounts.maskToken(account.token)
            }
        });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
});

// Update akun (token dan/atau channel). Token diganti -> worker dihentikan.
app.put("/api/autoclick/accounts/:name", requireAuth, async (req, res) => {
    const name = req.params.name;

    try {
        const tokenChanged = Boolean(req.body && String(req.body.token || "").trim() !== "");
        const account = autoClickAccounts.updateAccount(name, req.body || {});

        if (tokenChanged) await autoClickManager.stopWorkerForTokenChange(name);
        if (req.body && String(req.body.channelId || "").trim() !== "") {
            autoClickManager.setWorkerChannelLive(name, account.channel_id);
        }

        console.log(`🤖 Auto-click: akun "${name}" diupdate`);
        return res.json({
            success: true,
            data: {
                name,
                channelId: account.channel_id,
                tokenMasked: autoClickAccounts.maskToken(account.token)
            }
        });
    } catch (err) {
        const status = err.message.includes("tidak ditemukan") ? 404 : 400;
        return res.status(status).json({ success: false, error: err.message });
    }
});

// Hapus akun (worker dihentikan lebih dulu jika aktif)
app.delete("/api/autoclick/accounts/:name", requireAuth, async (req, res) => {
    const name = req.params.name;

    await autoClickManager.stopWorker(name);
    const ok = autoClickAccounts.removeAccount(name);
    if (!ok) {
        return res.status(404).json({ success: false, error: `Akun "${name}" tidak ditemukan.` });
    }

    console.log(`🤖 Auto-click: akun "${name}" dihapus`);
    return res.json({ success: true });
});

// Start/stop worker per akun
app.post("/api/autoclick/accounts/:name/start", requireAuth, async (req, res) => {
    try {
        await autoClickManager.startWorker(req.params.name);
        return res.json({ success: true });
    } catch (err) {
        const status = err.message.includes("tidak ditemukan") ? 404 : 409;
        return res.status(status).json({ success: false, error: err.message });
    }
});

app.post("/api/autoclick/accounts/:name/stop", requireAuth, async (req, res) => {
    await autoClickManager.stopWorker(req.params.name);
    return res.json({ success: true });
});

// Start/stop semua worker
app.post("/api/autoclick/start-all", requireAuth, async (req, res) => {
    const started = await autoClickManager.startAll();
    console.log(`🤖 Auto-click: start all (${started} worker)`);
    return res.json({ success: true, data: { started } });
});

app.post("/api/autoclick/stop-all", requireAuth, async (req, res) => {
    const stopped = await autoClickManager.stopAll();
    console.log(`🤖 Auto-click: stop all (${stopped} worker)`);
    return res.json({ success: true, data: { stopped } });
});

// Config auto-click (delay, humanize, dsb.) — diterapkan live ke worker running
app.get("/api/autoclick/config", requireAuth, (req, res) => {
    res.json({ success: true, data: autoClickConfig.getConfig() });
});

app.put("/api/autoclick/config", requireAuth, (req, res) => {
    try {
        const updated = autoClickConfig.updateConfig(req.body || {});
        autoClickManager.applyConfigToWorkers();
        return res.json({ success: true, data: updated });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
});

// Log khusus auto verif (terpisah dari log server umum)
app.get("/api/autoclick/logs", requireAuth, (req, res) => {
    const after = typeof req.query.after === "string" && req.query.after.length > 0
        ? req.query.after
        : null;
    res.json({ success: true, data: autoClickLogStore.getLogs(after) });
});

app.post("/api/autoclick/logs/clear", requireAuth, (req, res) => {
    autoClickLogStore.clear();
    res.json({ success: true });
});

// ================= AUTOPOST ROUTES =================

// Helper: mask token agar tidak pernah dikirim penuh ke web
function maskToken(token) {
    if (!token) return "";
    if (token.length <= 6) return "•".repeat(token.length);
    return `${token.slice(0, 6)}${"•".repeat(Math.min(token.length - 6, 12))}…`;
}

// Status semua user + daftar private room (dashboard)
app.get("/api/autopost/status", requireAuth, (req, res) => {
    res.json({
        success: true,
        data: {
            statuses: autopostEngine.getStatuses(),
            rooms: autopostStore.getAllRooms()
        }
    });
});

// List ringkas semua user autopost (untuk tabel SEC.10 di web)
app.get("/api/autopost/users", requireAuth, (req, res) => {
    const users = autopostEngine.getStatuses().map((s) => {
        const cfg = autopostStore.peekUserConfig(s.userId) || {};
        return {
            userId: s.userId,
            username: s.username,
            running: s.running,
            tokenSet: s.hasToken,
            tokenPreview: maskToken(cfg.token),
            channelCount: s.channelCount,
            room: autopostStore.getUserRoom(s.userId) || null
        };
    });
    res.json({ success: true, data: users });
});

// Detail config satu user (token di-mask)
app.get("/api/autopost/users/:id", requireAuth, (req, res) => {
    const userId = req.params.id;
    const cfg = autopostStore.peekUserConfig(userId);
    if (!cfg) {
        return res.status(404).json({ success: false, error: "User config tidak ditemukan." });
    }
    res.json({
        success: true,
        data: {
            userId,
            username: cfg.username || "",
            token: maskToken(cfg.token),
            tokenPreview: maskToken(cfg.token),
            hasToken: Boolean(cfg.token),
            channels: cfg.channels,
            running: autopostEngine.isAutoPostActive(userId),
            room: autopostStore.getUserRoom(userId) || null
        }
    });
});

// Hapus user sepenuhnya: stop jika running, hapus config + legacy room (termasuk channel Discord-nya)
app.delete("/api/autopost/users/:id", requireAuth, async (req, res) => {
    const userId = req.params.id;
    if (!autopostStore.peekUserConfig(userId)) {
        return res.status(404).json({ success: false, error: "User config tidak ditemukan." });
    }
    // Stop worker yang masih jalan sebelum menghapus data.
    if (autopostEngine.isAutoPostActive(userId)) {
        autopostEngine.stopAutoPost(userId);
    }
    // Legacy room: hapus juga channel Discord-nya jika masih ada.
    const room = autopostStore.getUserRoom(userId);
    if (room && discordClient) {
        try {
            const channel = await discordClient.channels.fetch(room.channelId).catch(() => null);
            if (channel) await channel.delete("Dihapus via web admin panel").catch(() => {});
        } catch (err) {
            console.error("[AUTOPOST] delete user room channel error:", err.message);
        }
    }
    autopostStore.deleteUser(userId);
    res.json({ success: true, data: { userId } });
});

// Simpan / update token user
app.put("/api/autopost/users/:id/token", requireAuth, (req, res) => {
    const userId = req.params.id;
    const token = typeof (req.body && req.body.token) === "string" ? req.body.token.trim() : "";
    if (!token) {
        return res.status(400).json({ success: false, error: "Token tidak boleh kosong." });
    }
    const cfg = autopostStore.setUserConfig(userId, { token });
    res.json({ success: true, data: { userId, hasToken: Boolean(cfg.token) } });
});

// Tambah channel — terima kedua bentuk payload:
//   { channelId, message, interval }          (detik, langsung)
//   { channelId, message, hours, minutes, seconds }  (dihitung jadi detik)
app.post("/api/autopost/users/:id/channels", requireAuth, (req, res) => {
    const userId = req.params.id;
    const { channelId, message, interval, hours, minutes, seconds } = req.body || {};

    if (!channelId || typeof channelId !== "string") {
        return res.status(400).json({ success: false, error: "channelId wajib diisi." });
    }
    if (typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ success: false, error: "Message wajib diisi." });
    }

    // Hitung interval detik: pakai field "interval" jika ada, jika tidak hitung dari h/m/s.
    let iv;
    if (interval !== undefined && interval !== null && interval !== "") {
        iv = Number(interval);
    } else {
        const h = Number(hours) || 0;
        const m = Number(minutes) || 0;
        const s = Number(seconds) || 0;
        iv = h * 3600 + m * 60 + s;
    }

    if (!Number.isFinite(iv) || iv <= 0) {
        return res.status(400).json({ success: false, error: "Interval harus > 0 detik." });
    }

    const added = autopostStore.addChannel(userId, {
        id: channelId.trim(),
        message: message.trim(),
        interval: Math.floor(iv)
    });

    if (!added) {
        return res.status(409).json({ success: false, error: "Channel sudah ada di config." });
    }
    res.json({ success: true, data: autopostStore.peekUserConfig(userId).channels });
});

// Edit message channel yang sudah ada. Perubahan langsung dipakai oleh loop
// AutoPost yang sedang berjalan (store.updateChannel mutasi in-place).
app.put("/api/autopost/users/:id/channels/:cid", requireAuth, (req, res) => {
    const { id, cid } = req.params;
    const message = typeof (req.body && req.body.message) === "string" ? req.body.message.trim() : "";
    if (!message) {
        return res.status(400).json({ success: false, error: "Message tidak boleh kosong." });
    }
    const updated = autopostStore.updateChannel(id, cid, { message });
    if (!updated) {
        return res.status(404).json({ success: false, error: "Channel tidak ditemukan." });
    }
    res.json({ success: true, data: autopostStore.peekUserConfig(id).channels });
});

// Hapus channel
app.delete("/api/autopost/users/:id/channels/:cid", requireAuth, (req, res) => {
    const { id, cid } = req.params;
    const removed = autopostStore.removeChannel(id, cid);
    if (!removed) {
        return res.status(404).json({ success: false, error: "Channel tidak ditemukan." });
    }
    res.json({ success: true, data: autopostStore.peekUserConfig(id).channels });
});

// Start posting untuk satu user
app.post("/api/autopost/users/:id/start", requireAuth, (req, res) => {
    const userId = req.params.id;
    if (autopostEngine.isAutoPostActive(userId)) {
        return res.status(409).json({ success: false, error: "AutoPost sudah berjalan." });
    }
    const started = autopostEngine.startAutoPost(userId);
    if (!started) {
        return res.status(400).json({ success: false, error: "Gagal start: token / channel belum lengkap." });
    }
    res.json({ success: true, data: { userId, running: true } });
});

// Stop posting untuk satu user
app.post("/api/autopost/users/:id/stop", requireAuth, (req, res) => {
    const userId = req.params.id;
    const stopped = autopostEngine.stopAutoPost(userId);
    if (!stopped) {
        return res.status(400).json({ success: false, error: "AutoPost memang tidak berjalan." });
    }
    res.json({ success: true, data: { userId, running: false } });
});

// Hapus private room (delete channel Discord jika masih ada)
app.delete("/api/autopost/users/:id/room", requireAuth, async (req, res) => {
    const userId = req.params.id;
    const room = autopostStore.getUserRoom(userId);
    if (!room) {
        return res.status(404).json({ success: false, error: "User tidak punya private room." });
    }

    try {
        if (discordClient) {
            const channel = await discordClient.channels.fetch(room.channelId).catch(() => null);
            if (channel) await channel.delete("Dihapus via web admin panel").catch(() => {});
        }
    } catch (err) {
        console.error("[AUTOPOST] delete room channel error:", err.message);
    }

    autopostStore.deletePrivateRoom(room.roomId);
    res.json({ success: true, data: { roomId: room.roomId } });
});

// Log autopost
app.get("/api/autopost/logs", requireAuth, (req, res) => {
    const after = typeof req.query.after === "string" && req.query.after.length > 0
        ? req.query.after
        : null;
    res.json({ success: true, data: autopostLogStore.getLogs(after) });
});

app.post("/api/autopost/logs/clear", requireAuth, (req, res) => {
    autopostLogStore.clear();
    res.json({ success: true });
});

// Settings global AutoPost (banner custom + role whitelist)
app.get("/api/autopost/settings", requireAuth, (req, res) => {
    res.json({ success: true, data: autopostStore.getSettings() });
});

app.put("/api/autopost/settings", requireAuth, (req, res) => {
    const body = req.body || {};
    const partial = {};

    if (body.bannerUrl !== undefined) {
        const url = typeof body.bannerUrl === "string" ? body.bannerUrl.trim() : "";
        if (url && !/^https?:\/\/.+/.test(url)) {
            return res.status(400).json({ success: false, error: "Banner URL harus dimulai dengan http:// atau https://." });
        }
        partial.bannerUrl = url.slice(0, 500);
    }

    if (body.whitelistRoleId !== undefined) {
        const roleId = typeof body.whitelistRoleId === "string" ? body.whitelistRoleId.trim() : "";
        if (roleId && !/^\d{17,20}$/.test(roleId)) {
            return res.status(400).json({ success: false, error: "Whitelist role ID tidak valid." });
        }
        partial.whitelistRoleId = roleId;
    }

    if (body.setupRoleId !== undefined) {
        const roleId = typeof body.setupRoleId === "string" ? body.setupRoleId.trim() : "";
        if (roleId && !/^\d{17,20}$/.test(roleId)) {
            return res.status(400).json({ success: false, error: "Setup role ID tidak valid." });
        }
        partial.setupRoleId = roleId;
    }

    if (!Object.keys(partial).length) {
        return res.status(400).json({ success: false, error: "Tidak ada field settings yang dikirim." });
    }

    const settings = autopostStore.setSettings(partial);
    res.json({ success: true, data: settings });
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
