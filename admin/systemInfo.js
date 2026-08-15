const os = require("os");
const https = require("https");

// ================= SPEED TEST =================
// Download file uji dari CDN Cloudflare dan ukur throughput-nya.
// Endpoint yang mengembalikan 25 MB; cukup kecil & stabil untuk cek kasar.
const SPEED_TEST_URL = "https://speed.cloudflare.com/__down?bytes=25000000";
const SPEED_TIMEOUT_MS = 20000;

/**
 * Ukur kecepatan download (Mbps) dan latensi (ms).
 * @returns {Promise<{downMbps: number, latencyMs: number|null, downloadedBytes: number, elapsedMs: number}>}
 */
function runSpeedTest() {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        let downloadedBytes = 0;
        let firstByteAt = null;

        const req = https.get(SPEED_TEST_URL, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }

            res.on("data", (chunk) => {
                if (firstByteAt === null) firstByteAt = Date.now();
                downloadedBytes += chunk.length;
            });

            res.on("end", () => {
                const elapsedMs = Date.now() - startedAt;
                const latencyMs = firstByteAt ? firstByteAt - startedAt : null;
                const downMbps = elapsedMs > 0
                    ? (downloadedBytes * 8) / (elapsedMs / 1000) / 1e6
                    : 0;
                resolve({
                    downMbps: Number(downMbps.toFixed(2)),
                    latencyMs,
                    downloadedBytes,
                    elapsedMs
                });
            });
        });

        req.on("error", reject);
        req.setTimeout(SPEED_TIMEOUT_MS, () => {
            req.destroy(new Error("Speed test timeout (20 detik)."));
        });
    });
}

/**
 * Tes latensi ringan ke Discord API (tanpa butuh token khusus).
 * @returns {Promise<number|null>} ms, atau null jika gagal
 */
async function pingDiscord() {
    return new Promise((resolve) => {
        const startedAt = Date.now();
        const req = https.get("https://discord.com/api/v10/gateway", (res) => {
            res.resume();
            resolve(Date.now() - startedAt);
        });
        req.on("error", () => resolve(null));
        req.setTimeout(8000, () => {
            req.destroy();
            resolve(null);
        });
    });
}

// ================= SERVER INFO =================
/**
 * Info spesifikasi & status server saat ini.
 * @param {object} opts { processUptime, guildCount }
 */
function getSystemInfo(opts = {}) {
    const load = os.loadavg();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const mem = process.memoryUsage();

    return {
        host: {
            platform: `${os.type()} ${os.release()}`,
            arch: os.arch(),
            hostname: os.hostname(),
            node: process.version,
            cpus: os.cpus().length,
            cpuModel: (os.cpus()[0] && os.cpus()[0].model) || "unknown",
            cpuLoad1m: Number(load[0].toFixed(2)),
            totalMemBytes: totalMem,
            freeMemBytes: freeMem,
            totalMemGB: Number((totalMem / 1e9).toFixed(2)),
            freeMemGB: Number((freeMem / 1e9).toFixed(2))
        },
        process: {
            pid: process.pid,
            uptimeSec: Math.floor(opts.processUptime ?? process.uptime()),
            rssMB: Number((mem.rss / 1e6).toFixed(1)),
            heapUsedMB: Number((mem.heapUsed / 1e6).toFixed(1)),
            heapTotalMB: Number((mem.heapTotal / 1e6).toFixed(1)),
            externalMB: Number((mem.external / 1e6).toFixed(1))
        },
        bot: {
            guildCount: opts.guildCount ?? null,
            ready: Boolean(opts.ready)
        }
    };
}

// ================= CLEAR MEMORY =================
/**
 * Bersihkan memori sebisa mungkin:
 * - paksa GC jika dijalankan dengan --expose-gc
 * - bersihkan cache module yang aman (tidak disarankan untuk app code)
 * @returns {{gcRan: boolean, heapBeforeMB: number, heapAfterMB: number}}
 */
function clearMemory() {
    const heapBeforeMB = Number((process.memoryUsage().heapUsed / 1e6).toFixed(1));
    let gcRan = false;

    if (typeof global.gc === "function") {
        global.gc();
        gcRan = true;
    }

    const heapAfterMB = Number((process.memoryUsage().heapUsed / 1e6).toFixed(1));
    return { gcRan, heapBeforeMB, heapAfterMB };
}

module.exports = { getSystemInfo, runSpeedTest, pingDiscord, clearMemory };
