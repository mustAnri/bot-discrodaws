const { EmbedBuilder } = require("discord.js");
const handler = require("../Data/handlerData");

module.exports = {
    name: "ranking",
    description: "Show LeaderBoard Handler",

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        try {
            if (!interaction.guild) {
                return interaction.editReply({
                    content: "❌ Command ini hanya bisa digunakan di server."
                });
            }

            // ================= LEADERBOARD CHANNEL =================
            let channelId = handler.getRankingChannel ? handler.getRankingChannel() : null;
            if (!channelId) {
                channelId = "1472669808964276274"; // default channel
                if (handler.setRankingChannel) handler.setRankingChannel(channelId);
            }

            const logChannel = interaction.guild.channels.cache.get(channelId);
            if (!logChannel || !logChannel.isTextBased()) {
                return interaction.editReply({
                    content: "❌ Channel leaderboard not found."
                });
            }

            // ================= GET DATA RANKING =================
            const allHandlers = handler.getAllHandlers ? handler.getAllHandlers() : {};

            // ================= BUILD DESCRIPTION =================
            let description = "━━━━━━━━━━━━━━\n**LeaderBoard Handler!**\n━━━━━━━━━━━━━━\n";

            if (Object.keys(allHandlers).length === 0) {
                description += "No active handler.\n";
            } else {
                // urutkan berdasarkan totalDone langsung dari data handler
                const sortedHandlers = Object.entries(allHandlers)
                    .sort((a, b) => (b[1].totalDone || 0) - (a[1].totalDone || 0));

                for (const [userId, data] of sortedHandlers) {
                    const totalDone = data.totalDone || 0; // ambil langsung dari handlerData.json
                    description +=
`🤖 **Handler :**
 <@${userId}> 
📊 **Total Job :** ${totalDone}
━━━━━━━━━━━━━━
`;
                }
            }

            description += "";

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setDescription(description)
                .setTimestamp();

            // ================= KIRIM ATAU EDIT MESSAGE =================
            let messageId = handler.getRankingMessage ? handler.getRankingMessage() : null;
            let sentEmbed = false;

            if (messageId) {
                try {
                    const oldMessage = await logChannel.messages.fetch(messageId);
                    if (oldMessage) {
                        await oldMessage.edit({ embeds: [embed] });
                        await interaction.editReply({ content: "✅ Leaderboard updated.", embeds: [embed] });
                        sentEmbed = true;
                    }
                } catch (err) {
                    console.log("⚠️ Gagal edit leaderboard message, buat baru:", err);
                }
            }

            // jika belum dikirim, buat baru
            if (!sentEmbed) {
                const msg = await logChannel.send({ embeds: [embed] });
                if (handler.setRankingMessage) handler.setRankingMessage(msg.id);
                await interaction.editReply({ content: "✅ Leaderboard sent.", embeds: [embed] });
            }

        } catch (error) {
            console.error("❌ RANKING ERROR:", error);
            if (interaction.deferred) {
                await interaction.editReply({
                    content: "❌ Terjadi error pada sistem."
                });
            }
        }
    }
};
