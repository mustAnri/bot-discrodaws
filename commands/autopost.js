/**
 * commands/autopost.js
 *
 * /autopost [channel] — pasang panel publik AutoPost di channel target.
 * Jika opsi channel tidak diisi, panel dipasang di channel tempat command dijalankan.
 * Setup: owner guild, atau member dengan role setup (settings.setupRoleId).
 * Pemakaian panel (tombol) diatur whitelist role di interactions.js.
 */

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    PermissionFlagsBits,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    ThumbnailBuilder
} = require("discord.js");

const { botAvatar, bannerUrl } = require("../admin/autopost/builders");
const store = require("../Data/autopostStore");

module.exports = {
    name: "autopost",
    description: "Buka panel AutoPost",

    async execute(interaction) {
        const client = interaction.client;

        // Hanya di guild
        if (!interaction.guild) {
            return interaction.reply({
                content: "❌ Command ini hanya bisa dipakai di server.",
                flags: MessageFlags.Ephemeral
            });
        }

        // Setup: owner, atau member dengan role setup (jika diset di web panel).
        const isOwner = interaction.user.id === interaction.guild.ownerId;
        const { setupRoleId } = store.getSettings();
        const hasSetupRole = Boolean(
            setupRoleId && interaction.member?.roles?.cache?.has(setupRoleId)
        );
        if (!isOwner && !hasSetupRole) {
            return interaction.reply({
                content: "❌ Only the server owner (or the setup role) can set up the AutoPost panel.",
                flags: MessageFlags.Ephemeral
            });
        }

        // Channel target: dari opsi, atau channel tempat command dijalankan.
        const targetChannel =
            interaction.options.getChannel("channel") || interaction.channel;

        if (!targetChannel.isTextBased()) {
            return interaction.reply({
                content: "❌ Panel hanya bisa dipasang di channel teks.",
                flags: MessageFlags.Ephemeral
            });
        }

        // Pastikan bot bisa kirim pesan di channel target.
        const me = interaction.guild.members.me;
        const perms = targetChannel.permissionsFor(me);
        if (!perms || !perms.has(PermissionFlagsBits.SendMessages)) {
            return interaction.reply({
                content: `❌ Bot tidak punya izin kirim pesan di ${targetChannel}.`,
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const banner = new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(bannerUrl(client))
        );
        const thumbnail = new ThumbnailBuilder({
            media: { url: botAvatar(client, 128) }
        });

        const roomSection = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent("🏠 **AutoPost Private Rooms**"),
                new TextDisplayBuilder().setContent(
                    "> Create your own private room to configure AutoPost channels, token, and posting schedule.\n> Only you can see and manage your room."
                )
            )
            .setThumbnailAccessory(thumbnail);

        const createRoomButton = new ButtonBuilder()
            .setCustomId("ap_public_create_room")
            .setLabel("🔒 Create Private Room")
            .setStyle(ButtonStyle.Success);

        const publicContainer = new ContainerBuilder()
            .setAccentColor(0x5865f2)
            .addMediaGalleryComponents(banner)
            .addSeparatorComponents(
                new SeparatorBuilder()
                    .setDivider(true)
                    .setSpacing(SeparatorSpacingSize.Small)
            )
            .addSectionComponents(roomSection)
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(createRoomButton)
            );

        await targetChannel.send({
            flags: MessageFlags.IsComponentsV2,
            components: [publicContainer]
        });

        return interaction.editReply({
            content: `✅ AutoPost panel has been posted to ${targetChannel}.`
        });
    }
};
