"use strict";

// ============================================================
// Manager worker auto-click — orkestrasi start/stop/status
// semua AutoClickWorker (port manajemen worker InteractiveCLI
// di auto-click.py). Hanya dipakai oleh admin panel web.
// ============================================================

const autoClickAccounts = require("../../Data/autoClickAccounts");
const autoClickConfig = require("./config");
const { AutoClickWorker } = require("./worker");
const acLogStore = require("./logStore");

/** @type {Map<string, AutoClickWorker>} */
const workers = new Map(); // nama akun -> worker

// ================= HELPERS =================
function onWorkerStatus(name, status) {
    console.log(`[AutoClick:${name}] status: ${status}`);
}

function isWorkerActive(name) {
    const worker = workers.get(name);
    return Boolean(worker && (worker.running || worker.starting));
}

// ================= LIFECYCLE =================
/**
 * Start worker untuk satu akun.
 * @param {string} name
 * @returns {Promise<void>}
 * @throws {Error} jika akun tidak ditemukan / sudah running
 */
async function startWorker(name) {
    const account = autoClickAccounts.getAccount(name);
    if (!account) throw new Error(`Akun "${name}" tidak ditemukan.`);
    if (isWorkerActive(name)) throw new Error(`Worker "${name}" sudah running.`);

    const worker = new AutoClickWorker(
        name,
        account.token,
        account.channel_id,
        autoClickConfig.getConfig(),
        onWorkerStatus
    );
    workers.set(name, worker);
    acLogStore.push("INFO", `▶ Start diminta untuk worker "${name}"`);

    // Async, jangan blokir response — status di-poll lewat /api/autoclick/status
    worker.start().catch((err) => {
        console.error(`[AutoClick:${name}] start error:`, err);
    });
}

/**
 * Stop worker satu akun.
 * @param {string} name
 * @returns {Promise<boolean>} true jika worker aktif dan dihentikan
 */
async function stopWorker(name) {
    const worker = workers.get(name);
    if (!worker) return false;
    acLogStore.push("INFO", `⏹ Stop diminta untuk worker "${name}"`);
    await worker.stop();
    return true;
}

/** Start semua akun yang terdaftar. */
async function startAll() {
    const accounts = autoClickAccounts.getAllAccounts();
    let started = 0;
    for (const name of Object.keys(accounts)) {
        if (isWorkerActive(name)) continue;
        try {
            await startWorker(name);
            started += 1;
        } catch (err) {
            console.error(`[AutoClick] startAll gagal untuk "${name}": ${err.message}`);
        }
    }
    acLogStore.push("INFO", `▶ START ALL: ${started} worker dimulai`);
    return started;
}

/** Stop semua worker aktif. */
async function stopAll() {
    let stopped = 0;
    for (const [name, worker] of workers) {
        if (worker.running || worker.starting) {
            await worker.stop();
            stopped += 1;
        }
    }
    acLogStore.push("INFO", `⏹ STOP ALL: ${stopped} worker dihentikan`);
    return stopped;
}

// ================= LIVE UPDATE =================
/** Terapkan config baru ke semua worker yang sedang running. */
function applyConfigToWorkers() {
    const cfg = autoClickConfig.getConfig();
    let applied = 0;
    for (const [name, worker] of workers) {
        if (worker.running) {
            worker.applyConfig(cfg);
            applied += 1;
            console.log(`[AutoClick:${name}] config baru diterapkan (live)`);
        }
    }
    acLogStore.push("INFO", `⚙️ Pengaturan baru diterapkan ke ${applied} worker running`);
}

/**
 * Update channel akun; jika worker-nya running, terapkan live.
 * @param {string} name
 * @param {string} channelId
 */
function setWorkerChannelLive(name, channelId) {
    const worker = workers.get(name);
    if (worker && worker.running) {
        worker.channelId = channelId;
        worker.lastMessageId = null; // reset agar fetch ulang tidak skip
        worker.addLog(`📺 Channel dipantau diubah ke ${channelId}`);
    }
}

/**
 * Token akun diganti: worker yang running harus dihentikan karena
 * gateway masih IDENTIFY dengan token lama.
 * @param {string} name
 */
async function stopWorkerForTokenChange(name) {
    const worker = workers.get(name);
    if (worker && (worker.running || worker.starting)) {
        await worker.stop();
        worker.addLog("🔑 Token diganti — worker dihentikan, start ulang untuk memakai token baru.");
    }
}

// ================= DASHBOARD =================
/**
 * Payload dashboard: daftar akun + status worker + statistik + log terakhir.
 * Token TIDAK pernah dikirim penuh — selalu di-mask.
 */
function getDashboard() {
    const accounts = autoClickAccounts.getAllAccounts();

    return Object.entries(accounts).map(([name, account]) => {
        const worker = workers.get(name);
        const active = Boolean(worker && (worker.running || worker.starting));

        return {
            name,
            channelId: account.channel_id,
            tokenMasked: autoClickAccounts.maskToken(account.token),
            running: active,
            status: worker ? worker.status : "🔴 Stopped",
            stats: worker ? worker.getStats() : null,
            logs: worker ? worker.logs.slice(-12) : []
        };
    });
}

module.exports = {
    startWorker,
    stopWorker,
    startAll,
    stopAll,
    applyConfigToWorkers,
    setWorkerChannelLive,
    stopWorkerForTokenChange,
    isWorkerActive,
    getDashboard
};
