/**
 * admin/autopost/builders.js
 *
 * Panel Components V2 AutoPost (port dari anri autopost-builder.js).
 * AutoLogin DIHAPUS total; token field = config.token.
 * Gambar banner/thumbnail = avatar bot (anri pakai cfg.images — tidak di-port).
 */

const {
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ThumbnailBuilder,
    SectionBuilder,
    ActionRowBuilder,
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require("discord.js");
const store = require("../../Data/autopostStore");
const engine = require("./engine");

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Avatar URL bot (pengganti cfg.images di anri). */
function botAvatar(client, size = 512) {
    return client.user.displayAvatarURL({ extension: "png", size });
}

/**
 * Banner URL untuk panel: pakai banner custom dari settings jika di-set,
 * kalau tidak fallback ke avatar bot.
 */
function bannerUrl(client) {
    const custom = store.getSettings().bannerUrl;
    return custom || botAvatar(client);
}

/** Interval detik -> string ringkas: 3661 → "1h 1m 1s", 300 → "5m", 45 → "45s". */
function formatInterval(seconds) {
    if (!seconds || seconds <= 0) return "0s";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0) parts.push(`${s}s`);
    return parts.length > 0 ? parts.join(" ") : "0s";
}

/** Separator divider tipis (instance baru tiap panggil). */
const sep = () =>
    new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small);

// ─── Welcome Container (private room) ───────────────────────────────────────

function buildWelcomeContainer(client, userId) {
    const banner = new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(bannerUrl(client)),
    );
    const thumbnail = new ThumbnailBuilder({ media: { url: botAvatar(client, 128) } });

    const welcomeSection = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `👋 **Welcome to your Private Room, <@${userId}>!**`,
            ),
            new TextDisplayBuilder().setContent(
                "Manage your AutoPost channels and token below.",
            ),
        )
        .setButtonAccessory(
            new ButtonBuilder()
                .setCustomId("ap_open_panel")
                .setLabel("Open AutoPost Panel")
                .setStyle(ButtonStyle.Primary),
        );

    const tipFooter = new TextDisplayBuilder().setContent(
        "💡 *Use the buttons below to configure channels and token.*",
    );

    const container = new ContainerBuilder()
        .setAccentColor(0x5865f2)
        .addMediaGalleryComponents(banner)
        .addSeparatorComponents(sep())
        .addSectionComponents(welcomeSection)
        .addSeparatorComponents(sep())
        .addTextDisplayComponents(tipFooter);

    return { container };
}

// ─── Main AutoPost Panel ────────────────────────────────────────────────────

function buildPanel(userId, client) {
    const config = store.getUserConfig(userId);
    const isRunning = engine.isAutoPostActive(userId);
    const hasToken = Boolean(config.token);

    const banner = new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(bannerUrl(client)),
    );
    const thumbnail = new ThumbnailBuilder({ media: { url: botAvatar(client, 128) } });

    // ── Status section ────────────────────────────────────────────────────
    const runBadge = isRunning ? "🟢 **Active**" : "🔴 **Stopped**";
    const tokenBadge = hasToken ? "✅ Token Set" : "❌ No Token";
    const chCount = config.channels.length;

    const statusSection = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("⚡ **AutoPost Manager**"),
            new TextDisplayBuilder().setContent(
                `${runBadge}  ·  ${tokenBadge}  ·  📡 **${chCount}** channel${chCount !== 1 ? "s" : ""}`,
            ),
        )
        .setThumbnailAccessory(thumbnail);

    // ── Channel list ──────────────────────────────────────────────────────
    const channelListText =
        config.channels.length > 0
            ? config.channels
                .map((ch) => `> 📻 <#${ch.id}> — \`${formatInterval(ch.interval)}\``)
                .join("\n")
            : "> *No channels yet. Click **Add** to create your first one.*";

    // ── Post-control group ────────────────────────────────────────────────
    const toggleSection = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                isRunning ? "⏹️ **Stop AutoPost**" : "▶️ **Start AutoPost**",
            ),
        )
        .setButtonAccessory(
            new ButtonBuilder()
                .setCustomId("ap_toggle_post")
                .setLabel(isRunning ? "Stop" : "Start")
                .setStyle(isRunning ? ButtonStyle.Danger : ButtonStyle.Success),
        );

    const addChannelSection = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("➕ **Add Channel**"),
        )
        .setButtonAccessory(
            new ButtonBuilder()
                .setCustomId("ap_add_channel")
                .setLabel("Add Channel")
                .setStyle(ButtonStyle.Primary),
        );

    const removeSection = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("🗑️ **Remove Channel**"),
        )
        .setButtonAccessory(
            new ButtonBuilder()
                .setCustomId("ap_remove_channel")
                .setLabel("Remove")
                .setStyle(ButtonStyle.Danger),
        );

    // ── Settings group ────────────────────────────────────────────────────
    const setTokenSection = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("🔑 **User Token**"),
        )
        .setButtonAccessory(
            new ButtonBuilder()
                .setCustomId("ap_set_token")
                .setLabel(hasToken ? "Update" : "Set Token")
                .setStyle(hasToken ? ButtonStyle.Secondary : ButtonStyle.Danger),
        );

    const createRoomSection = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("🔒 **Private Room**"),
        )
        .setButtonAccessory(
            new ButtonBuilder()
                .setCustomId("ap_create_room")
                .setLabel("Create Room")
                .setStyle(ButtonStyle.Success),
        );

    // ── Footer tip ────────────────────────────────────────────────────────
    const footerTip = new TextDisplayBuilder().setContent(
        "💡 *Set your user token first, add channels, then hit Start.*",
    );

    // ── Assemble ──────────────────────────────────────────────────────────
    const accentColor = isRunning ? 0x57f287 : 0x5865f2;

    const container = new ContainerBuilder()
        .setAccentColor(accentColor)
        .addMediaGalleryComponents(banner)
        .addSeparatorComponents(sep())
        .addSectionComponents(statusSection)
        .addSeparatorComponents(sep())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("📡 **Configured Channels**"),
            new TextDisplayBuilder().setContent(channelListText),
        )
        .addSeparatorComponents(sep())
        .addSectionComponents(toggleSection, addChannelSection, removeSection)
        .addSeparatorComponents(sep())
        .addSectionComponents(setTokenSection, createRoomSection)
        .addSeparatorComponents(sep())
        .addTextDisplayComponents(footerTip);

    return { container };
}

// ─── Remove-channel select menu ─────────────────────────────────────────────

function buildRemoveChannelSelect(userId) {
    const config = store.getUserConfig(userId);
    if (config.channels.length === 0) return null;

    const select = new StringSelectMenuBuilder()
        .setCustomId("ap_remove_select")
        .setPlaceholder("Select a channel to remove…")
        .addOptions(
            config.channels.map((ch) => ({
                label: `Channel ${ch.id}`,
                description: `Every ${formatInterval(ch.interval)}`,
                value: ch.id,
            })),
        );

    return new ActionRowBuilder().addComponents(select);
}

module.exports = {
    buildPanel,
    buildWelcomeContainer,
    buildRemoveChannelSelect,
    formatInterval,
    botAvatar,
    bannerUrl
};
