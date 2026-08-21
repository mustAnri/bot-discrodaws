/**
 * admin/autopost/engine.js
 *
 * Mesin posting AutoPost (port dari anri autopost-builder.js bagian engine).
 * Per user: satu object poster berisi Promise loop per channel.
 * Stop = delete entry -> loop while() berhenti di iterasi berikutnya.
 */

const store = require("../../Data/autopostStore");
const logStore = require("./logStore");

const activePosters = {}; // userId -> { channelId: Promise }

// ─── Notifikasi error ke user via DM ────────────────────────────────────────
// client di-set dari index.js setelah login (setClient). Cooldown supaya user
// tidak di-spam DM setiap interval kalau errornya berulang.

let discordClient = null;
const lastErrorNotify = {}; // userId -> timestamp ms
const NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;

/** Simpan referensi discord client untuk kirim DM notifikasi error. */
function setClient(client) {
    discordClient = client;
}

async function notifyUser(userId, text) {
    if (!discordClient) return;
    try {
        await discordClient.users.send(userId, text);
    } catch (err) {
        log("warn", `Tidak bisa kirim DM error ke ${userId} (DM tertutup?): ${err.message}`);
    }
}

const STATUS_HINTS = {
    403: "Token tidak punya izin kirim ke channel tersebut.",
    404: "Channel tidak ditemukan (mungkin sudah dihapus).",
    429: "Rate limit Discord — tunggu, pesan akan dikirim lagi sesuai interval."
};

/** DM error sekali per cooldown (5 menit) per user. status 0 = network error. */
async function notifyError(userId, channelId, status) {
    const now = Date.now();
    if (lastErrorNotify[userId] && now - lastErrorNotify[userId] < NOTIFY_COOLDOWN_MS) return;
    lastErrorNotify[userId] = now;
    const hint =
        status === 0
            ? "Gagal koneksi ke Discord (network error / timeout)."
            : STATUS_HINTS[status] || `Respons HTTP ${status} dari Discord.`;
    const headline =
        status === 0
            ? "Gagal mengirim pesan ke channel <#" + channelId + "> — **network error**."
            : "Gagal mengirim pesan ke channel <#" + channelId + "> — **HTTP " + status + "**.";
    await notifyUser(userId, [
        "⚠️ **AutoPost Error**",
        headline,
        `> ${hint}`,
        "AutoPost masih berjalan. Perbarui konfigurasi lewat panel jika error terus berlanjut."
    ].join("\n"));
}

/** Kirim pesan ke channel via REST Discord memakai token USER. */
async function sendViaUserToken(token, channelId, message) {
    const res = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
            method: "POST",
            headers: {
                Authorization: token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ content: message })
        }
    );
    return res.status;
}

function log(level, msg) {
    console.log(`[AUTOPOST] ${msg}`);
    logStore.push(level, msg);
}

/**
 * Mulai loop posting untuk user. No-op jika sudah aktif / belum ada channel / tanpa token.
 * @param {string} userId
 * @returns {boolean} true jika berhasil start
 */
function startAutoPost(userId) {
    if (activePosters[userId]) return false;

    const config = store.getUserConfig(userId);
    if (config.channels.length === 0) return false;
    if (!config.token) return false;

    activePosters[userId] = {};
    const label = config.username || userId;
    log("info", `▶️ AutoPost START untuk user ${label} (${config.channels.length} channel)`);

    for (const ch of config.channels) {
        const post = async () => {
            while (activePosters[userId]) {
                try {
                    const status = await sendViaUserToken(config.token, ch.id, ch.message);
                    if (status !== 200 && status !== 204) {
                        log("error", `Gagal post ke ${ch.id}: HTTP ${status}`);

                        // 401 = token tidak valid → tidak ada gunanya lanjut.
                        // Hentikan semua loop dan langsung kabari user via DM.
                        if (status === 401) {
                            stopAutoPost(userId);
                            await notifyUser(userId, [
                                "🚫 **AutoPost Dihentikan — Token Tidak Valid (401)**",
                                "Token Discord kamu ditolak saat mengirim pesan ke <#" + ch.id + ">.",
                                "Semua posting untuk akunmu sudah dihentikan otomatis.",
                                "Perbarui token lewat panel AutoPost lalu tekan Start lagi."
                            ].join("\n"));
                            return;
                        }

                        await notifyError(userId, ch.id, status);
                    }
                } catch (err) {
                    log("error", `Error posting ke ${ch.id}: ${err.message}`);
                    await notifyError(userId, ch.id, 0);
                }
                if (!activePosters[userId]) break;
                await new Promise((resolve) => setTimeout(resolve, ch.interval * 1000));
            }
        };
        activePosters[userId][ch.id] = post();
    }
    return true;
}

/**
 * Hentikan semua loop posting user.
 * @param {string} userId
 * @returns {boolean} true jika sebelumnya aktif
 */
function stopAutoPost(userId) {
    if (!activePosters[userId]) return false;
    delete activePosters[userId];
    delete lastErrorNotify[userId]; // reset cooldown supaya error berikutnya langsung di-DM lagi
    const config = store.peekUserConfig(userId);
    const label = (config && config.username) || userId;
    log("info", `⏹️ AutoPost STOP untuk user ${label}`);
    return true;
}

/** @param {string} userId */
function isAutoPostActive(userId) {
    return !!activePosters[userId];
}

/**
 * Status semua user yang pernah punya config (untuk dashboard web).
 * @returns {Array<{userId: string, username: string, running: boolean, channelCount: number, hasToken: boolean}>}
 */
function getStatuses() {
    return store.getAllUserIds().map((userId) => {
        const config = store.peekUserConfig(userId) || { username: "", token: "", channels: [] };
        return {
            userId,
            username: config.username || "",
            running: isAutoPostActive(userId),
            channelCount: config.channels.length,
            hasToken: Boolean(config.token)
        };
    });
}

module.exports = {
    startAutoPost,
    stopAutoPost,
    isAutoPostActive,
    getStatuses,
    setClient
};
