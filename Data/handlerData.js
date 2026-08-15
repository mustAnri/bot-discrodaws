const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");

// ================= LOKASI DATA =================
// Di Railway (atau hosting lain), set DATA_DIR=/data agar file JSON
// disimpan di volume permanen. Lokal: file disimpan di folder Data/.
const DATA_FILE_NAME = "handlerData.json";
const dataDir = process.env.DATA_DIR && process.env.DATA_DIR.trim() !== ""
    ? process.env.DATA_DIR
    : __dirname;
const dataPath = path.join(dataDir, DATA_FILE_NAME);
const seedPath = path.join(__dirname, DATA_FILE_NAME);

// Salin data bawaan ke volume saat pertama kali deploy (jika ada & volume kosong)
function seedInitialData() {
    try {
        if (!fs.existsSync(dataPath) && fs.existsSync(seedPath)) {
            fs.copyFileSync(seedPath, dataPath);
            console.log(`📦 Data awal disalin ke volume: ${dataPath}`);
        }
    } catch (err) {
        console.error("SEED DATA ERROR:", err);
    }
}

let handlers = new Map();
let rankingChannelId = null;
let rankingMessageId = null;

// ================= LOAD DATA =================
function loadData() {
    try {
        if (!fs.existsSync(dataPath)) {
            fs.writeFileSync(
                dataPath,
                JSON.stringify({ handlers: {}, rankingChannelId: null, rankingMessageId: null }, null, 2)
            );
        }

        const raw = fs.readFileSync(dataPath, "utf-8");
        const obj = raw ? JSON.parse(raw) : {};

        handlers.clear();

        if (obj.handlers) {
            for (const [id, value] of Object.entries(obj.handlers)) {
                handlers.set(id, {
                    maxJob: Number(value.maxJob) || 0,
                    currentJob: Number(value.currentJob) || 0,
                    jobs: Array.isArray(value.jobs) ? value.jobs : [],
                    services: Array.isArray(value.services) ? value.services : [],
                    totalDone: Number(value.totalDone) || 0
                });
            }
        }

        rankingChannelId = obj.rankingChannelId || null;
        rankingMessageId = obj.rankingMessageId || null;

    } catch (err) {
        console.error("LOAD DATA ERROR:", err);
    }
}

// ================= SAVE DATA =================
function saveData() {
    try {
        const obj = {
            handlers: Object.fromEntries(handlers),
            rankingChannelId,
            rankingMessageId
        };
        fs.writeFileSync(dataPath, JSON.stringify(obj, null, 2));
    } catch (err) {
        console.error("SAVE DATA ERROR:", err);
    }
}

// ================= HANDLER FUNCTIONS =================
function joinHandler(userId, maxJob) {
    maxJob = Number(maxJob);
    if (!maxJob || maxJob <= 0) return false;

    // Jika user lama ada di JSON, ambil totalDone & services lama
    let oldData = handlers.get(userId);

    handlers.set(userId, {
        maxJob,
        currentJob: 0,
        jobs: [],
        services: oldData ? oldData.services : [],
        totalDone: oldData ? oldData.totalDone : 0
    });

    saveData();
    return true;
}

function getHandler(userId) {
    const data = handlers.get(userId);
    if (!data) return null;

    return {
        ...data,
        currentJob: data.jobs.length
    };
}

function getAllHandlers() {
    return Object.fromEntries(handlers);
}

function removeHandler(userId) {
    const data = handlers.get(userId);
    if (!data) return false;

    // Hapus data kecuali totalDone
    const preserved = {
        totalDone: data.totalDone
    };

    handlers.delete(userId);
    handlers.set(userId, {
        maxJob: 0,
        currentJob: 0,
        jobs: [],
        services: [],
        totalDone: preserved.totalDone
    });

    saveData();
    return true;
}

// ================= ADMIN MANAGEMENT =================
/**
 * Update data handler dari admin panel (maxJob, totalDone, services).
 * Tidak mengubah jobs aktif.
 * @param {string} userId
 * @param {{maxJob?: number, totalDone?: number, services?: string[]}} partial
 * @returns {object|null} data terbaru
 * @throws {Error} jika handler tidak ditemukan / nilai tidak valid
 */
function updateHandler(userId, partial) {
    const data = handlers.get(userId);
    if (!data) throw new Error("Handler tidak ditemukan.");

    if (partial.maxJob !== undefined) {
        const maxJob = Number(partial.maxJob);
        if (!Number.isInteger(maxJob) || maxJob < 0 || maxJob > 5) {
            throw new Error("maxJob harus angka 0-5.");
        }
        data.maxJob = maxJob;
    }

    if (partial.totalDone !== undefined) {
        const totalDone = Number(partial.totalDone);
        if (!Number.isInteger(totalDone) || totalDone < 0) {
            throw new Error("totalDone harus angka >= 0.");
        }
        data.totalDone = totalDone;
    }

    if (partial.services !== undefined) {
        if (!Array.isArray(partial.services)) throw new Error("services harus array.");
        data.services = partial.services
            .map(s => String(s).trim())
            .filter(s => s.length > 0)
            .slice(0, 20);
    }

    saveData();
    return getHandler(userId);
}

/**
 * Reset job aktif handler (jobs & currentJob), simpan maxJob/services/totalDone.
 * @param {string} userId
 * @returns {boolean}
 */
function resetHandler(userId) {
    const data = handlers.get(userId);
    if (!data) return false;

    data.jobs = [];
    data.currentJob = 0;
    saveData();
    return true;
}

/**
 * Hapus handler sepenuhnya dari data (admin).
 * @param {string} userId
 * @returns {boolean}
 */
function deleteHandler(userId) {
    if (!handlers.has(userId)) return false;
    handlers.delete(userId);
    saveData();
    return true;
}

/**
 * Buat/timpa entry handler (admin, dipakai untuk sync & restore).
 * @param {string} userId
 * @param {object} data
 * @returns {object} data terbaru
 */
function upsertHandler(userId, data = {}) {
    handlers.set(userId, {
        maxJob: Number(data.maxJob) || 0,
        currentJob: Number(data.currentJob) || 0,
        jobs: Array.isArray(data.jobs) ? data.jobs : [],
        services: Array.isArray(data.services) ? data.services : [],
        totalDone: Number(data.totalDone) || 0
    });
    saveData();
    return getHandler(userId);
}

// ================= BACKUP & RESTORE =================
/**
 * Export seluruh data untuk backup (admin).
 * @returns {object} snapshot data lengkap
 */
function exportData() {
    return {
        format: "bot-barokah-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        handlers: Object.fromEntries(handlers),
        rankingChannelId,
        rankingMessageId
    };
}

/**
 * Import data dari backup: ganti seluruh data saat ini.
 * @param {object} payload hasil exportData / file backup
 * @returns {number} jumlah handler yang di-import
 * @throws {Error} jika format tidak valid
 */
function importData(payload) {
    if (!payload || typeof payload !== "object" || !payload.handlers || typeof payload.handlers !== "object") {
        throw new Error("Format backup tidak valid (field 'handlers' tidak ditemukan).");
    }

    // Validasi dulu semua entry sebelum mengubah apa pun
    const validated = new Map();
    for (const [id, value] of Object.entries(payload.handlers)) {
        if (!/^\d{5,25}$/.test(id)) throw new Error(`User ID tidak valid di backup: ${id}`);
        if (!value || typeof value !== "object") throw new Error(`Data handler ${id} tidak valid.`);

        validated.set(id, {
            maxJob: Number(value.maxJob) || 0,
            currentJob: Number(value.currentJob) || 0,
            jobs: Array.isArray(value.jobs) ? value.jobs : [],
            services: Array.isArray(value.services) ? value.services : [],
            totalDone: Number(value.totalDone) || 0
        });
    }

    // Terapkan setelah semua valid
    handlers.clear();
    for (const [id, data] of validated) handlers.set(id, data);

    if (payload.rankingChannelId) rankingChannelId = String(payload.rankingChannelId);
    if (payload.rankingMessageId) rankingMessageId = String(payload.rankingMessageId);

    saveData();
    console.log(`📥 Restore backup: ${validated.size} handler.`);
    return validated.size;
}

function addService(userId, serviceName) {
    const data = handlers.get(userId);
    if (!data) return false;

    if (!data.services.includes(serviceName)) data.services.push(serviceName);
    saveData();
    return true;
}

function addJob(userId, jobData) {
    const data = handlers.get(userId);
    if (!data) return false;

    if (data.jobs.length >= data.maxJob) return false;

    data.jobs.push(jobData);
    data.currentJob = data.jobs.length;

    // TotalDone bertambah otomatis saat /take
    data.totalDone = (Number(data.totalDone) || 0) + 1;

    saveData();
    return true;
}

function removeJob(userId, jobIndex) {
    const data = handlers.get(userId);
    if (!data || !data.jobs[jobIndex]) return false;

    data.jobs.splice(jobIndex, 1);
    data.currentJob = data.jobs.length;

    saveData();
    return true;
}

// ================= RANKING =================
function setRankingChannel(id) {
    rankingChannelId = id;
    saveData();
}

function getRankingChannel() {
    return rankingChannelId;
}

function setRankingMessage(id) {
    rankingMessageId = id;
    saveData();
}

function getRankingMessage() {
    return rankingMessageId;
}

// ================= SYNC DARI CHANNEL RANKING =================
/**
 * Parsing satu entry leaderboard dari teks embed.
 * Format yang ditulis updateLeaderboardEmbed:
 *   🤖 **Handler :**
 *    <@USERID>
 *   📊 **Total Job :** NUM
 * @param {string} text
 * @returns {Array<{userId: string, totalDone: number}>}
 */
function parseLeaderboard(text) {
    const results = [];
    if (!text) return results;

    // Tangkap pasangan: mention user lalu angka Total Job setelahnya
    const pattern = /<@!?(\d{5,25})>[\s\S]*?📊\s*\*\*Total Job\s*:?\*\*\s*:?(\d+)/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
        results.push({ userId: match[1], totalDone: Number(match[2]) });
    }
    return results;
}

/**
 * Ambil data handler dari channel ranking di Discord, lalu replace data lokal.
 * Berguna saat pindah server Railway / data lokal ter-reset: leaderboard di
 * channel ranking jadi sumber kebenaran.
 * @param {object} guild Discord guild
 * @returns {Promise<{updated: number, entries: Array}>}
 * @throws {Error} jika channel tidak ditemukan / leaderboard kosong
 */
async function syncFromRankingChannel(guild) {
    if (!guild) throw new Error("Command ini harus dijalankan di server.");

    const channelId = rankingChannelId;
    if (!channelId) throw new Error("Channel ranking belum diatur. Jalankan /ranking dulu.");

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        throw new Error("Channel ranking tidak ditemukan atau bukan channel teks.");
    }

    // Kumpulkan teks dari message ranking (jika ada) + pesan-pesan terbaru sebagai fallback
    let leaderboardText = "";

    if (rankingMessageId) {
        const msg = await channel.messages.fetch(rankingMessageId).catch(() => null);
        if (msg) {
            leaderboardText = [
                msg.content,
                ...(msg.embeds || []).map(e => e.description || "")
            ].join("\n");
        }
    }

    // Jika message spesifik tidak ada / kosong, scan beberapa pesan terakhir
    if (leaderboardText.trim() === "") {
        const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
        if (recent) {
            const parts = [];
            for (const [, m] of recent) {
                parts.push(m.content || "");
                for (const e of m.embeds || []) parts.push(e.description || "");
            }
            leaderboardText = parts.join("\n");
        }
    }

    const entries = parseLeaderboard(leaderboardText);
    if (entries.length === 0) {
        throw new Error("Tidak menemukan data leaderboard di channel ranking.");
    }

    // Ganti data lokal mengikuti leaderboard (pertahankan totalDone tertinggi)
    let updated = 0;
    for (const { userId, totalDone } of entries) {
        const existing = handlers.get(userId);
        const keptTotal = existing
            ? Math.max(Number(existing.totalDone) || 0, totalDone)
            : totalDone;

        handlers.set(userId, {
            maxJob: existing ? existing.maxJob : 0,
            currentJob: 0,
            jobs: [],
            services: existing ? existing.services : [],
            totalDone: keptTotal
        });
        updated++;
    }

    saveData();
    console.log(`🔄 Sync dari channel ranking: ${updated} handler diupdate.`);
    return { updated, entries };
}

// ================= LEADERBOARD =================
async function updateLeaderboardEmbed(guild) {
    try {
        if (!guild) return;
        if (!rankingChannelId || !rankingMessageId) return;

        const channel = await guild.channels.fetch(rankingChannelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return;

        const allHandlers = Object.fromEntries(handlers);

        const sortedHandlers = Object.entries(allHandlers)
            .sort((a, b) => (b[1].totalDone || 0) - (a[1].totalDone || 0));

        let description = "━━━━━━━━━━━━━━\n**LeaderBoard Handler!**\n━━━━━━━━━━━━━━\n";
        for (const [userId, data] of sortedHandlers) {
            const totalDone = data.totalDone || 0;
            description += 
`🤖 **Handler :**
 <@${userId}> 
📊 **Total Job :** ${totalDone}
━━━━━━━━━━━━━━
`;
        }
        description += "";

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setDescription(description)
            .setTimestamp();

        const message = await channel.messages.fetch(rankingMessageId).catch(() => null);
        if (message) {
            await message.edit({ embeds: [embed] });
        } else {
            const newMsg = await channel.send({ embeds: [embed] });
            setRankingMessage(newMsg.id);
        }

    } catch (err) {
        console.error("❌ ERROR UPDATE LEADERBOARD:", err);
    }
}

// ================= INIT =================
seedInitialData();
loadData();

// ================= EXPORT =================
module.exports = {
    loadData,
    saveData,
    joinHandler,
    getHandler,
    getAllHandlers,
    removeHandler,
    addService,
    addJob,
    removeJob,
    setRankingChannel,
    getRankingChannel,
    setRankingMessage,
    getRankingMessage,
    updateLeaderboardEmbed,
    updateHandler,
    resetHandler,
    deleteHandler,
    upsertHandler,
    exportData,
    importData,
    parseLeaderboard,
    syncFromRankingChannel
};
