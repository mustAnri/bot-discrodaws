const fs = require("fs");
const path = require("path");

// ================= LOKASI CONFIG =================
// Config khusus fitur auto-click (port ConfigManager dari auto-click.py).
// Disimpan terpisah dari config.json utama bot.
const DATA_FILE_NAME = "autoclick-config.json";
const dataDir = process.env.DATA_DIR && process.env.DATA_DIR.trim() !== ""
    ? process.env.DATA_DIR
    : __dirname;
const configPath = path.join(dataDir, DATA_FILE_NAME);

// Default = nilai DEFAULT_CONFIG dari auto-click.py
const DEFAULT_CONFIG = Object.freeze({
    humanize: true,
    human_delay_min: 0.3,
    human_delay_max: 1.2,
    base_delay: 1.0,
    min_delay: 0.5,
    max_delay: 30.0,
    max_click_retries: 3,
    heartbeat_timeout: 90.0,
    confirm_watchdog_timeout: 30.0
});

const ALLOWED_KEYS = Object.keys(DEFAULT_CONFIG);

let config = { ...DEFAULT_CONFIG };

// ================= UTIL =================
/** Clamp nilai numerik + validasi tipe, meniru sanity-check ConfigManager Python. */
function clampNumber(key, value) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        throw new Error(`Nilai "${key}" harus berupa angka.`);
    }

    switch (key) {
        case "human_delay_min":
            return Math.max(0.0, num);
        case "human_delay_max":
            return num; // di-clamp terhadap human_delay_min saat apply
        case "base_delay":
            return Math.max(0.0, num);
        case "min_delay":
            return Math.max(0.0, num);
        case "max_delay":
            return num; // di-clamp terhadap min_delay saat apply
        case "max_click_retries":
            return Math.max(1, Math.floor(num));
        case "heartbeat_timeout":
            return Math.max(30.0, num);
        case "confirm_watchdog_timeout":
            return Math.max(10.0, num);
        default:
            return num;
    }
}

// ================= LOAD / SAVE =================
/** Pastikan folder DATA_DIR ada (misal volume baru di Railway). */
function ensureDataDir() {
    try {
        fs.mkdirSync(dataDir, { recursive: true });
    } catch { /* abaikan — writeFileSync akan lapor error jika tetap gagal */ }
}

function loadConfig() {
    try {
        if (!fs.existsSync(configPath)) {
            ensureDataDir();
            fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
            config = { ...DEFAULT_CONFIG };
            return;
        }

        const raw = fs.readFileSync(configPath, "utf-8");
        const obj = raw ? JSON.parse(raw) : {};

        config = { ...DEFAULT_CONFIG };
        for (const key of ALLOWED_KEYS) {
            if (obj[key] === undefined) continue;
            if (key === "humanize") {
                config[key] = Boolean(obj[key]);
            } else {
                const num = Number(obj[key]);
                if (Number.isFinite(num)) config[key] = num;
            }
        }
    } catch (err) {
        console.error("LOAD AUTOCLICK CONFIG ERROR:", err);
        config = { ...DEFAULT_CONFIG };
    }
}

function saveConfig() {
    try {
        ensureDataDir();
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (err) {
        console.error("SAVE AUTOCLICK CONFIG ERROR:", err);
    }
}

// ================= GETTER =================
function getConfig() {
    return { ...config };
}

// ================= UPDATE =================
/**
 * Update config auto-click (validasi tipe + clamp).
 * @param {Record<string, unknown>} partial
 * @returns {Record<string, unknown>} config baru
 * @throws {Error} jika ada nilai tidak valid
 */
function updateConfig(partial) {
    const updated = { ...config };

    for (const key of ALLOWED_KEYS) {
        if (partial[key] === undefined) continue;

        if (key === "humanize") {
            updated[key] = Boolean(partial[key]);
            continue;
        }
        updated[key] = clampNumber(key, partial[key]);
    }

    // Sanity clamp antar-field (meniru apply_config Python)
    updated.human_delay_max = Math.max(updated.human_delay_min, updated.human_delay_max);
    updated.max_delay = Math.max(updated.min_delay, updated.max_delay);

    config = updated;
    saveConfig();
    console.log("⚙️ Auto-click config diupdate:", JSON.stringify(config));
    return getConfig();
}

// ================= INIT =================
loadConfig();

module.exports = {
    DEFAULT_CONFIG,
    ALLOWED_KEYS,
    getConfig,
    updateConfig
};
