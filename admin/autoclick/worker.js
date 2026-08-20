"use strict";

// ============================================================
// AutoClickWorker — port Node.js dari class AutoLoginWorker
// di auto-click.py. Dipakai untuk klik otomatis tombol
// "Authenticate" / "Yes, Log Me In" lewat user-token Discord.
// Hanya dikontrol melalui admin panel web.
// ============================================================

const WebSocket = require("ws");
const acLogStore = require("./logStore");

// ================= KONSTANTA =================
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const GATEWAY_URL = "wss://gateway.discord.gg/?v=9&encoding=json";
const API_BASE = "https://discord.com/api/v9";
const DEFAULT_CHANNEL_ID = "1243177096948486186";
const TARGET_LABELS = ["Authenticate", "Yes, Log Me In"];

const MAX_LOG_LINES = 100;
const MAX_PENDING_MESSAGES = 50;
const BUTTON_DEDUPE_TTL_SEC = 120;

const DEFAULT_WORKER_CONFIG = Object.freeze({
    humanize: true,
    human_delay_min: 0.3,
    human_delay_max: 1.2,
    base_delay: 1.0,
    min_delay: 0.5,
    max_delay: 30.0,
    max_click_retries: 3,
    heartbeat_timeout: 90.0,
    confirm_watchdog_timeout: 30.0,
    activity_name: "" // teks activity presence; kosong = tanpa activity
});

// ================= UTIL =================
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rand = (min, max) => Math.random() * (max - min) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const nowSec = () => Date.now() / 1000;

class FetchTimeoutError extends Error {
    constructor() { super("Request timeout"); this.code = "TIMEOUT"; }
}
class FetchConnectionError extends Error {
    constructor(message) { super(message); this.code = "CONNECTION"; }
}

/** fetch() dengan timeout via AbortController (meniru timeout= pada requests). */
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
        if (err && err.name === "AbortError") throw new FetchTimeoutError();
        const connErr = new FetchConnectionError(err && err.message ? err.message : "Connection error");
        connErr.cause = err;
        throw connErr;
    } finally {
        clearTimeout(timer);
    }
}

// ================= BUILD NUMBER =================
// fetch_discord_build_number(): cache global 1 jam, fallback 544136.
const FALLBACK_BUILD_NUMBER = 544136;
const BUILD_CACHE_TTL_MS = 60 * 60 * 1000;
let cachedBuildNumber = null;
let cachedBuildAt = 0;

async function fetchDiscordBuildNumber() {
    try {
        const res = await fetchWithTimeout("https://discord.com/app", {
            headers: { "User-Agent": USER_AGENT }
        }, 10000);
        const text = await res.text();
        let match = text.match(/BUILD_NUMBER["\s:=]+["']?(\d+)/);
        if (!match) match = text.match(/"buildNumber["\s:]+(\d+)/);
        if (match) return parseInt(match[1], 10);
    } catch {
        // abaikan — pakai fallback
    }
    return FALLBACK_BUILD_NUMBER;
}

async function getBuildNumber() {
    if (cachedBuildNumber !== null && Date.now() - cachedBuildAt < BUILD_CACHE_TTL_MS) {
        return cachedBuildNumber;
    }
    cachedBuildNumber = await fetchDiscordBuildNumber();
    cachedBuildAt = Date.now();
    return cachedBuildNumber;
}

/** Tebak level log dari prefix emoji pesan worker. */
function inferLogLevel(message) {
    if (typeof message === "string") {
        if (message.startsWith("❌")) return "ERROR";
        if (message.startsWith("⚠️")) return "WARN";
    }
    return "INFO";
}

// ================= WORKER =================
class AutoClickWorker {
    /**
     * @param {string} name nama akun (ID worker)
     * @param {string} token user/bot token Discord
     * @param {string} channelId channel yang dipantau
     * @param {object} config config auto-click
     * @param {(name: string, status: string) => void} onStatusChange callback status
     */
    constructor(name, token, channelId, config, onStatusChange) {
        this.name = name;
        this.token = String(token || "").replace(/['"]/g, "").trim();
        this.headers = {
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
            Authorization: this.token
        };
        this.channelId = channelId || DEFAULT_CHANNEL_ID;
        this.onStatusChange = onStatusChange || (() => {});
        this.status = "🔴 Stopped";

        // ---- state gateway ----
        this.running = false;
        this.starting = false;
        this.stopRequested = false;
        this.ws = null;
        this.sessionId = null;
        this.discordUserId = null;
        this.cachedGuildId = null;
        this.isReconnect = false;
        this.tokenInvalid = false;
        this.pendingMessages = [];
        this.lastMessageId = null;
        this.lastHeartbeatAck = 0;
        this.heartbeatTimer = null;
        this.pingTimer = null;
        this.healthTimer = null;
        this.reconnectTimer = null;
        this.consecutiveErrors = 0;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5;
        this.maxReconnectDelay = 120;
        this.clientBuildNumber = FALLBACK_BUILD_NUMBER;

        // ---- rate limit / delay ----
        this.rateLimitRemaining = 50;
        this.rateLimitReset = 0;
        this.currentDelay = 1.0;
        this.applyConfig(config);

        // ---- click queue ----
        this.clickQueue = [];
        this.clickBusy = false;
        this.queuedButtons = new Map(); // "msgId:customId" -> timestamp
        this.lastAuthenticateOkAt = 0;
        this.lastConfirmQueuedAt = 0;

        // ---- statistik & log ----
        this.messageCount = 0;
        this.clickCount = 0;
        this.errorCount = 0;
        this.startTime = 0;
        this.logs = [];
    }

    // ---------- logging & status ----------
    addLog(message, level = null) {
        const ts = new Date().toTimeString().slice(0, 8);
        this.logs.push(`[${ts}] ${message}`);
        if (this.logs.length > MAX_LOG_LINES) this.logs.shift();
        // Masuk log store khusus auto verif (dipakai tab AUTO VERIF web panel).
        acLogStore.push(level || inferLogLevel(message), `[${this.name}] ${message}`);
        console.log(`[AutoClick:${this.name}] ${message}`);
    }

    setStatus(status) {
        this.status = status;
        try { this.onStatusChange(this.name, status); } catch { /* abaikan */ }
    }

    // ---------- config (aman dipanggil saat running) ----------
    applyConfig(config) {
        const merged = { ...DEFAULT_WORKER_CONFIG, ...(config || {}) };
        this.humanize = Boolean(merged.humanize);
        this.humanDelayMin = Math.max(0.0, Number(merged.human_delay_min) || 0.3);
        this.humanDelayMax = Math.max(this.humanDelayMin, Number(merged.human_delay_max) || 1.2);
        this.baseDelay = Math.max(0.0, Number(merged.base_delay) || 0);
        this.minDelay = Math.max(0.0, Number(merged.min_delay) || 0);
        this.maxDelay = Math.max(this.minDelay, Number(merged.max_delay) || 30);
        this.maxClickRetries = Math.max(1, Math.floor(Number(merged.max_click_retries) || 1));
        this.heartbeatTimeout = Math.max(30.0, Number(merged.heartbeat_timeout) || 90);
        this.confirmWatchdogTimeout = Math.max(10.0, Number(merged.confirm_watchdog_timeout) || 30);
        this.activityName = String(merged.activity_name || "").trim().slice(0, 128);
        // Jaga dynamic delay tetap di dalam bounds baru
        this.currentDelay = Math.max(this.baseDelay, Math.min(this.currentDelay, this.maxDelay));
    }

    // ---------- verifikasi token (3 skema seperti Python) ----------
    async verifyToken() {
        const schemes = [
            this.token,
            `Bot ${this.token}`,
            `Bearer ${this.token.replace(/^Bot\s+/, "")}`
        ];
        let saw401 = false;

        for (const auth of schemes) {
            try {
                const res = await fetchWithTimeout(`${API_BASE}/users/@me`, {
                    headers: { ...this.headers, Authorization: auth }
                }, 10000);

                if (res.status === 200) {
                    const data = await res.json();
                    this.discordUserId = data.id;
                    this.token = auth;
                    this.headers.Authorization = auth;
                    this.addLog(`✅ Token Valid: ${data.username}`);
                    this.reconnectAttempts = 0;
                    this.tokenInvalid = false;
                    return true;
                }
                if (res.status === 401) saw401 = true;
            } catch {
                // lanjut ke skema berikutnya
            }
        }

        this.tokenInvalid = saw401;
        if (saw401) {
            this.addLog("❌ TOKEN EXPIRED/INVALID (401)");
            this.addLog("⚠️ Update token akun ini dari tab AUTO VERIF.");
        } else {
            this.addLog("❌ Verifikasi token gagal (tidak bisa menghubungi API Discord).");
        }
        return false;
    }

    // ---------- lifecycle ----------
    async start() {
        if (this.running || this.starting) {
            this.addLog("⚠️ Worker sudah running");
            return;
        }
        this.starting = true;
        this.stopRequested = false;

        try {
            this.clientBuildNumber = await getBuildNumber();
            this.setStatus("🟡 Starting");

            let verified = await this.verifyToken();

            // Auto-retry dengan exponential backoff (meniru start() Python)
            while (!verified && this.tokenInvalid
                && this.reconnectAttempts < this.maxReconnectAttempts
                && !this.stopRequested) {
                this.reconnectAttempts += 1;
                const delay = this.reconnectDelay * (2 ** (this.reconnectAttempts - 1));
                this.addLog(`🔄 Auto-reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                this.addLog(`⏳ Waiting ${delay}s before retry...`);
                await sleep(delay * 1000);
                if (this.stopRequested) break;
                verified = await this.verifyToken();
            }

            if (!verified || this.stopRequested) {
                this.setStatus("❌ Token Invalid");
                return;
            }

            this.running = true;
            this.startTime = Date.now();
            this.messageCount = 0;
            this.clickCount = 0;
            this.errorCount = 0;

            this.healthTimer = setInterval(() => this.healthCheck(), 30000);
            this.healthTimer.unref();
            this.connectGateway();
            this.pumpClickQueue();

            this.addLog("🟢 Worker Started");
            this.setStatus("🟢 Running");
        } finally {
            this.starting = false;
        }
    }

    async stop() {
        this.stopRequested = true;
        this.running = false;

        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        if (this.healthTimer) { clearInterval(this.healthTimer); this.healthTimer = null; }
        this.clearHeartbeat();
        this.clearPing();

        if (this.ws) {
            try { this.ws.removeAllListeners(); this.ws.terminate(); } catch { /* abaikan */ }
            this.ws = null;
        }

        this.sessionId = null;
        this.clickQueue = [];
        this.pendingMessages = [];
        this.setStatus("🔴 Stopped");
        this.addLog("🔴 Worker Stopped");
    }

    // ---------- gateway ----------
    connectGateway() {
        if (!this.running) return;

        if (this.ws) {
            try { this.ws.removeAllListeners(); this.ws.terminate(); } catch { /* abaikan */ }
            this.ws = null;
        }

        let ws;
        try {
            ws = new WebSocket(GATEWAY_URL, { headers: { "User-Agent": USER_AGENT } });
        } catch (err) {
            this.errorCount += 1;
            this.addLog(`❌ Gagal membuat koneksi gateway: ${err.message}`);
            this.scheduleReconnect();
            return;
        }
        this.ws = ws;

        ws.on("open", () => this.onOpen());
        ws.on("message", (data) => this.onMessage(data));
        ws.on("error", (err) => this.onError(err));
        ws.on("close", (code, reason) => this.onClose(code, reason));
    }

    scheduleReconnect() {
        if (!this.running || this.tokenInvalid || this.reconnectTimer) return;

        this.consecutiveErrors += 1;
        const base = Math.min(
            this.reconnectDelay * (2 ** (this.consecutiveErrors - 1)),
            this.maxReconnectDelay
        );
        const delay = base * rand(0.8, 1.2); // jitter ±20%
        this.addLog(`🔄 Reconnecting in ${delay.toFixed(1)}s... (attempt ${this.consecutiveErrors})`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connectGateway();
        }, delay * 1000);
    }

    onOpen() {
        this.addLog("📡 Connected to Gateway");
        this.lastHeartbeatAck = nowSec();
        this.consecutiveErrors = 0;

        // Protocol ping (meniru run_forever(ping_interval=25))
        this.clearPing();
        this.pingTimer = setInterval(() => {
            try {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.ping();
            } catch { /* abaikan */ }
        }, 25000);
        this.pingTimer.unref();
    }

    onClose(code) {
        this.clearHeartbeat();
        this.clearPing();

        if (code === 4004) {
            this.addLog("❌ Authentication Failed (4004)");
            this.addLog("⚠️ Token expired atau invalid");
            this.tokenInvalid = true;
            this.running = false;
            this.setStatus("❌ Token Invalid");
            return;
        }

        this.addLog(`🔌 Gateway Closed. Code: ${code}`);
        if (this.running && !this.tokenInvalid) {
            this.isReconnect = true;
            this.addLog("🔄 Will auto-reconnect...");
            this.scheduleReconnect();
        }
    }

    onError(err) {
        this.errorCount += 1;
        const errorStr = String(err && err.message ? err.message : err);

        if (errorStr.includes("Authentication failed") || errorStr.includes("401")) {
            this.addLog("❌ Auth Error: Token invalid");
            this.tokenInvalid = true;
        } else if (errorStr.includes("10054") || errorStr.includes("forcibly closed")) {
            this.addLog("❌ Connection forcibly closed (Rate limit / Bot detection)");
            this.consecutiveErrors = 3; // lompat ke base delay ~8s
        } else {
            this.addLog(`❌ WebSocket Error: ${errorStr}`);
        }
    }

    onMessage(raw) {
        if (!this.running) return;

        let data;
        try {
            data = JSON.parse(raw.toString());
        } catch {
            return;
        }

        const op = data.op;
        const t = data.t;
        const d = data.d;

        try {
            if (op === 11) {
                this.lastHeartbeatAck = nowSec();
                return;
            }

            if (op === 1) {
                // Gateway meminta heartbeat segera
                this.sendHeartbeat();
                return;
            }

            if (op === 10) { // HELLO
                const heartbeatInterval = d.heartbeat_interval / 1000;
                this.startHeartbeat(heartbeatInterval);
                this.sendIdentify();
                return;
            }

            if (t === "READY") {
                this.sessionId = d.session_id;
                this.discordUserId = d.user.id;
                this.addLog(`Ready! Session ID: ${this.sessionId}`);

                if (this.isReconnect) {
                    this.addLog("🔍 Checking for missed messages...");
                    this.isReconnect = false;
                    this.fetchRecentMessages(false);
                }

                if (this.pendingMessages.length > 0) {
                    this.addLog(`📨 Processing ${this.pendingMessages.length} pending messages...`);
                    const pending = this.pendingMessages;
                    this.pendingMessages = [];
                    for (const msg of pending) this.handleMessage(msg);
                }
                return;
            }

            if (t === "MESSAGE_CREATE" || t === "MESSAGE_UPDATE") {
                if (t === "MESSAGE_CREATE") this.messageCount += 1;

                if (!this.sessionId) {
                    this.pendingMessages.push(d);
                    if (this.pendingMessages.length > MAX_PENDING_MESSAGES) {
                        this.pendingMessages.shift();
                    }
                    this.addLog("📥 Message queued (session not ready)");
                } else {
                    // UPDATE events penting: beberapa bot memunculkan tombol
                    // confirm dengan MENGEDIT pesan asli. Dedupe menjaga agar
                    // tidak klik dua kali.
                    this.handleMessage(d);
                }
            }
        } catch (err) {
            this.errorCount += 1;
            this.addLog(`❌ Message error: ${err.message}`);
        }
    }

    startHeartbeat(intervalSec) {
        this.clearHeartbeat();
        this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), intervalSec * 1000);
        this.heartbeatTimer.unref();
    }

    sendHeartbeat() {
        try {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ op: 1, d: null }));
            } else {
                this.clearHeartbeat();
            }
        } catch {
            this.clearHeartbeat();
        }
    }

    clearHeartbeat() {
        if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    }

    clearPing() {
        if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    }

    sendIdentify() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        // Activity presence opsional: hanya dikirim jika teks custom diisi.
        const presence = {
            status: "online",
            since: 0,
            activities: this.activityName
                ? [{
                    name: this.activityName,
                    type: pick([0, 2, 3]), // 0=Playing, 2=Listening, 3=Watching
                    created_at: Date.now()
                }]
                : [],
            afk: false
        };

        const identifyPayload = {
            op: 2,
            d: {
                token: this.token,
                capabilities: 16381,
                properties: {
                    os: "Windows",
                    browser: "Chrome",
                    device: "",
                    system_locale: pick(["en-US", "en-GB", "id-ID"]),
                    browser_user_agent: USER_AGENT,
                    browser_version: "131.0.0.0",
                    os_version: pick(["10", "11"]),
                    referrer: "",
                    referring_domain: "",
                    referrer_current: "",
                    referring_domain_current: "",
                    release_channel: "stable",
                    client_build_number: this.clientBuildNumber,
                    client_event_source: null
                },
                presence,
                compress: false,
                client_state: {
                    guild_versions: {},
                    highest_last_message_id: "0",
                    read_state_version: 0,
                    user_guild_settings_version: -1,
                    user_settings_version: -1,
                    private_channels_version: 0,
                    api_code_version: 0
                }
            }
        };

        try {
            this.ws.send(JSON.stringify(identifyPayload));
        } catch (err) {
            this.addLog(`❌ Gagal kirim IDENTIFY: ${err.message}`);
        }
    }

    // ---------- filter pesan ----------
    /**
     * Return true hanya jika pesan ini ditujukan untuk akun INI.
     * 1. Mention user ID kita -> milik kita.
     * 2. Ephemeral (flags & 64) + ownership terbukti -> milik kita.
     * Flag ephemeral saja TIDAK cukup (gateway bisa mengirim event
     * ephemeral ke member lain; client resmi memfilternya client-side).
     */
    messageTargetsMe(d) {
        if (!this.discordUserId) return false;

        for (const user of d.mentions || []) {
            if (user && user.id === this.discordUserId) return true;
        }

        const flags = d.flags || 0;
        if (!(flags & 64)) return false; // pesan publik tanpa mention -> bukan milik kita

        const meta = d.interaction_metadata || null;
        if (meta) {
            const metaUserId = (meta.user && meta.user.id) || meta.user_id;
            if (metaUserId === this.discordUserId) return true;
            this.addLog(`⏭️ Skipped ephemeral msg ${d.id}: interaction belongs to another user`);
            return false;
        }

        const legacy = d.interaction || null;
        if (legacy) {
            const legacyUserId = legacy.user && legacy.user.id;
            if (legacyUserId === this.discordUserId) return true;
            this.addLog(`⏭️ Skipped ephemeral msg ${d.id}: interaction belongs to another user`);
            return false;
        }

        // Fallback: author dari pesan yang di-reply (flow ".verify" dsb.)
        const refAuthor = (d.referenced_message || {}).author || {};
        if (refAuthor.id === this.discordUserId) return true;

        // Ownership tidak bisa dipastikan -> skip daripada salah klik.
        this.addLog(`⚠️ Skipped unverifiable ephemeral msg ${d.id}`);
        return false;
    }

    /** Catat tombol yang sudah di-queue (dedupe TTL 120s). Return false jika duplikat. */
    markButtonQueued(messageId, customId) {
        const now = nowSec();
        for (const [key, ts] of this.queuedButtons) {
            if (now - ts > BUTTON_DEDUPE_TTL_SEC) this.queuedButtons.delete(key);
        }

        const key = `${messageId}:${customId}`;
        if (this.queuedButtons.has(key)) return false;
        this.queuedButtons.set(key, now);
        return true;
    }

    handleMessage(d) {
        const msgChannelId = d.channel_id;
        if (msgChannelId !== this.channelId) return;

        const guildId = d.guild_id;
        if (guildId) this.cachedGuildId = guildId;

        const msgId = d.id;
        const author = d.author || {};
        const components = d.components || [];
        const flags = d.flags || 0;

        // Track last message ID secara monotonik (UPDATE pesan lama
        // tidak boleh memundurkan).
        if (msgId) {
            if (!this.lastMessageId || BigInt(msgId) > BigInt(this.lastMessageId)) {
                this.lastMessageId = msgId;
            }
        }

        if (!this.messageTargetsMe(d)) return;

        // Hanya hitung pesan yang relevan untuk akun ini
        this.messageCount += 1;

        if (components.length === 0) return;

        const ignoredLabels = [];
        for (const row of components) {
            for (const component of row.components || []) {
                if (component.type !== 2) continue; // hanya Button

                const label = component.label;
                const customId = component.custom_id;

                if (TARGET_LABELS.includes(label)) {
                    if (!this.markButtonQueued(msgId, customId)) continue;

                    const job = {
                        label,
                        guildId: d.guild_id,
                        channelId: msgChannelId,
                        messageId: msgId,
                        // application_id > webhook_id > author.id
                        appId: d.application_id || d.webhook_id || author.id,
                        customId,
                        flags
                    };
                    this.clickQueue.push(job);
                    this.addLog(`📥 Queued click: '${label}'`);

                    if (label === "Yes, Log Me In") this.lastConfirmQueuedAt = nowSec();
                    this.setStatus(label === "Authenticate" ? "🔄 Authenticating..." : "✅ Logged In");

                    // Pastikan pump jalan (mis. setelah stop/start)
                    this.pumpClickQueue();
                } else if (label) {
                    ignoredLabels.push(label);
                }
            }
        }

        if (ignoredLabels.length > 0) {
            this.addLog(`ℹ️ Ignored button(s) [${ignoredLabels.join(", ")}] on msg ${msgId}`);
        }
    }

    // ---------- fetch pesan terlewat ----------
    async fetchRecentMessages(ignoreLastId = false) {
        const url = `${API_BASE}/channels/${this.channelId}/messages?limit=10`;

        let res = null;
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                res = await fetchWithTimeout(url, { headers: this.headers }, 20000);
                break;
            } catch (err) {
                if (err instanceof FetchTimeoutError) {
                    if (attempt < maxAttempts) {
                        this.addLog(`⏳ Fetch timed out, retrying (${attempt}/${maxAttempts})...`);
                        await sleep(rand(1.0, 2.5) * 1000);
                        continue;
                    }
                    this.addLog("⚠️ Fetching missed messages timed out after retries");
                    return;
                }
                this.addLog(`⚠️ Error fetching messages: ${err.message}`);
                return;
            }
        }
        if (!res) return;

        try {
            if (res.status === 200) {
                const messages = await res.json();
                let processedCount = 0;

                // Proses dari yang paling lama dulu
                for (const msg of [...messages].reverse()) {
                    const msgId = msg.id;

                    if (!ignoreLastId && this.lastMessageId
                        && BigInt(msgId) <= BigInt(this.lastMessageId)) {
                        continue;
                    }

                    if (this.messageTargetsMe(msg) && (msg.components || []).length > 0) {
                        this.addLog(`📬 Found missed message: ${msgId}`);
                        this.handleMessage(msg);
                        processedCount += 1;
                    }
                }

                if (processedCount > 0) {
                    this.addLog(`✅ Processed ${processedCount} missed message(s)`);
                } else {
                    this.addLog("✅ No missed messages");
                }
            } else if (res.status === 429) {
                this.addLog("⚠️ Rate limited while fetching messages");
            } else {
                this.addLog(`⚠️ Failed to fetch messages: ${res.status}`);
            }
        } catch (err) {
            this.addLog(`⚠️ Error fetching messages: ${err.message}`);
        }
    }

    // ---------- click queue ----------
    async pumpClickQueue() {
        if (this.clickBusy) return;
        this.clickBusy = true;
        try {
            while (this.clickQueue.length > 0 && this.running) {
                const job = this.clickQueue.shift();
                try {
                    await this.processClickJob(job);
                } catch (err) {
                    this.addLog(`❌ Click job error: ${err.message}`);
                }
            }
        } finally {
            this.clickBusy = false;
        }
    }

    async processClickJob(job) {
        const delay = this.calculateDelay();
        this.addLog(`⏳ Waiting ${delay.toFixed(2)}s (Smart Rate-Limit)`);
        await sleep(delay * 1000);
        if (!this.running) return;

        if (this.humanize) {
            const humanDelay = rand(this.humanDelayMin, this.humanDelayMax);
            this.addLog(`⏳ Human delay ${humanDelay.toFixed(2)}s...`);
            await sleep(humanDelay * 1000);
            if (!this.running) return;
        }

        this.addLog(`🖱️ Clicking '${job.label}'...`);
        const ok = await this.clickButton(
            job.guildId, job.channelId, job.messageId,
            job.appId, job.customId, job.flags
        );

        if (ok && job.label === "Authenticate") {
            // Mulai missing-confirm watchdog (dicek di healthCheck)
            this.lastAuthenticateOkAt = nowSec();
        }
    }

    async clickButton(guildId, channelId, messageId, applicationId, customId, messageFlags = 0) {
        // Tunggu session_id siap (maks 10 x 0.5s = 5s)
        const maxWaitAttempts = 10;
        let attempt = 0;
        while (!this.sessionId && attempt < maxWaitAttempts) {
            if (attempt === 0) this.addLog("⏳ Waiting for session ready...");
            await sleep(500);
            attempt += 1;
        }

        if (!this.sessionId) {
            this.addLog("❌ Session not ready after 5s, skipping click");
            return false;
        }

        if (!guildId && this.cachedGuildId) guildId = this.cachedGuildId;

        const url = `${API_BASE}/interactions`;
        const nonce = String(Math.floor(Date.now() * 1000)); // mikrodetik, seperti Python

        const payload = {
            type: 3,
            nonce,
            guild_id: guildId,
            channel_id: channelId,
            message_id: messageId,
            application_id: applicationId,
            data: { component_type: 2, custom_id: customId },
            session_id: this.sessionId
        };
        if (messageFlags & 64) payload.message_flags = 64;

        const maxAttempts = Math.max(1, this.maxClickRetries);
        for (let attemptNum = 1; attemptNum <= maxAttempts; attemptNum++) {
            if (!this.running) return false;

            let res;
            try {
                res = await fetchWithTimeout(url, {
                    method: "POST",
                    headers: this.headers,
                    body: JSON.stringify(payload)
                }, 15000);
            } catch (err) {
                this.errorCount += 1;
                if (err instanceof FetchTimeoutError) {
                    this.addLog(`❌ Click Timeout (${attemptNum}/${maxAttempts})`);
                    this.currentDelay = Math.min(this.maxDelay, this.currentDelay * 1.5);
                    if (attemptNum < maxAttempts) await sleep(rand(1.0, 2.0) * 1000);
                } else if (err instanceof FetchConnectionError) {
                    this.addLog(`❌ Connection Error (${attemptNum}/${maxAttempts}): ${err.message.slice(0, 100)}`);
                    this.currentDelay = Math.min(this.maxDelay, this.currentDelay * 1.5);
                    if (attemptNum < maxAttempts) await sleep(rand(1.5, 3.0) * 1000);
                } else {
                    this.addLog(`❌ Click Error: ${err.message}`);
                    this.addLog(`   Payload: guild=${guildId}, channel=${channelId}, msg=${messageId}`);
                    this.currentDelay = Math.min(this.maxDelay, this.currentDelay * 1.2);
                    return false;
                }
                continue;
            }

            // Update info rate limit dari headers
            const rlRemaining = res.headers.get("x-ratelimit-remaining");
            if (rlRemaining !== null) this.rateLimitRemaining = parseInt(rlRemaining, 10) || 0;
            const rlReset = res.headers.get("x-ratelimit-reset");
            if (rlReset !== null) this.rateLimitReset = parseFloat(rlReset) || 0;

            if (res.status === 204) {
                this.clickCount += 1;
                this.addLog(`✅ Click Success: ${customId}`);
                // Turunkan delay saat sukses
                this.currentDelay = Math.max(this.baseDelay, this.currentDelay * 0.9);
                return true;
            }

            if (res.status === 429) {
                let retryAfter = 5.0;
                try {
                    const body = await res.json();
                    retryAfter = Number(body.retry_after) || 5.0;
                } catch { /* pakai default */ }

                this.currentDelay = Math.min(this.maxDelay, retryAfter * 1.5);
                if (attemptNum < maxAttempts) {
                    this.addLog(`⚠️ Rate Limited! Retrying in ${retryAfter.toFixed(1)}s (${attemptNum}/${maxAttempts})...`);
                    await sleep((retryAfter + rand(0.2, 0.8)) * 1000);
                    continue;
                }
                this.addLog(`❌ Click dropped: still rate limited after ${maxAttempts} attempts`);
                return false;
            }

            // Status lainnya
            this.errorCount += 1;
            let errorMsg;
            try {
                const errorDetail = await res.json();
                errorMsg = errorDetail.message || JSON.stringify(errorDetail);
            } catch {
                errorMsg = "No response body";
            }

            this.addLog(`❌ Click Failed: ${res.status} (${attemptNum}/${maxAttempts})`);
            this.addLog(`   Error: ${errorMsg}`);
            this.addLog(`   Payload: guild=${guildId}, channel=${channelId}, msg=${messageId}`);

            // Permanent failure (button expired/unknown): retry tidak membantu
            if ([400, 403, 404, 410].includes(res.status)) {
                this.currentDelay = Math.min(this.maxDelay, this.currentDelay * 1.2);
                return false;
            }

            // Transient failure (5xx dsb): retry dengan backoff
            this.currentDelay = Math.min(this.maxDelay, this.currentDelay * 1.2);
            if (attemptNum < maxAttempts) await sleep(rand(1.0, 2.0) * 1000);
        }

        this.addLog(`❌ Click failed after ${maxAttempts} attempts: ${customId}`);
        return false;
    }

    /** Hitung delay dinamis berdasarkan status rate limit. */
    calculateDelay() {
        let delay = this.currentDelay + rand(-0.5, 0.5);

        // Jika sisa rate limit menipis, sebar request sampai reset
        if (this.rateLimitRemaining < 10) {
            const timeUntilReset = Math.max(0, this.rateLimitReset - nowSec());
            if (timeUntilReset > 0) {
                delay = Math.max(delay, timeUntilReset / Math.max(1, this.rateLimitRemaining));
            }
        }

        return Math.max(this.minDelay, Math.min(this.maxDelay, delay));
    }

    // ---------- health check ----------
    healthCheck() {
        if (!this.running) return;

        // 1) Heartbeat timeout -> paksa reconnect
        const timeSinceAck = nowSec() - this.lastHeartbeatAck;
        if (this.lastHeartbeatAck > 0 && timeSinceAck > this.heartbeatTimeout) {
            this.addLog(`⚠️ Heartbeat timeout (${timeSinceAck.toFixed(0)}s)`);
            this.addLog("🔄 Forcing reconnect...");
            if (this.ws) {
                try { this.ws.removeAllListeners(); this.ws.terminate(); } catch { /* abaikan */ }
                this.ws = null;
                this.clearHeartbeat();
                this.clearPing();
                this.isReconnect = true;
                this.scheduleReconnect();
            }
        }

        // 2) Missing-confirm watchdog: "Authenticate" sukses tapi
        //    "Yes, Log Me In" tidak muncul dalam batas waktu.
        try {
            if (this.lastAuthenticateOkAt > 0
                && this.lastConfirmQueuedAt < this.lastAuthenticateOkAt
                && nowSec() - this.lastAuthenticateOkAt > this.confirmWatchdogTimeout) {
                this.lastAuthenticateOkAt = 0; // hanya sekali per klik
                this.addLog(`⚠️ No 'Yes, Log Me In' within ${this.confirmWatchdogTimeout}s after Authenticate`);
                this.addLog("🔁 Re-checking recent channel messages for the confirm button...");
                this.fetchRecentMessages(true);
            }
        } catch (err) {
            this.addLog(`❌ Watchdog error: ${err.message}`);
        }
    }

    // ---------- statistik ----------
    getStats() {
        return {
            uptimeSec: this.running && this.startTime > 0
                ? Math.floor((Date.now() - this.startTime) / 1000)
                : 0,
            messageCount: this.messageCount,
            clickCount: this.clickCount,
            errorCount: this.errorCount,
            rateLimitRemaining: this.rateLimitRemaining,
            queueLength: this.clickQueue.length,
            tokenInvalid: this.tokenInvalid
        };
    }
}

module.exports = { AutoClickWorker, DEFAULT_CHANNEL_ID };
