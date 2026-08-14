// File: status.js
const { EmbedBuilder } = require("discord.js");
const handler = require("../Data/handlerData"); // pakai handlerData.js

module.exports = {
    name: "status",
    description: "Check all handler status",

    async execute(interaction) {
        try {
            await interaction.deferReply();

            if (!interaction.guild) {
                return interaction.editReply({
                    content: "❌ Command ini hanya bisa digunakan di server."
                });
            }

            const allHandlers = handler.getAllHandlers ? handler.getAllHandlers() : {}; 
            // jika belum ada fungsi getAllHandlers, kita bisa definisikan di handlerData.js:
            // function getAllHandlers() { return Object.fromEntries(handlers); }

            const entries = Object.entries(allHandlers);

            if (entries.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle("📊 Status Handler")
                    .setDescription("Tidak Ada Handler Yang Aktif Sekarang.");

                return interaction.editReply({ embeds: [embed] });
            }

            let description = "";

            for (const [userId, data] of entries) {
                const max = Number(data.maxJob) || 0;
                const jobs = Array.isArray(data.jobs) ? data.jobs : [];
                const current = jobs.length;

                // ================= STATUS ICON =================
                let statusIcon = "🟢"; // default untuk ada slot kosong
                if (current === 0 && max === 0) statusIcon = "❌"; // kondisi 0/0
                else if (current < max && current > 0) statusIcon = "🟡";
                else if (current >= max && max !== 0) statusIcon = "🔴";

                const readyJobs = data.services && data.services.length > 0
                    ? data.services.join(" / ")
                    : "Empty/Offline";

                description +=
`👤 **Handler :** <@${userId}>
⏳ **Status :** (${current}/${max}) ${statusIcon}
🛠 **Ready Service :** ${readyJobs}
━━━━━━━━━━━━━━
`;
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle("📊 Status Handler")
                .setDescription(description)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("STATUS ERROR:", error);

            if (interaction.deferred) {
                await interaction.editReply({
                    content: "❌ Terjadi error pada sistem."
                });
            }
        }
    }
};
