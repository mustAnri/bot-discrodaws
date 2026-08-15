const { EmbedBuilder } = require("discord.js");
const handler = require("../Data/handlerData");
const config = require("../Data/config");

module.exports = {
    name: "done",
    description: "Done job",

    async execute(interaction) {
        await interaction.deferReply();

        try {
            if (!interaction.guild)
                return interaction.editReply({ content: "❌ Command can only be used in a server." });

            // ================= CEK ROLE HANDLER =================
            const handlerRoleId = config.getConfig().handlerRoleId;
            if (!interaction.member.roles.cache.has(handlerRoleId)) {
                return interaction.editReply({
                    content: "❌ You Failed To Join Because You Are Not A Genuine Handler."
                });
            }

            const jobNumber = interaction.options.getInteger("job");
            const proof = interaction.options.getAttachment("proof");

            if (!jobNumber || jobNumber < 1)
                return interaction.editReply({ content: "❌ Please choose a valid job." });

            if (!proof || !proof.contentType?.startsWith("image/"))
                return interaction.editReply({ content: "❌ You must upload a proof image." });

            // ================= RELOAD DATA =================
            handler.loadData();

            // ================= UPDATE LEADERBOARD DARI JSON TERLEBIH DAHULU =================
            try {
                const guild = interaction.guild;
                await handler.updateLeaderboardEmbed(guild);
            } catch (err) {
                console.log("⚠️ Failed to update leaderboard automatically:", err);
            }

            // ================= AMBIL DATA HANDLER =================
            const handlerData = handler.getHandler(interaction.user.id);
            if (!handlerData)
                return interaction.editReply({ content: "❌ You haven't joined as a handler." });

            if (!handlerData.jobs || handlerData.jobs.length === 0)
                return interaction.editReply({ content: "❌ No active jobs." });

            const jobIndex = jobNumber - 1;
            const jobData = handlerData.jobs[jobIndex];
            if (!jobData)
                return interaction.editReply({ content: "❌ Job not found." });

            const { order, howMany, world, customerId } = jobData;

            // ================= HAPUS JOB =================
            const removeSuccess = handler.removeJob(interaction.user.id, jobIndex);
            if (!removeSuccess)
                return interaction.editReply({ content: "❌ Failed to complete the job." });

            // ================= EMBED UNTUK LOG CHANNEL =================
            const updatedData = handler.getHandler(interaction.user.id);
            const updatedCurrent = updatedData.currentJob;
            const updatedMax = updatedData.maxJob;

            let statusIcon = "🟢";
            if (updatedCurrent > 0 && updatedCurrent < updatedMax) statusIcon = "🟡";
            if (updatedCurrent >= updatedMax) statusIcon = "🔴";

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle("✅ Service By Barokah!")
                .setDescription(
`👤 **Customer :**
<@${customerId}>
🤖 **Handler :**
${interaction.user}
━━━━━━━━━━━━━━
**Service :**
${order}
**Time/Hours :**
${howMany}
**World :**
${world}
━━━━━━━━━━━━━━
⏳ **Status Job :**
(${updatedCurrent}/${updatedMax}) ${statusIcon}
📷 **PROOF :**
Service 100% Completed Successfully.`
                )
                .setImage(proof.url)
                .setTimestamp();

            // ================= LOG CHANNEL =================
            const doneLogChannelId = config.getConfig().doneLogChannelId;
            const logChannel = await interaction.guild.channels.fetch(doneLogChannelId).catch(() => null);
            if (logChannel?.isTextBased()) {
                logChannel.send({ embeds: [embed] })
                    .catch(err => console.log("❌ Failed to send log:", err));
            }

            // ================= BALAS KE USER =================
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("❌ DONE ERROR:", error);
            if (interaction.deferred) {
                await interaction.editReply({ content: "❌ System error occurred." });
            }
        }
    }
};
