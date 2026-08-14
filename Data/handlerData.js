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
    updateLeaderboardEmbed
};
