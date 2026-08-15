const fs = require("fs");
const path = require("path");

// ================= LOKASI CONFIG =================
// Sama seperti handlerData: di Railway set DATA_DIR=/data agar
// config.json tersimpan di volume permanen.
const DATA_FILE_NAME = "config.json";
const dataDir = process.env.DATA_DIR && process.env.DATA_DIR.trim() !== ""
    ? process.env.DATA_DIR
    : __dirname;
const configPath = path.join(dataDir, DATA_FILE_NAME);

// Nilai default = ID yang sebelumnya di-hardcode di commands
const DEFAULT_CONFIG = Object.freeze({
    handlerRoleId: "1434214694503055552",   // Role handler (cek di /join, /take, /done)
    takeLogChannelId: "1472619243005546701", // Channel log saat /take
    doneLogChannelId: "1472619337893282033", // Channel log saat /done
    rankingChannelId: "1472669808964276274"  // Channel leaderboard /ranking
});

const ALLOWED_KEYS = Object.keys(DEFAULT_CONFIG);
const DISCORD_ID_PATTERN = /^\d{5,25}$/;

let config = { ...DEFAULT_CONFIG };

// ================= LOAD =================
function loadConfig() {
    try {
        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
            config = { ...DEFAULT_CONFIG };
            return;
        }

        const raw = fs.readFileSync(configPath, "utf-8");
        const obj = raw ? JSON.parse(raw) : {};

        // Merge dengan default agar key baru tetap ada
        config = { ...DEFAULT_CONFIG };
        for (const key of ALLOWED_KEYS) {
            if (typeof obj[key] === "string" && DISCORD_ID_PATTERN.test(obj[key])) {
                config[key] = obj[key];
            }
        }
    } catch (err) {
        console.error("LOAD CONFIG ERROR:", err);
        config = { ...DEFAULT_CONFIG };
    }
}

// ================= SAVE =================
function saveConfig() {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (err) {
        console.error("SAVE CONFIG ERROR:", err);
    }
}

// ================= GETTER =================
function getConfig() {
    return { ...config };
}

// ================= UPDATE =================
/**
 * Update config (hanya key yang diizinkan, validasi format ID Discord).
 * @param {Record<string, unknown>} partial
 * @returns {Record<string, string>} config baru
 * @throws {Error} jika ada ID tidak valid
 */
function updateConfig(partial) {
    const updated = { ...config };

    for (const key of ALLOWED_KEYS) {
        if (partial[key] === undefined) continue;

        const value = String(partial[key]).trim();
        if (!DISCORD_ID_PATTERN.test(value)) {
            throw new Error(`ID tidak valid untuk "${key}" (harus angka ID Discord).`);
        }
        updated[key] = value;
    }

    config = updated;
    saveConfig();
    console.log("⚙️ Config diupdate:", JSON.stringify(config));
    return getConfig();
}

// ================= INIT =================
loadConfig();

module.exports = {
    ALLOWED_KEYS,
    loadConfig,
    getConfig,
    updateConfig
};
