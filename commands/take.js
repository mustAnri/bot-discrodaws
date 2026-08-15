const { EmbedBuilder } = require("discord.js");
const handler = require("../Data/handlerData"); // pakai handlerData JSON
const config = require("../Data/config");

module.exports = {
    name: "take",
    description: "Take Job",

    async execute(interaction) {
        try {
            await interaction.deferReply(); // biar gak timeout (di dalam try agar error tetap terbalas)

            if (!interaction.guild) {
                return interaction.editReply({
                    content: "❌ Command can only be used in a server."
                });
            }

            // ================= CEK ROLE HANDLER =================
            const handlerRoleId = config.getConfig().handlerRoleId;
            if (!interaction.member.roles.cache.has(handlerRoleId)) {
                return interaction.editReply({
                    content: "❌ You Failed To Join Because You Are Not A Genuine Handler."
                });
            }

            const handlerData = handler.getHandler(interaction.user.id);

            if (!handlerData) {
                return interaction.editReply({
                    content: "❌ You haven't joined as a handler."
                });
            }

            const order = interaction.options.getString("order");
            const howMany = interaction.options.getString("how_many");
            const world = interaction.options.getString("world");
            const customer = interaction.options.getUser("customer");

            const currentJob = handlerData.currentJob || 0;
            const maxJob = handlerData.maxJob || 0;

            if (currentJob >= maxJob) {
                return interaction.editReply({
                    content: `❌ Job slots full (${currentJob}/${maxJob}). Use /done first.`
                });
            }

            // ================= SIMPAN DATA JOB =================
            const success = handler.addJob(interaction.user.id, {
                order,
                howMany,
                world,
                customerId: customer.id
            });

            if (!success) {
                return interaction.editReply({
                    content: "❌ Failed to take the job."
                });
            }

            // Update currentJob
            const updatedData = handler.getHandler(interaction.user.id);
            const updatedCurrent = updatedData.currentJob;
            const updatedMax = updatedData.maxJob;

            let statusIcon = "🟢";
            if (updatedCurrent < updatedMax) statusIcon = "🟡";
            if (updatedCurrent >= updatedMax) statusIcon = "🔴";

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle("✅ Service By Barokah!")
                .setDescription(
`👤 **Customer :**
${customer}
🤖 **Handler :**
${interaction.user}
━━━━━━━━━━━━━━
**Service :**
${order}
**Time/Hours :**
${howMany}
**World :**
${world}
**Current Service :**
Service Now Process.
━━━━━━━━━━━━━━
⏳ **Status Job :**
(${updatedCurrent}/${updatedMax}) ${statusIcon}
📝 **Notes :**
Your service has been successfully received. Once it is complete, the handler will do /done.`
                )
                .setTimestamp();

            // ================= KIRIM KE CHANNEL LOG =================
            const logChannelId = config.getConfig().takeLogChannelId;
            const logChannel = await interaction.guild.channels.fetch(logChannelId).catch(() => null);

            if (logChannel && logChannel.isTextBased()) {
                await logChannel.send({ embeds: [embed] })
                    .then(() => console.log("✅ Log channel sent."))
                    .catch(err => console.error("❌ Failed to send /take log (cek permission bot di channel):", err));
            } else {
                console.warn(`⚠️ Take log channel tidak ditemukan: ${logChannelId} (cek Take Log Channel ID di admin panel)`);
            }

            // ================= BALAS KE USER =================
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("❌ TAKE ERROR:", error);

            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: "❌ System error occurred." });
                } else {
                    await interaction.reply({ content: "❌ System error occurred." });
                }
            } catch (replyErr) {
                console.error("❌ Gagal kirim balasan error /take:", replyErr);
            }
        }
    }
};
