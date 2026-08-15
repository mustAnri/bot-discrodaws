// ================= LOG STORE =================
// Menangkap console.log/warn/error ke ring buffer agar bisa
// dibaca live dari admin panel web (tab SYSTEM).
const MAX_ENTRIES = 400;
const MAX_MSG_LENGTH = 2000;

const entries = [];
let hooked = false;

function formatArg(arg) {
    if (typeof arg === "string") return arg;
    if (arg instanceof Error) return arg.stack || arg.message;
    try {
        return JSON.stringify(arg);
    } catch {
        return String(arg);
    }
}

function push(level, args) {
    entries.push({
        ts: new Date().toISOString(),
        level,
        msg: args.map(formatArg).join(" ").slice(0, MAX_MSG_LENGTH)
    });
    if (entries.length > MAX_ENTRIES) {
        entries.splice(0, entries.length - MAX_ENTRIES);
    }
}

/**
 * Pasang hook ke console (panggil sekali, di awal index.js).
 * Output asli tetap diteruskan ke stdout (log Railway).
 */
function hookConsole() {
    if (hooked) return;
    hooked = true;

    const original = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error
    };

    console.log = (...args) => { push("INFO", args); original.log(...args); };
    console.info = (...args) => { push("INFO", args); original.info(...args); };
    console.warn = (...args) => { push("WARN", args); original.warn(...args); };
    console.error = (...args) => { push("ERROR", args); original.error(...args); };
}

/**
 * Ambil log. Jika `after` (ISO timestamp) diberikan, hanya entry setelahnya.
 * @param {string|null} after
 * @returns {Array<{ts: string, level: string, msg: string}>}
 */
function getLogs(after = null) {
    if (!after) return entries.slice(-200);
    return entries.filter(e => e.ts > after);
}

function clear() {
    entries.length = 0;
    push("INFO", ["Log dibersihkan dari admin panel."]);
}

module.exports = { hookConsole, getLogs, clear };
