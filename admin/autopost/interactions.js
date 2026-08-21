/**
 * admin/autopost/interactions.js
 *
 * Router interaksi AutoPost. Panel pribadi tiap user dibuka secara EPHEMERAL
 * (hanya user yang bersangkutan yang bisa lihat) dari satu panel entry publik.
 * Tidak ada lagi private room/channel — sistem room dihapus, tapi sisa data
 * room lama tetap bisa dibersihkan via tombol "Hapus Room" kondisional.
 *
 * Semua customId memakai prefix "ap_" (routing dari index.js).
 */

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MessageFlags,
    ModalBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    TextInputBuilder,
    TextInputStyle,
    ThumbnailBuilder
} = require("discord.js");

const store = require("../../Data/autopostStore");
const engine = require("./engine");
const {
    buildPanel,
    buildRemoveChannelSelect,
    buildEditChannelSelect,
    formatInterval,
    botAvatar
} = require("./builders");

// ─── Feedback container kecil ───────────────────────────────────────────────

function thumb(client) {
    return new ThumbnailBuilder({ media: { url: botAvatar(client, 128) } });
}

/**
 * Container feedback sederhana: judul + baris teks + thumbnail.
 * @param {object} client
 * @param {number} accent warna aksen hex
 * @param {string} title
 * @param {string[]} lines baris teks
 */
function infoContainer(client, accent, title, lines) {
    const textDisplays = lines.map(
        (line) => new TextDisplayBuilder().setContent(line),
    );

    const section = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(title),
            ...textDisplays,
        )
        .setThumbnailAccessory(thumb(client));

    return new ContainerBuilder()
        .setAccentColor(accent)
        .addSectionComponents(section);
}

/**
 * Susun components V2: catatan kecil (opsional) + panel terbaru.
 * Dipakai setiap kali ada perubahan config supaya panel langsung ter-refresh.
 */
function panelWithNote(client, userId, note) {
    const { container: panelContainer } = buildPanel(userId, client);
    if (!note) return [panelContainer];
    return [infoContainer(client, note.accent, note.title, note.lines), panelContainer];
}

// ─── Modal: set token ───────────────────────────────────────────────────────

function showSetTokenModal(interaction) {
    const tokenInput = new TextInputBuilder()
        .setCustomId("token_input")
        .setLabel("Discord User Token")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Paste your user token here…")
        .setMinLength(10)
        .setMaxLength(200)
        .setRequired(true);

    const modal = new ModalBuilder()
        .setCustomId("ap_set_token_modal")
        .setTitle("Set User Token")
        .addComponents(new ActionRowBuilder().addComponents(tokenInput));

    return interaction.showModal(modal);
}

// ─── Modal: add channel ─────────────────────────────────────────────────────

function showAddChannelModal(interaction) {
    const chId = new TextInputBuilder()
        .setCustomId("ch_id")
        .setLabel("Channel ID")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("123456789012345678")
        .setMinLength(17)
        .setMaxLength(25)
        .setRequired(true);

    const chMessage = new TextInputBuilder()
        .setCustomId("ch_message")
        .setLabel("Message Content")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Message to post repeatedly…")
        .setMinLength(1)
        .setMaxLength(1000)
        .setRequired(true);

    const chHours = new TextInputBuilder()
        .setCustomId("ch_hours")
        .setLabel("Hours")
        .setStyle(TextInputStyle.Short)
        .setValue("0")
        .setRequired(false);

    const chMinutes = new TextInputBuilder()
        .setCustomId("ch_minutes")
        .setLabel("Minutes")
        .setStyle(TextInputStyle.Short)
        .setValue("5")
        .setRequired(false);

    const chSeconds = new TextInputBuilder()
        .setCustomId("ch_seconds")
        .setLabel("Seconds")
        .setStyle(TextInputStyle.Short)
        .setValue("0")
        .setRequired(false);

    const modal = new ModalBuilder()
        .setCustomId("ap_add_channel_modal")
        .setTitle("Add AutoPost Channel")
        .addComponents(
            new ActionRowBuilder().addComponents(chId),
            new ActionRowBuilder().addComponents(chMessage),
            new ActionRowBuilder().addComponents(chHours),
            new ActionRowBuilder().addComponents(chMinutes),
            new ActionRowBuilder().addComponents(chSeconds),
        );

    return interaction.showModal(modal);
}

// ─── Modal: edit channel message ────────────────────────────────────────────

/**
 * Modal edit message untuk channel yang sudah ada. Dipanggil dari select menu
 * `ap_edit_select`. Channel ID di-prefill (jangan diubah), message diisi
 * dengan pesan yang tersimpan saat ini.
 */
function showEditChannelModal(interaction, channelId) {
    const chId = new TextInputBuilder()
        .setCustomId("edit_ch_id")
        .setLabel("Channel ID (do not change)")
        .setStyle(TextInputStyle.Short)
        .setValue(channelId)
        .setMinLength(17)
        .setMaxLength(25)
        .setRequired(true);

    const config = store.getUserConfig(interaction.user.id);
    const channel = config.channels.find((ch) => ch.id === channelId);
    const currentMessage = channel ? channel.message : "";

    const chMessage = new TextInputBuilder()
        .setCustomId("edit_ch_message")
        .setLabel("New Message Content")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Message to post repeatedly…")
        .setValue(currentMessage.slice(0, 1000))
        .setMinLength(1)
        .setMaxLength(1000)
        .setRequired(true);

    const modal = new ModalBuilder()
        .setCustomId("ap_edit_channel_modal")
        .setTitle("Edit AutoPost Message")
        .addComponents(
            new ActionRowBuilder().addComponents(chId),
            new ActionRowBuilder().addComponents(chMessage),
        );

    return interaction.showModal(modal);
}

// ─── Button handlers ────────────────────────────────────────────────────────

/**
 * Buka panel pribadi secara ephemeral — dipanggil dari tombol di panel entry
 * publik. Hanya user yang menekan tombol yang bisa melihat hasilnya.
 */
async function handleOpenMyPanel(client, interaction) {
    const userId = interaction.user.id;
    store.setUsername(userId, interaction.user.username);

    const components = panelWithNote(client, userId, null);

    return interaction.reply({
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        components,
    });
}

async function handleTogglePost(client, interaction) {
    const userId = interaction.user.id;
    const config = store.getUserConfig(userId);
    store.setUsername(userId, interaction.user.username);

    if (!config.token) {
        return interaction.update({
            flags: MessageFlags.IsComponentsV2,
            components: panelWithNote(client, userId, {
                accent: 0xfee75c,
                title: "⚠️ **No Token Set**",
                lines: ["> Set your user token first using the **Set Token** button."],
            }),
        });
    }

    if (config.channels.length === 0) {
        return interaction.update({
            flags: MessageFlags.IsComponentsV2,
            components: panelWithNote(client, userId, {
                accent: 0xfee75c,
                title: "⚠️ **No Channels**",
                lines: ["> Add at least one channel before starting AutoPost."],
            }),
        });
    }

    if (engine.isAutoPostActive(userId)) {
        engine.stopAutoPost(userId);
        return interaction.update({
            flags: MessageFlags.IsComponentsV2,
            components: panelWithNote(client, userId, {
                accent: 0xed4245,
                title: "⏹️ **AutoPost Stopped**",
                lines: ["> All posting loops have been stopped."],
            }),
        });
    }

    engine.startAutoPost(userId);
    return interaction.update({
        flags: MessageFlags.IsComponentsV2,
        components: panelWithNote(client, userId, {
            accent: 0x57f287,
            title: "▶️ **AutoPost Started**",
            lines: [`> Posting to **${config.channels.length}** channel(s).`],
        }),
    });
}

async function handleRemoveChannelFlow(client, interaction) {
    const userId = interaction.user.id;
    const selectRow = buildRemoveChannelSelect(userId);

    if (!selectRow) {
        return interaction.update({
            flags: MessageFlags.IsComponentsV2,
            components: panelWithNote(client, userId, {
                accent: 0xfee75c,
                title: "⚠️ **No Channels**",
                lines: ["> There are no channels to remove."],
            }),
        });
    }

    // Panel V2 tidak boleh campur ActionRow biasa — edit panel jadi instruksi,
    // lalu kirim select menu sebagai follow-up ephemeral.
    await interaction.update({
        flags: MessageFlags.IsComponentsV2,
        components: panelWithNote(client, userId, {
            accent: 0x5865f2,
            title: "🗑️ **Remove Channel**",
            lines: ["> Pick a channel from the select menu sent below."],
        }),
    });

    await interaction.followUp({
        flags: MessageFlags.Ephemeral,
        content: "🗑️ Select a channel to remove:",
        components: [selectRow],
    });
}

async function handleEditChannelFlow(client, interaction) {
    const userId = interaction.user.id;
    const selectRow = buildEditChannelSelect(userId);

    if (!selectRow) {
        return interaction.update({
            flags: MessageFlags.IsComponentsV2,
            components: panelWithNote(client, userId, {
                accent: 0xfee75c,
                title: "⚠️ **No Channels**",
                lines: ["> There are no channels to edit."],
            }),
        });
    }

    // Panel V2 tidak boleh campur ActionRow biasa — edit panel jadi instruksi,
    // lalu kirim select menu sebagai follow-up ephemeral.
    await interaction.update({
        flags: MessageFlags.IsComponentsV2,
        components: panelWithNote(client, userId, {
            accent: 0x5865f2,
            title: "✏️ **Edit Message**",
            lines: ["> Pick a channel from the select menu sent below."],
        }),
    });

    await interaction.followUp({
        flags: MessageFlags.Ephemeral,
        content: "✏️ Select a channel to edit its message:",
        components: [selectRow],
    });
}

async function handleBackToPanel(client, interaction) {
    const userId = interaction.user.id;
    return interaction.update({
        flags: MessageFlags.IsComponentsV2,
        components: panelWithNote(client, userId, null),
    });
}

/**
 * Cleanup room lama (sistem room sudah dihapus). Menghapus channel room jika
 * masih ada, lalu menghapus entry room dari store.
 */
async function handleCloseRoom(client, interaction) {
    const userId = interaction.user.id;
    const room = store.getUserRoom(userId);

    if (!room) {
        return interaction.update({
            flags: MessageFlags.IsComponentsV2,
            components: panelWithNote(client, userId, {
                accent: 0xfee75c,
                title: "ℹ️ **No Room**",
                lines: ["> You don't have an active private room."],
            }),
        });
    }

    await interaction.deferUpdate();

    try {
        const channel = await client.channels.fetch(room.channelId).catch(() => null);
        if (channel) await channel.delete("AutoPost room cleanup by user");
    } catch (err) {
        console.error("[AUTOPOST] close room delete channel error:", err.message);
    }

    store.deletePrivateRoom(room.roomId);

    return interaction.editReply({
        flags: MessageFlags.IsComponentsV2,
        components: panelWithNote(client, userId, {
            accent: 0xed4245,
            title: "🧹 **Room Deleted**",
            lines: ["> Your old private room has been removed."],
        }),
    });
}

// ─── Select menu handler ────────────────────────────────────────────────────

async function handleRemoveSelect(client, interaction) {
    const userId = interaction.user.id;
    const channelId = interaction.values[0];

    const removed = store.removeChannel(userId, channelId);

    // Edit pesan select (ephemeral) jadi konfirmasi + panel terbaru.
    return interaction.update({
        flags: MessageFlags.IsComponentsV2,
        components: panelWithNote(client, userId, {
            accent: removed ? 0x57f287 : 0xfee75c,
            title: removed ? "✅ **Channel Removed**" : "⚠️ **Not Found**",
            lines: [
                removed
                    ? `> Channel \`${channelId}\` has been removed from your config.`
                    : "> That channel was not found in your config.",
            ],
        }),
    });
}

/**
 * Select menu edit — langsung buka modal dengan pesan saat ini ter-prefill.
 * showModal menyelesaikan interaksi ini tanpa perlu mengedit pesan select.
 */
async function handleEditSelect(interaction) {
    const channelId = interaction.values[0];
    return showEditChannelModal(interaction, channelId);
}

// ─── Modal handlers ─────────────────────────────────────────────────────────

async function handleAddChannelModal(client, interaction) {
    const userId = interaction.user.id;

    const channelId = interaction.fields.getTextInputValue("ch_id").trim();
    const message = interaction.fields.getTextInputValue("ch_message").trim();
    const hours = parseInt(interaction.fields.getTextInputValue("ch_hours") || "0", 10) || 0;
    const minutes = parseInt(interaction.fields.getTextInputValue("ch_minutes") || "0", 10) || 0;
    const seconds = parseInt(interaction.fields.getTextInputValue("ch_seconds") || "0", 10) || 0;

    const interval = hours * 3600 + minutes * 60 + seconds;

    if (interval <= 0) {
        return interaction.update({
            flags: MessageFlags.IsComponentsV2,
            components: panelWithNote(client, userId, {
                accent: 0xed4245,
                title: "❌ **Invalid Interval**",
                lines: ["> Total interval must be greater than 0 seconds."],
            }),
        });
    }

    const added = store.addChannel(userId, { id: channelId, message, interval });

    if (!added) {
        return interaction.update({
            flags: MessageFlags.IsComponentsV2,
            components: panelWithNote(client, userId, {
                accent: 0xfee75c,
                title: "⚠️ **Duplicate Channel**",
                lines: [`> Channel \`${channelId}\` is already in your config.`],
            }),
        });
    }

    const preview = message.length > 100 ? `${message.slice(0, 100)}…` : message;

    // update() pada modal submission = edit pesan panel ephemeral asalnya.
    return interaction.update({
        flags: MessageFlags.IsComponentsV2,
        components: panelWithNote(client, userId, {
            accent: 0x57f287,
            title: "✅ **Channel Added**",
            lines: [
                `> 📻 Channel: <#${channelId}>\n> ⏱️ Interval: every \`${formatInterval(interval)}\`\n> 💬 Message: "${preview}"`,
            ],
        }),
    });
}

async function handleEditChannelModal(client, interaction) {
    const userId = interaction.user.id;

    const channelId = interaction.fields.getTextInputValue("edit_ch_id").trim();
    const message = interaction.fields.getTextInputValue("edit_ch_message").trim();

    if (!message) {
        return interaction.update({
            flags: MessageFlags.IsComponentsV2,
            components: panelWithNote(client, userId, {
                accent: 0xed4245,
                title: "❌ **Empty Message**",
                lines: ["> Message content cannot be empty."],
            }),
        });
    }

    // Mutasi in-place → loop AutoPost yang sedang berjalan langsung pakai
    // pesan baru pada iterasi berikutnya.
    const updated = store.updateChannel(userId, channelId, { message });

    if (!updated) {
        return interaction.update({
            flags: MessageFlags.IsComponentsV2,
            components: panelWithNote(client, userId, {
                accent: 0xfee75c,
                title: "⚠️ **Not Found**",
                lines: [`> Channel \`${channelId}\` was not found in your config.`],
            }),
        });
    }

    const preview = message.length > 100 ? `${message.slice(0, 100)}…` : message;

    return interaction.update({
        flags: MessageFlags.IsComponentsV2,
        components: panelWithNote(client, userId, {
            accent: 0x57f287,
            title: "✅ **Message Updated**",
            lines: [
                `> 📻 Channel: <#${channelId}>\n> 💬 New message: "${preview}"`,
            ],
        }),
    });
}

async function handleSetTokenModal(client, interaction) {
    const userId = interaction.user.id;
    const token = interaction.fields.getTextInputValue("token_input").trim();

    store.setUserConfig(userId, { token });
    store.setUsername(userId, interaction.user.username);

    return interaction.update({
        flags: MessageFlags.IsComponentsV2,
        components: panelWithNote(client, userId, {
            accent: 0x57f287,
            title: "✅ **Token Saved**",
            lines: ["> Your user token has been updated."],
        }),
    });
}

// ─── Whitelist gate ─────────────────────────────────────────────────────────

/**
 * Cek akses panel AutoPost. Owner selalu lolos. Jika settings.whitelistRoleId
 * atau setupRoleId diisi dan member punya salah satunya, lolos.
 * Jika whitelist kosong, semua orang boleh.
 * @param {import("discord.js").Interaction} interaction
 * @returns {boolean}
 */
function hasPanelAccess(interaction) {
    if (!interaction.guild || !interaction.member) return false;
    if (interaction.user.id === interaction.guild.ownerId) return true;

    const { whitelistRoleId, setupRoleId } = store.getSettings();
    if (!whitelistRoleId) return true; // belum diset = terbuka untuk semua

    const roles = interaction.member.roles?.cache;
    if (!roles) return false;
    if (setupRoleId && roles.has(setupRoleId)) return true;
    return roles.has(whitelistRoleId);
}

// ─── Main router ────────────────────────────────────────────────────────────

/**
 * Entry point routing interaksi AutoPost. Dipanggil dari index.js untuk semua
 * interaksi dengan customId ber-prefix "ap_".
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").Interaction} interaction
 */
async function handleAutoPostInteraction(client, interaction) {
    try {
        // Whitelist: hanya owner / pemegang role whitelist yang boleh pakai panel.
        if (!hasPanelAccess(interaction)) {
            return await interaction.reply({
                content: "❌ Kamu tidak punya akses ke panel AutoPost ini.",
                flags: MessageFlags.Ephemeral,
            });
        }

        // ── Buttons ──────────────────────────────────────────────────────
        if (interaction.isButton()) {
            switch (interaction.customId) {
                // CustomId lama (ap_open_panel, ap_create_room,
                // ap_public_create_room) tetap diarahkan ke panel ephemeral
                // supaya panel lama yang sudah terpasang tidak mati.
                case "ap_open_my_panel":
                case "ap_open_panel":
                case "ap_create_room":
                case "ap_public_create_room":
                    return await handleOpenMyPanel(client, interaction);
                case "ap_set_token":
                    return await showSetTokenModal(interaction);
                case "ap_add_channel":
                    return await showAddChannelModal(interaction);
                case "ap_toggle_post":
                    return await handleTogglePost(client, interaction);
                case "ap_remove_channel":
                    return await handleRemoveChannelFlow(client, interaction);
                case "ap_edit_channel":
                    return await handleEditChannelFlow(client, interaction);
                case "ap_back_to_panel":
                    return await handleBackToPanel(client, interaction);
                case "ap_close_room":
                    return await handleCloseRoom(client, interaction);
                default:
                    return;
            }
        }

        // ── String select menu ───────────────────────────────────────────
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === "ap_remove_select") {
                return await handleRemoveSelect(client, interaction);
            }
            if (interaction.customId === "ap_edit_select") {
                return await handleEditSelect(interaction);
            }
            return;
        }

        // ── Modal submit ─────────────────────────────────────────────────
        if (interaction.isModalSubmit()) {
            switch (interaction.customId) {
                case "ap_add_channel_modal":
                    return await handleAddChannelModal(client, interaction);
                case "ap_set_token_modal":
                    return await handleSetTokenModal(client, interaction);
                case "ap_edit_channel_modal":
                    return await handleEditChannelModal(client, interaction);
                default:
                    return;
            }
        }
    } catch (err) {
        console.error("[AUTOPOST] interaction error:", err);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: "❌ Something went wrong handling that interaction.",
                    flags: MessageFlags.Ephemeral,
                });
            }
        } catch {
            // Interaction expired — abaikan
        }
    }
}

module.exports = { handleAutoPostInteraction };
