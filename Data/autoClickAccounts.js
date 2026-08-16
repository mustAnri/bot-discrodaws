const fs = require("fs");
const path = require("path");

// ================= LOKASI DATA =================
// Sama seperti config/handlerData: di Railway set DATA_DIR=/data agar
// autoclick-accounts.json tersimpan di volume permanen.
const DATA_FILE_NAME = "autoclick-accounts.json";
const dataDir = process.env.DATA_DIR && process.env.DATA_DIR.trim() !== ""
    ? process.env.DATA_DIR
    : __dirname;
const accountsPath = path.join(dataDir, DATA_FILE_NAME);

const DEFAULT_CHANNEL_ID = "1243177096948486186";
const NAME_PATTERN = /^[A-Za-z0-9_-]{2,32}$/;
const DISCORD_ID_PATTERN = /^\d{5,25}$/;

/** @type {Record<string, {token: string, channel_id: string}>} */
let accounts = {};

// ================= UTIL =================
/** Normalisasi token: buang spasi & tanda kutip yang ikut ter-paste. */
function normalizeToken(token) {
    return String(token || "").replace(/['"]/g, "").trim();
}

function maskToken(token) {
    const t = String(token || "");
    if (t.length <= 10) return "********";
    return `${t.slice(0, 6)}...${t.slice(-4)}`;
}

// ================= LOAD / SAVE =================
function loadAccounts() {
    try {
        if (!fs.existsSync(accountsPath)) {
            accounts = {};
            return;
        }
        const raw = fs.readFileSync(accountsPath, "utf-8");
        const obj = raw ? JSON.parse(raw) : {};
        accounts = {};
        for (const [name, data] of Object.entries(obj)) {
            if (!data || typeof data !== "object") continue;
            const token = normalizeToken(data.token);
            if (!token) continue;
            const channelId = DISCORD_ID_PATTERN.test(String(data.channel_id || ""))
                ? String(data.channel_id)
                : DEFAULT_CHANNEL_ID;
            accounts[name] = { token, channel_id: channelId };
        }
    } catch (err) {
        console.error("LOAD AUTOCLICK ACCOUNTS ERROR:", err);
        accounts = {};
    }
}

function saveAccounts() {
    try {
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(accountsPath, JSON.stringify(accounts, null, 2));
    } catch (err) {
        console.error("SAVE AUTOCLICK ACCOUNTS ERROR:", err);
    }
}

// ================= CRUD =================
/**
 * Tambah/replace akun.
 * @param {string} name
 * @param {string} token
 * @param {string} [channelId]
 * @returns {{token: string, channel_id: string}} data akun tersimpan
 * @throws {Error} jika nama/token/channel tidak valid
 */
function addAccount(name, token, channelId) {
    name = String(name || "").trim();
    if (!NAME_PATTERN.test(name)) {
        throw new Error('Nama akun tidak valid (2-32 karakter, hanya huruf/angka/_/-).');
    }

    const cleanToken = normalizeToken(token);
    if (cleanToken.length < 20) {
        throw new Error("Token terlalu pendek / tidak valid.");
    }

    let channel = String(channelId || "").trim();
    if (!channel) channel = DEFAULT_CHANNEL_ID;
    if (!DISCORD_ID_PATTERN.test(channel)) {
        throw new Error("Channel ID tidak valid (harus angka ID Discord).");
    }

    accounts[name] = { token: cleanToken, channel_id: channel };
    saveAccounts();
    return { ...accounts[name] };
}

/**
 * Update akun yang sudah ada (token dan/atau channel).
 * @param {string} name
 * @param {{token?: string, channelId?: string}} partial
 * @returns {{token: string, channel_id: string}}
 * @throws {Error} jika akun tidak ditemukan / data tidak valid
 */
function updateAccount(name, partial) {
    if (!accounts[name]) throw new Error(`Akun "${name}" tidak ditemukan.`);

    if (partial.token !== undefined && String(partial.token).trim() !== "") {
        const cleanToken = normalizeToken(partial.token);
        if (cleanToken.length < 20) throw new Error("Token terlalu pendek / tidak valid.");
        accounts[name].token = cleanToken;
    }

    if (partial.channelId !== undefined && String(partial.channelId).trim() !== "") {
        const channel = String(partial.channelId).trim();
        if (!DISCORD_ID_PATTERN.test(channel)) {
            throw new Error("Channel ID tidak valid (harus angka ID Discord).");
        }
        accounts[name].channel_id = channel;
    }

    saveAccounts();
    return { ...accounts[name] };
}

/**
 * Hapus akun.
 * @param {string} name
 * @returns {boolean} true jika akun ada dan dihapus
 */
function removeAccount(name) {
    if (!accounts[name]) return false;
    delete accounts[name];
    saveAccounts();
    return true;
}

/** Salinan semua akun (token ikut — hanya untuk pemakaian internal server). */
function getAllAccounts() {
    return JSON.parse(JSON.stringify(accounts));
}

/**
 * Ambil satu akun.
 * @param {string} name
 * @returns {{token: string, channel_id: string} | null}
 */
function getAccount(name) {
    const acc = accounts[name];
    return acc ? { ...acc } : null;
}

// ================= INIT =================
loadAccounts();

module.exports = {
    DEFAULT_CHANNEL_ID,
    NAME_PATTERN,
    maskToken,
    addAccount,
    updateAccount,
    removeAccount,
    getAllAccounts,
    getAccount
};
