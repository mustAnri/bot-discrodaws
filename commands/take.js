const { EmbedBuilder } = require("discord.js");
const handler = require("../Data/handlerData"); // pakai handlerData JSON

module.exports = {
    name: "take",
    description: "Take Job",

    async execute(interaction) {

        await interaction.deferReply(); // biar gak timeout

        try {

            if (!interaction.guild) {
                return interaction.editReply({
                    content: "❌ Command can only be used in a server."
                });
            }

            // ================= CEK ROLE HANDLER =================
            const handlerRoleId = "1434214694503055552";
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
            const logChannelId = "1472619243005546701";
            const logChannel = interaction.guild.channels.cache.get(logChannelId);

            if (logChannel && logChannel.isTextBased()) {
                logChannel.send({ embeds: [embed] })
                    .then(() => console.log("✅ Log channel sent."))
                    .catch(err => console.log("❌ Failed to send log:", err));
            }

            // ================= BALAS KE USER =================
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("❌ TAKE ERROR:", error);

            if (interaction.deferred) {
                await interaction.editReply({
                    content: "❌ System error occurred."
                });
            }
        }
    }
};
