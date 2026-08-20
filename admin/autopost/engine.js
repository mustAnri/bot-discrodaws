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
                    }
                } catch (err) {
                    log("error", `Error posting ke ${ch.id}: ${err.message}`);
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
    getStatuses
};
