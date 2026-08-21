/**
 * Data/autopostStore.js
 *
 * Persistensi konfigurasi AutoPost per-user (port dari anri autopost-store.js).
 * Pola: cache sync + writeFileSync (sama seperti Data/config.js & handlerData.js).
 *
 * Shape file Data/autopost-store.json:
 * {
 *   users: {
 *     [userId]: {
 *       username: string,          // username Discord untuk label di web panel
 *       token: string,             // token user Discord (tidak pernah dikirim penuh ke web)
 *       channels: [{ id, message, interval }]   // interval dalam detik
 *     }
 *   },
 *   privateRooms: {
 *     [roomId]: { userId, channelId, createdAt, panelMessageId? }
 *   },
 *   settings: {
 *     bannerUrl: string,           // URL gambar banner panel (kosong = avatar bot)
 *     whitelistRoleId: string      // role yang boleh memakai panel AutoPost (kosong = semua orang)
 *   }
 * }
 */

const fs = require("fs");
const path = require("path");

// Sama seperti handlerData/config: di Railway set DATA_DIR=/data agar
// file JSON disimpan di volume permanen. Lokal: file di folder Data/.
const DATA_FILE_NAME = "autopost-store.json";
const dataDir = process.env.DATA_DIR && process.env.DATA_DIR.trim() !== ""
    ? process.env.DATA_DIR
    : __dirname;
const STORE_PATH = path.join(dataDir, DATA_FILE_NAME);
const seedPath = path.join(__dirname, DATA_FILE_NAME);
const DEFAULT_USER = { username: "", token: "", channels: [] };
const DEFAULT_SETTINGS = { bannerUrl: "", whitelistRoleId: "", setupRoleId: "" };

// Salin data bawaan ke volume saat pertama kali deploy (jika ada & volume kosong)
function seedInitialData() {
    try {
        if (!fs.existsSync(STORE_PATH) && fs.existsSync(seedPath)) {
            fs.copyFileSync(seedPath, STORE_PATH);
            console.log(`📦 Data awal disalin ke volume: ${STORE_PATH}`);
        }
    } catch (err) {
        console.error("SEED DATA ERROR:", err);
    }
}
seedInitialData();

let cache = loadStore();

function loadStore() {
    try {
        const raw = fs.readFileSync(STORE_PATH, "utf8");
        const parsed = JSON.parse(raw);
        return {
            users: parsed.users || {},
            privateRooms: parsed.privateRooms || {},
            settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) }
        };
    } catch (err) {
        // File belum ada / korup — mulai dari struktur kosong.
        return { users: {}, privateRooms: {}, settings: { ...DEFAULT_SETTINGS } };
    }
}

function saveStore() {
    fs.writeFileSync(STORE_PATH, JSON.stringify(cache, null, 2), "utf8");
}

// ================= USER CONFIG =================

/**
 * Ambil config user (auto-create default jika belum ada).
 * @param {string} userId
 * @returns {{username: string, token: string, channels: Array}}
 */
function getUserConfig(userId) {
    if (!cache.users[userId]) {
        cache.users[userId] = { ...DEFAULT_USER, channels: [] };
        saveStore();
    }
    return cache.users[userId];
}

/**
 * Ambil config user TANPA auto-create (untuk listing di web).
 * @param {string} userId
 * @returns {object|null}
 */
function peekUserConfig(userId) {
    return cache.users[userId] || null;
}

/**
 * Simpan config user secara penuh.
 * @param {string} userId
 * @param {{username?: string, token?: string, channels?: Array}} config
 */
function setUserConfig(userId, config) {
    const existing = getUserConfig(userId);
    cache.users[userId] = {
        username: typeof config.username === "string" ? config.username : existing.username,
        token: typeof config.token === "string" ? config.token : existing.token,
        channels: Array.isArray(config.channels) ? config.channels : existing.channels
    };
    saveStore();
    return cache.users[userId];
}

/**
 * Tambah channel ke config user.
 * @param {string} userId
 * @param {{id: string, message: string, interval: number}} channelData
 * @returns {boolean} false jika channel sudah ada (duplikat)
 */
function addChannel(userId, channelData) {
    const config = getUserConfig(userId);
    if (config.channels.some((ch) => ch.id === channelData.id)) return false;
    config.channels.push(channelData);
    saveStore();
    return true;
}

/**
 * Update field channel yang sudah ada (mutasi in-place pada objek channel).
 * Mutasi in-place disengaja: loop engine yang sedang berjalan memegang
 * referensi objek channel yang sama dan membaca ulang `ch.message` tiap
 * iterasi, sehingga pesan baru langsung dipakai tanpa restart AutoPost.
 * @param {string} userId
 * @param {string} channelId
 * @param {{message?: string, interval?: number}} partial
 * @returns {boolean} false jika channel tidak ditemukan
 */
function updateChannel(userId, channelId, partial = {}) {
    const config = getUserConfig(userId);
    const channel = config.channels.find((ch) => ch.id === channelId);
    if (!channel) return false;
    if (typeof partial.message === "string" && partial.message.trim() !== "") {
        channel.message = partial.message;
    }
    if (typeof partial.interval === "number" && Number.isFinite(partial.interval) && partial.interval > 0) {
        channel.interval = partial.interval;
    }
    saveStore();
    return true;
}

/**
 * Hapus channel dari config user.
 * @param {string} userId
 * @param {string} channelId
 * @returns {boolean}
 */
function removeChannel(userId, channelId) {
    const config = getUserConfig(userId);
    const before = config.channels.length;
    config.channels = config.channels.filter((ch) => ch.id !== channelId);
    if (config.channels.length === before) return false;
    saveStore();
    return true;
}

/**
 * Set username saja (dipanggil saat create room untuk label di web).
 * @param {string} userId
 * @param {string} username
 */
function setUsername(userId, username) {
    const config = getUserConfig(userId);
    config.username = String(username || "");
    saveStore();
}

/** Daftar semua userId yang punya config. */
function getAllUserIds() {
    return Object.keys(cache.users);
}

/**
 * Hapus config user sepenuhnya + semua private room lama miliknya.
 * @param {string} userId
 * @returns {boolean} false jika user memang tidak ada
 */
function deleteUser(userId) {
    if (!cache.users[userId]) return false;
    delete cache.users[userId];
    for (const [roomId, room] of Object.entries(cache.privateRooms)) {
        if (room.userId === userId) delete cache.privateRooms[roomId];
    }
    saveStore();
    return true;
}

// ================= PRIVATE ROOMS =================

/**
 * Buat room private untuk user.
 * @param {string} userId
 * @param {string} roomId format `${userId}-${Date.now()}`
 * @param {string} channelId
 * @param {string} [guildId] ID guild tempat room dibuat (untuk link Discord di web)
 */
function createPrivateRoom(userId, roomId, channelId, guildId) {
    cache.privateRooms[roomId] = {
        userId,
        channelId,
        guildId: guildId || "",
        createdAt: new Date().toISOString()
    };
    saveStore();
}

/** Simpan ID pesan panel di room (untuk refresh/edit). */
function setPanelMessageId(roomId, messageId) {
    if (cache.privateRooms[roomId]) {
        cache.privateRooms[roomId].panelMessageId = messageId;
        saveStore();
    }
}

/** @param {string} roomId */
function getPrivateRoom(roomId) {
    return cache.privateRooms[roomId] || null;
}

/** @param {string} roomId */
function deletePrivateRoom(roomId) {
    if (!cache.privateRooms[roomId]) return false;
    delete cache.privateRooms[roomId];
    saveStore();
    return true;
}

/**
 * Cari room milik user (scan linear — jumlah room sedikit).
 * @param {string} userId
 * @returns {{roomId: string, userId: string, channelId: string, panelMessageId?: string}|null}
 */
function getUserRoom(userId) {
    for (const [roomId, room] of Object.entries(cache.privateRooms)) {
        if (room.userId === userId) return { roomId, ...room };
    }
    return null;
}

/** Daftar semua room (untuk web panel). */
function getAllRooms() {
    return Object.entries(cache.privateRooms).map(([roomId, room]) => ({ roomId, ...room }));
}

// ================= SETTINGS (banner + whitelist) =================

/** @returns {{bannerUrl: string, whitelistRoleId: string, setupRoleId: string}} */
function getSettings() {
    return { ...DEFAULT_SETTINGS, ...cache.settings };
}

/**
 * Simpan settings global AutoPost.
 * @param {{bannerUrl?: string, whitelistRoleId?: string, setupRoleId?: string}} partial
 */
function setSettings(partial = {}) {
    cache.settings = {
        bannerUrl: typeof partial.bannerUrl === "string" ? partial.bannerUrl.trim().slice(0, 500) : cache.settings.bannerUrl,
        whitelistRoleId: typeof partial.whitelistRoleId === "string" ? partial.whitelistRoleId.trim().slice(0, 25) : cache.settings.whitelistRoleId,
        setupRoleId: typeof partial.setupRoleId === "string" ? partial.setupRoleId.trim().slice(0, 25) : cache.settings.setupRoleId
    };
    saveStore();
    return getSettings();
}

module.exports = {
    getUserConfig,
    peekUserConfig,
    setUserConfig,
    addChannel,
    updateChannel,
    removeChannel,
    setUsername,
    getAllUserIds,
    deleteUser,
    createPrivateRoom,
    setPanelMessageId,
    getPrivateRoom,
    deletePrivateRoom,
    getUserRoom,
    getAllRooms,
    getSettings,
    setSettings
};
