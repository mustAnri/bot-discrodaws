const { EmbedBuilder } = require("discord.js");
const handler = require("../Data/handlerData");
const config = require("../Data/config");

module.exports = {
    name: "ranking",
    description: "Show LeaderBoard Handler",

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: false }); // di dalam try agar error tetap terbalas
            if (!interaction.guild) {
                return interaction.editReply({
                    content: "❌ Command ini hanya bisa digunakan di server."
                });
            }

            // ================= LEADERBOARD CHANNEL =================
            // Prioritas: channel tersimpan > config admin panel
            let channelId = handler.getRankingChannel ? handler.getRankingChannel() : null;
            if (!channelId) {
                channelId = config.getConfig().rankingChannelId;
                if (handler.setRankingChannel) handler.setRankingChannel(channelId);
            }

            const logChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
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
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: "❌ Terjadi error pada sistem." });
                } else {
                    await interaction.reply({ content: "❌ Terjadi error pada sistem." });
                }
            } catch (replyErr) {
                console.error("❌ Gagal kirim balasan error /ranking:", replyErr);
            }
        }
    }
};
