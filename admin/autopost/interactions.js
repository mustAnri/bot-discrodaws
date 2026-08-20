/**
 * admin/autopost/interactions.js
 *
 * Router interaksi AutoPost (port gabungan dari anri autopost-interactions.js
 * + autopost-modals.js). AutoLogin DIHAPUS total — semua handler ap_al_* tidak
 * di-port, token field = config.token biasa.
 *
 * Semua customId memakai prefix "ap_" (routing dari index.js).
 */

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    ContainerBuilder,
    MessageFlags,
    ModalBuilder,
    PermissionFlagsBits,
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
    buildWelcomeContainer,
    buildRemoveChannelSelect,
    formatInterval,
    botAvatar
} = require("./builders");

// ─── Feedback container kecil (pola anri) ───────────────────────────────────

function thumb(client) {
    return new ThumbnailBuilder({ media: { url: botAvatar(client, 128) } });
}

/**
 * Container feedback sederhana: judul + 2-3 baris teks + thumbnail.
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

// ─── Refresh panel di private room ──────────────────────────────────────────

async function refreshUserPanel(client, userId) {
    try {
        const room = store.getUserRoom(userId);
        if (!room) return;

        const channel = await client.channels.fetch(room.channelId).catch(() => null);
        if (!channel) return;
        if (!room.panelMessageId) return;

        const msg = await channel.messages.fetch(room.panelMessageId).catch(() => null);
        if (!msg) return;

        const { container: welcomeContainer } = buildWelcomeContainer(client, userId);
        const { container: panelContainer } = buildPanel(userId, client);

        await msg.edit({
            flags: MessageFlags.IsComponentsV2,
            components: [welcomeContainer, panelContainer]
        });
    } catch (err) {
        console.error("[AUTOPOST] refreshUserPanel error:", err.message);
    }
}

// ─── Button handlers ────────────────────────────────────────────────────────

async function handleTogglePost(client, interaction) {
    const userId = interaction.user.id;
    const config = store.getUserConfig(userId);
    store.setUsername(userId, interaction.user.username);

    if (!config.token) {
        return interaction.update({
            flags: MessageFlags.IsComponentsV2,
            components: [
                infoContainer(client, 0xfee75c, "⚠️ **No Token Set**", [
                    "> Set your user token first using the **Set Token** button.",
                ]),
            ],
        });
    }

    if (config.channels.length === 0) {
        return interaction.update({
            flags: MessageFlags.IsComponentsV2,
            components: [
                infoContainer(client, 0xfee75c, "⚠️ **No Channels**", [
                    "> Add at least one channel before starting AutoPost.",
                ]),
            ],
        });
    }

    if (engine.isAutoPostActive(userId)) {
        engine.stopAutoPost(userId);
        await refreshUserPanel(client, userId);
        return interaction.update({
            flags: MessageFlags.IsComponentsV2,
            components: [
                infoContainer(client, 0xed4245, "⏹️ **AutoPost Stopped**", [
                    "> All posting loops have been stopped.",
                ]),
            ],
        });
    }

    engine.startAutoPost(userId);
    await refreshUserPanel(client, userId);
    return interaction.update({
        flags: MessageFlags.IsComponentsV2,
        components: [
            infoContainer(client, 0x57f287, "▶️ **AutoPost Started**", [
                `> Posting to **${config.channels.length}** channel(s).`,
            ]),
        ],
    });
}

async function handleRemoveChannelFlow(client, interaction) {
    const userId = interaction.user.id;
    const selectRow = buildRemoveChannelSelect(userId);

    if (!selectRow) {
        return interaction.update({
            flags: MessageFlags.IsComponentsV2,
            components: [
                infoContainer(client, 0xfee75c, "⚠️ **No Channels**", [
                    "> There are no channels to remove.",
                ]),
            ],
        });
    }

    // Panel V2 tidak boleh campur ActionRow biasa — edit panel jadi instruksi,
    // lalu kirim select menu sebagai pesan baru di channel yang sama.
    await interaction.update({
        flags: MessageFlags.IsComponentsV2,
        components: [
            infoContainer(client, 0x5865f2, "🗑️ **Remove Channel**", [
                "> Pick a channel from the select menu sent below.",
            ]),
        ],
    });

    await interaction.channel.send({
        content: "🗑️ Select a channel to remove:",
        components: [selectRow],
    });
}

async function handleBackToPanel(client, interaction) {
    const userId = interaction.user.id;
    const { container } = buildPanel(userId, client);
    return interaction.update({
        flags: MessageFlags.IsComponentsV2,
        components: [container],
    });
}

async function handleOpenPanel(client, interaction) {
    const userId = interaction.user.id;
    const { container: welcomeContainer } = buildWelcomeContainer(client, userId);
    const { container: panelContainer } = buildPanel(userId, client);
    return interaction.update({
        flags: MessageFlags.IsComponentsV2,
        components: [welcomeContainer, panelContainer],
    });
}

async function handleCloseRoom(client, interaction) {
    const userId = interaction.user.id;
    const room = store.getUserRoom(userId);

    if (!room) {
        return interaction.reply({
            content: "❌ You don't have an active private room.",
            flags: MessageFlags.Ephemeral,
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const channel = await client.channels.fetch(room.channelId).catch(() => null);
        if (channel) await channel.delete("AutoPost room closed by user");
    } catch (err) {
        console.error("[AUTOPOST] close room delete channel error:", err.message);
    }

    store.deletePrivateRoom(room.roomId);

    return interaction.editReply({
        flags: MessageFlags.IsComponentsV2,
        components: [
            infoContainer(client, 0xed4245, "🔒 **Room Closed**", [
                "> Your private room has been deleted.",
            ]),
        ],
    });
}

// ─── Create private room ────────────────────────────────────────────────────

const ROOM_CATEGORY_NAME = "🔒 AutoPost Rooms";

async function handleCreateRoom(client, interaction) {
    const userId = interaction.user.id;
    const guild = interaction.guild;

    if (!guild) {
        return interaction.reply({
            content: "❌ This button only works inside a server.",
            flags: MessageFlags.Ephemeral,
        });
    }

    store.setUsername(userId, interaction.user.username);

    // Cek room yang sudah ada di store
    const existingRoom = store.getUserRoom(userId);
    if (existingRoom) {
        const existingChannel = await client.channels
            .fetch(existingRoom.channelId)
            .catch(() => null);

        if (existingChannel) {
            return interaction.reply({
                flags: MessageFlags.IsComponentsV2,
                components: [
                    infoContainer(client, 0xfee75c, "⚠️ **Room Already Exists**", [
                        `> You already have a private room: <#${existingRoom.channelId}>`,
                    ]),
                ],
            });
        }
        // Channel hilang tapi store masih ada → bersihkan entry usang
        store.deletePrivateRoom(existingRoom.roomId);
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const allChannels = await guild.channels.fetch();

        // Cari category AutoPost Rooms
        let category = allChannels.find(
            (ch) => ch && ch.type === ChannelType.GuildCategory && ch.name === ROOM_CATEGORY_NAME,
        );

        if (!category) {
            category = await guild.channels.create({
                name: ROOM_CATEGORY_NAME,
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                ],
            });
        }

        // Cari channel autopost-<username> yang sudah ada di category tsb
        const wantedName = `autopost-${interaction.user.username}`.toLowerCase();
        let channel = allChannels.find(
            (ch) =>
                ch &&
                ch.type === ChannelType.GuildText &&
                ch.parentId === category.id &&
                ch.name.toLowerCase() === wantedName,
        );

        if (!channel) {
            channel = await guild.channels.create({
                name: wantedName,
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: userId,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                        ],
                    },
                    {
                        id: client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.ManageChannels,
                        ],
                    },
                ],
            });
        }

        const roomId = `${userId}-${Date.now()}`;
        store.createPrivateRoom(userId, roomId, channel.id, guild.id);

        const { container: welcomeContainer } = buildWelcomeContainer(client, userId);
        const { container: panelContainer } = buildPanel(userId, client);

        const sentMsg = await channel.send({
            flags: MessageFlags.IsComponentsV2,
            components: [welcomeContainer, panelContainer],
        });

        store.setPanelMessageId(roomId, sentMsg.id);

        const openButton = new ButtonBuilder()
            .setLabel("Open Room")
            .setStyle(ButtonStyle.Link)
            .setURL(channel.url);

        const closeButton = new ButtonBuilder()
            .setCustomId("ap_close_room")
            .setLabel("Close Room")
            .setStyle(ButtonStyle.Danger);

        return interaction.editReply({
            flags: MessageFlags.IsComponentsV2,
            components: [
                new ContainerBuilder()
                    .setAccentColor(0x57f287)
                    .addSectionComponents(
                        new SectionBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent("🔒 **Room Created**"),
                                new TextDisplayBuilder().setContent(
                                    `> Your private room is ready: <#${channel.id}>`,
                                ),
                            )
                            .setThumbnailAccessory(thumb(client)),
                    )
                    .addActionRowComponents(
                        new ActionRowBuilder().addComponents(openButton, closeButton),
                    ),
            ],
        });
    } catch (err) {
        console.error("[AUTOPOST] create room error:", err);
        return interaction.editReply({
            content: "❌ Failed to create private room. Check bot permissions.",
        });
    }
}

// ─── Select menu handler ────────────────────────────────────────────────────

async function handleRemoveSelect(client, interaction) {
    const userId = interaction.user.id;
    const channelId = interaction.values[0];

    const removed = store.removeChannel(userId, channelId);

    // Hapus pesan select menu agar tidak menumpuk
    await interaction.message.delete().catch(() => {});

    await refreshUserPanel(client, userId);

    return interaction.reply({
        flags: MessageFlags.IsComponentsV2,
        components: [
            infoContainer(
                client,
                removed ? 0x57f287 : 0xfee75c,
                removed ? "✅ **Channel Removed**" : "⚠️ **Not Found**",
                [
                    removed
                        ? `> Channel \`${channelId}\` has been removed from your config.`
                        : "> That channel was not found in your config.",
                ],
            ),
        ],
    });
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
        return interaction.reply({
            flags: MessageFlags.IsComponentsV2,
            components: [
                infoContainer(client, 0xed4245, "❌ **Invalid Interval**", [
                    "> Total interval must be greater than 0 seconds.",
                ]),
            ],
        });
    }

    const added = store.addChannel(userId, { id: channelId, message, interval });

    if (!added) {
        return interaction.reply({
            flags: MessageFlags.IsComponentsV2,
            components: [
                infoContainer(client, 0xfee75c, "⚠️ **Duplicate Channel**", [
                    `> Channel \`${channelId}\` is already in your config.`,
                ]),
            ],
        });
    }

    await refreshUserPanel(client, userId);

    const preview = message.length > 100 ? `${message.slice(0, 100)}…` : message;

    const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("ap_back_to_panel")
            .setLabel("Back to Panel")
            .setStyle(ButtonStyle.Primary),
    );

    return interaction.reply({
        flags: MessageFlags.IsComponentsV2,
        components: [
            new ContainerBuilder()
                .setAccentColor(0x57f287)
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent("✅ **Channel Added**"),
                            new TextDisplayBuilder().setContent(
                                `> 📻 Channel: <#${channelId}>\n> ⏱️ Interval: every \`${formatInterval(interval)}\`\n> 💬 Message: "${preview}"`,
                            ),
                        )
                        .setThumbnailAccessory(thumb(client)),
                )
                .addActionRowComponents(backRow),
        ],
    });
}

async function handleSetTokenModal(client, interaction) {
    const userId = interaction.user.id;
    const token = interaction.fields.getTextInputValue("token_input").trim();

    store.setUserConfig(userId, { token });
    store.setUsername(userId, interaction.user.username);

    await refreshUserPanel(client, userId);

    const { container } = buildPanel(userId, client);

    return interaction.reply({
        flags: MessageFlags.IsComponentsV2,
        components: [
            new ContainerBuilder()
                .setAccentColor(0x57f287)
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent("✅ **Token Saved**"),
                            new TextDisplayBuilder().setContent(
                                "> Your user token has been updated. Panel refreshed below.",
                            ),
                        )
                        .setThumbnailAccessory(thumb(client)),
                ),
            container,
        ],
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
                case "ap_set_token":
                    return await showSetTokenModal(interaction);
                case "ap_add_channel":
                    return await showAddChannelModal(interaction);
                case "ap_toggle_post":
                    return await handleTogglePost(client, interaction);
                case "ap_remove_channel":
                    return await handleRemoveChannelFlow(client, interaction);
                case "ap_back_to_panel":
                    return await handleBackToPanel(client, interaction);
                case "ap_open_panel":
                    return await handleOpenPanel(client, interaction);
                case "ap_create_room":
                case "ap_public_create_room":
                    return await handleCreateRoom(client, interaction);
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
            return;
        }

        // ── Modal submit ─────────────────────────────────────────────────
        if (interaction.isModalSubmit()) {
            switch (interaction.customId) {
                case "ap_add_channel_modal":
                    return await handleAddChannelModal(client, interaction);
                case "ap_set_token_modal":
                    return await handleSetTokenModal(client, interaction);
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
