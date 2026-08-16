"use strict";

// ============================================================
// AUTO VERIF LOG STORE
// Ring buffer log khusus worker auto verif (auto-click) —
// terpisah dari log server umum (admin/logStore.js).
// Ditampilkan live di tab AUTO VERIF admin panel web.
// ============================================================

const MAX_ENTRIES = 400;
const MAX_MSG_LENGTH = 2000;

const entries = [];

/**
 * Tambah satu entry log.
 * @param {"INFO"|"WARN"|"ERROR"} level
 * @param {string} msg
 */
function push(level, msg) {
    entries.push({
        ts: new Date().toISOString(),
        level,
        msg: String(msg).slice(0, MAX_MSG_LENGTH)
    });
    if (entries.length > MAX_ENTRIES) {
        entries.splice(0, entries.length - MAX_ENTRIES);
    }
}

/**
 * Ambil log. Jika `after` (ISO timestamp) diberikan, hanya entry setelahnya.
 * @param {string|null} after
 * @returns {Array<{ts: string, level: string, msg: string}>}
 */
function getLogs(after = null) {
    if (!after) return entries.slice(-200);
    return entries.filter((e) => e.ts > after);
}

function clear() {
    entries.length = 0;
    push("INFO", "Log auto verif dibersihkan dari admin panel.");
}

module.exports = { push, getLogs, clear };
