require("dotenv").config();
const { REST, Routes, SlashCommandBuilder, ApplicationCommandOptionType, ChannelType } = require("discord.js");

const commands = [
    // /menu tanpa input
    new SlashCommandBuilder()
        .setName("menu")
        .setDescription("Show Menu Bot."),

    // /join dengan 2 input
    new SlashCommandBuilder()
        .setName("join")
        .setDescription("Join as handler")
        .addIntegerOption(option =>
            option.setName("job")
                .setDescription("How Many Job You Can Do Maks Job 2.")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("ready_job")
                .setDescription("What Jobs Are Available ? [ Example : PTHT / PNB / ETC ]")
                .setRequired(true)
        ),

    // /leave tanpa input
    new SlashCommandBuilder()
        .setName("leave")
        .setDescription("Done Leave/Not Ready."),

    // /take dengan 4 input
    new SlashCommandBuilder()
        .setName("take")
        .setDescription("Take Job")
        .addStringOption(option =>
            option.setName("order")
                .setDescription("What Customer Orders ?")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("how_many")
                .setDescription("How Many Times Or How Many Hours")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("world")
                .setDescription("Name World :")
                .setRequired(true)
        )
        .addUserOption(option =>
    option
        .setName("customer")
        .setDescription("Tag Account Customer")
        .setRequired(true)
        ),

// /done dengan 2 input wajib
new SlashCommandBuilder()
    .setName("done")
    .setDescription("Done job")
    .addIntegerOption(option =>
        option.setName("job")
            .setDescription("Select Completed Jobs.")
            .setRequired(true)
            .addChoices(
                { name: "Job 1", value: 1 },
                { name: "Job 2", value: 2 }
            )
    )
    .addAttachmentOption(option =>
        option.setName("proof")
            .setDescription("Upload A Photo Of Proof Of Job Completion.")
            .setRequired(true)
    ),

    // /status tanpa input
    new SlashCommandBuilder()
        .setName("status")
        .setDescription("Check status handler"),

    // /rangking tanpa input
    new SlashCommandBuilder()
        .setName("ranking")
        .setDescription("See Rank Handler"),

    // /autopost dengan opsi channel target (owner-only di handler)
    new SlashCommandBuilder()
        .setName("autopost")
        .setDescription("Buka panel AutoPost")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("Channel tempat panel AutoPost dipasang (default: channel ini)")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        ),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

if (!process.env.TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
    console.error("❌ Env belum lengkap. Butuh: TOKEN, CLIENT_ID, GUILD_ID");
    process.exit(1);
}

(async () => {
    try {
        console.log("Deploying commands...");
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log("✅ Semua commands berhasil di-deploy!");
    } catch (err) {
        console.error(err);
    }
})();
