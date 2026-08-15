const { EmbedBuilder } = require("discord.js");

module.exports = {
    name: "menu",
    description: "View the list of commands",

    async execute(interaction) {

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("📋 MENU BOT BAROKAH")
.setDescription(
`**/menu**
Check All Menu Bot BAROKAH.
**/join**
For Handlers Who Are Ready for Job.
**/leave**
For Handlers Who Are Not Ready for the Job.
**/take**
For Handler Take Job.
**/done**
For Handler If Job is Completed.
**/status**
Check which handler is ready for the job.
**/ranking**
Check Your Rank While Being a Handler.`
);

        try {
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error("❌ MENU ERROR:", error);
        }
    }
};
