const { EmbedBuilder } = require("discord.js");
const handler = require("../Data/handlerData"); // pastikan pakai handlerData.js
const config = require("../Data/config");

module.exports = {
    name: "join",
    description: "Join as handler",

    async execute(interaction) {
        try {
            await interaction.deferReply();

            if (!interaction.guild) {
                return interaction.editReply({
                    content: "❌ Command ini hanya bisa dijalankan di server."
                });
            }

            const roleId = config.getConfig().handlerRoleId; // diatur via admin panel

            if (!interaction.member.roles.cache.has(roleId)) {
                return interaction.editReply({
                    content: "❌ You Failed To Join Because You Are Not A Genuine Handler.. LOLL IDIOT"
                });
            }

            const maxJob = interaction.options.getInteger("job");
            const readyJobsInput = interaction.options.getString("ready_job");

            if (!maxJob || maxJob < 1 || maxJob > 2) {
                return interaction.editReply({
                    content: "❌ Max Job Must be 1 or 2."
                });
            }

            // ================= CEK DATA LAMA =================
            const oldData = handler.getHandler(interaction.user.id);

            const existing = oldData && oldData.maxJob > 0 ? true : false;
            if (existing) {
                return interaction.editReply({
                    content: "❌ You've Joined. Use /leave If You Want To Change Jobs.."
                });
            }

            const jobTypes = readyJobsInput
                .split(/[,|&]/)
                .map(j => j.trim())
                .filter(j => j);

            if (jobTypes.length === 0) {
                return interaction.editReply({
                    content: "❌ Please Fill In At Least 1 Ready Job."
                });
            }

            if (jobTypes.length > maxJob) {
                return interaction.editReply({
                    content: `❌ Number of Ready Jobs (${jobTypes.length}) Exceeds Max Job (${maxJob}).`
                });
            }

            // ============================== 
            // SIMPAN HANDLER KE JSON (gabung data lama jika ada)
            // ==============================
            const joined = handler.joinHandler(interaction.user.id, maxJob);

            if (!joined) {
                return interaction.editReply({
                    content: "❌ Gagal join, silakan coba lagi."
                });
            }

            // Tambahkan jobTypes ke handler dan pastikan tersimpan
            jobTypes.forEach(j => {
                handler.addService(interaction.user.id, j);
            });

            // ============================== 
            // BALAS KE USER
            // ==============================
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle("✅ Handler Joined!")
                .setDescription(
`**Handler :**
${interaction.user}
**Max Job :**
${maxJob}
**Status :**
🟢 Ready (0/${maxJob})
**Ready Job :**
${jobTypes.join(" & ")}` 
                );

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error("JOIN ERROR:", error);

            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: "❌ Terjadi error pada sistem.",
                        flags: 64
                    });
                } else {
                    await interaction.editReply({
                        content: "❌ Terjadi error setelah proses."
                    });
                }
            } catch (replyErr) {
                console.error("❌ Gagal kirim balasan error /join:", replyErr);
            }
        }
    }
};
