const { REST, Routes } = require("discord.js");
require("dotenv").config();

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

if (!process.env.TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
    console.error("❌ Env belum lengkap. Butuh: TOKEN, CLIENT_ID, GUILD_ID");
    process.exit(1);
}

(async () => {
    try {
        // Hapus semua command global
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: [] }
        );
        console.log("✅ Semua global commands dihapus.");

        // Hapus semua command di server (guild)
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: [] }
        );
        console.log("✅ Semua guild commands dihapus.");
    } catch (err) {
        console.error(err);
    }
})();
