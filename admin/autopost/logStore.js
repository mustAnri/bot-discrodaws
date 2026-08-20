/**
 * admin/autopost/logStore.js
 *
 * Ring buffer log khusus AutoPost (pola sama seperti admin/autoclick/logStore.js).
 * Log disimpan in-memory, ditangkap oleh hookConsole di index.js via prefix [AUTOPOST].
 */

const MAX_ENTRIES = 400;
const logs = [];

/**
 * Tambah satu entri log.
 * @param {string} level info|warn|error
 * @param {string} msg
 */
function push(level, msg) {
    logs.push({ ts: new Date().toISOString(), level, msg });
    if (logs.length > MAX_ENTRIES) logs.splice(0, logs.length - MAX_ENTRIES);
}

/**
 * Ambil log, dengan dukungan delta polling (kirim timestamp terakhir via `after`).
 * @param {string|null} after ISO timestamp — hanya kembalikan entri setelah ini
 * @returns {Array}
 */
function getLogs(after = null) {
    if (!after) return [...logs];
    return logs.filter((entry) => entry.ts > after);
}

function clear() {
    logs.length = 0;
}

module.exports = { push, getLogs, clear };
