const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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

// ================= ENKRIPSI TOKEN =================
// Hash satu arah TIDAK mungkin: worker butuh token asli untuk login ke Discord.
// Solusinya: enkripsi at-rest AES-256-GCM. Jika env AC_ENC_KEY diisi, token di
// file disimpan sebagai "enc:v1:<iv>:<authTag>:<data>" (base64). Jika AC_ENC_KEY
// tidak diset, perilaku lama (plaintext) dipertahankan agar tidak memecah
// instalasi yang sudah ada.
const ENC_PREFIX = "enc:v1:";

function getEncryptionKey() {
    const raw = (process.env.AC_ENC_KEY || "").trim();
    if (!raw) return null;
    return crypto.createHash("sha256").update(raw).digest(); // 32 byte
}

function isEncryptionEnabled() {
    return getEncryptionKey() !== null;
}

function encryptToken(plain) {
    const key = getEncryptionKey();
    if (!key) return plain;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return ENC_PREFIX + [
        iv.toString("base64"),
        authTag.toString("base64"),
        encrypted.toString("base64")
    ].join(":");
}

function decryptToken(stored) {
    if (typeof stored !== "string" || !stored.startsWith(ENC_PREFIX)) return stored;
    const key = getEncryptionKey();
    if (!key) {
        console.error("DECRYPT GAGAL: token tersimpan terenkripsi tapi AC_ENC_KEY belum diset di env.");
        return "";
    }
    try {
        const [ivB64, tagB64, dataB64] = stored.slice(ENC_PREFIX.length).split(":");
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
        decipher.setAuthTag(Buffer.from(tagB64, "base64"));
        return Buffer.concat([
            decipher.update(Buffer.from(dataB64, "base64")),
            decipher.final()
        ]).toString("utf8");
    } catch (err) {
        console.error("DECRYPT TOKEN GAGAL (AC_ENC_KEY salah / data korup?):", err.message);
        return "";
    }
}

/** @type {Record<string, {token: string, channel_id: string}>} */
let accounts = {};

// ================= UTIL =================
/** Normalisasi token: buang spasi & tanda kutip yang ikut ter-paste. */
function normalizeToken(token) {
    return String(token || "").replace(/['"]/g, "").trim();
}

/**
 * Masker token untuk tampilan UI/API.
 * Token sensitif → TIDAK ada karakter asli yang ditampilkan sama sekali,
 * hanya indikator bahwa token sudah terisi. (Jangan pernah mengekspos
 * potongan token asli di frontend, karena web dipakai rame-rame.)
 */
function maskToken(token) {
    const t = String(token || "");
    if (!t) return "(belum diisi)";
    return "••••••••••••••••";
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
            const storedToken = normalizeToken(data.token);
            if (!storedToken) continue;
            const token = decryptToken(storedToken);
            const channelId = DISCORD_ID_PATTERN.test(String(data.channel_id || ""))
                ? String(data.channel_id)
                : DEFAULT_CHANNEL_ID;
            // Jika decrypt gagal (token = ""), akun tetap dimuat supaya terlihat
            // di dashboard dan bisa di-edit ulang lewat panel.
            accounts[name] = { token: token || "", channel_id: channelId };
        }
    } catch (err) {
        console.error("LOAD AUTOCLICK ACCOUNTS ERROR:", err);
        accounts = {};
    }
}

function saveAccounts() {
    try {
        fs.mkdirSync(dataDir, { recursive: true });
        // Token dienkripsi saat ditulis (no-op jika AC_ENC_KEY tidak diset).
        const toWrite = {};
        for (const [name, acc] of Object.entries(accounts)) {
            toWrite[name] = { ...acc, token: encryptToken(acc.token) };
        }
        fs.writeFileSync(accountsPath, JSON.stringify(toWrite, null, 2));
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
    isEncryptionEnabled,
    addAccount,
    updateAccount,
    removeAccount,
    getAllAccounts,
    getAccount
};
