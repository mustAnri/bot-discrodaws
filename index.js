require("dotenv").config();

// Pasang log capture paling awal agar semua output tertangkap admin panel
const { hookConsole } = require("./admin/logStore");
hookConsole();

const fs = require("fs");
const path = require("path");
const { Client, Collection, GatewayIntentBits } = require("discord.js");

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

// ================= LOAD COMMANDS =================
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
        const command = require(filePath);

        if (!command.name || !command.execute) {
            console.warn(`⚠️ Command ${file} tidak valid (missing name or execute).`);
            continue;
        }

        client.commands.set(command.name, command);
        console.log(`✅ Command loaded: ${command.name}`);
    } catch (err) {
        console.error(`❌ Gagal load command ${file}:`, err);
    }
}

// ================= READY =================
client.once("clientReady", () => { // FIX: ready → clientReady
    console.log(`✅ Bot siap! Logged in sebagai ${client.user.tag}`);
});

// ================= INTERACTION HANDLER =================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.warn(`❌ Command tidak ditemukan: ${interaction.commandName}`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`❌ Error saat menjalankan command ${interaction.commandName}:`, error);

        // FIX: handler error yang aman (anti double reply & expired interaction)
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content: "❌ Terjadi error pada command."
                });
            } else {
                await interaction.reply({
                    content: "❌ Terjadi error pada command.",
                    flags: 64 // FIX: ganti ephemeral
                });
            }
        } catch (err) {
            console.log("❌ Gagal kirim error message (interaction kemungkinan expired)");
        }
    }
});

// ================= PROCESS ERROR GUARD =================
process.on("unhandledRejection", (err) => {
    console.error("⚠️ Unhandled promise rejection:", err);
});

process.on("uncaughtException", (err) => {
    console.error("⚠️ Uncaught exception:", err);
});

// ================= ADMIN PANEL =================
const { startAdminServer } = require("./admin/server");

// ================= LOGIN =================
if (!process.env.TOKEN) {
    console.error("❌ TOKEN tidak ditemukan. Set environment variable TOKEN terlebih dahulu.");
    process.exit(1);
}

client.login(process.env.TOKEN)
    .then(() => {
        console.log("🔑 Bot berhasil login.");
        startAdminServer(client);
    })
    .catch(err => console.error("❌ Gagal login bot:", err));