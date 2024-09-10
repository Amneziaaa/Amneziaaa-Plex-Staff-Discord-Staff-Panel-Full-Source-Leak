const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require("discord.js");
const fs = require('fs');
const yaml = require("js-yaml");
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));
const utils = require("../utils.js");
const staffModel = require('../models/staffModel');
const guildModel = require('../models/guildModel');
const userModel = require("../models/userModel");
const punishmentModel = require('../models/punishmentModel');
const ms = require('parse-duration');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription("Timeout a user")
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set a timeout for a user')
                .addUserOption(option => option.setName('user').setDescription('The user to timeout').setRequired(true))
                .addStringOption(option => option.setName('time').setDescription('How long the user should be timed out, for example: 1d, 1h, 1m').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('The reason for timeout').setRequired(config.Timeout.RequireReason))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear the timeout of a user')
                .addUserOption(option => option.setName('user').setDescription('The user to clear timeout').setRequired(true))
        ),
    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        const errorEmbed = new Discord.EmbedBuilder()
        .setColor('#ED4245')
        .setTimestamp();

        const hasPermission = await utils.checkPermission(interaction.user.id, "TIMEOUT_USERS");
        if (!hasPermission) {
            errorEmbed.setTitle('Failed to timeout');
            errorEmbed.setDescription(`Sorry, you don't have permissions to do this!`);
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        const guildData = await guildModel.findOne({ guildID: config.GuildID });

        if (interaction.options.getSubcommand() === 'set') {
            // Code for setting a timeout
            const user = interaction.options.getUser("user");
            const reason = interaction.options.getString("reason") || "No reason specified.";
            const time = interaction.options.getString("time");
            const member = await interaction.guild.members.fetch(user.id);

            const timeInMs = ms(time)
            if (!timeInMs) {
                errorEmbed.setTitle('Failed to timeout');
                errorEmbed.setDescription(`Please specify a valid time! for example: 1d, 1h, 1m`);
                return interaction.editReply({ embeds: [errorEmbed] });
            }

            if (timeInMs < 10000 || timeInMs > 2419200000) {
                errorEmbed.setTitle('Failed to timeout');
                errorEmbed.setDescription(`Timeout can't be shorter than 10 seconds and longer than 28 days!`);
                return interaction.editReply({ embeds: [errorEmbed] });
            }

            let punishmentID = await utils.generatePunishmentID();
            const StaffMember = await staffModel.findOne({ userId: user.id });

            if (user.id === interaction.user.id) {
                errorEmbed.setTitle('Failed to timeout');
                errorEmbed.setDescription(`You can't timeout yourself!`);
                return interaction.editReply({ embeds: [errorEmbed] });
            }
            if (!member) {
                errorEmbed.setTitle('Failed to timeout');
                errorEmbed.setDescription(`The user is not in the server!`);
                return interaction.editReply({ embeds: [errorEmbed] });
            }
            if (user.bot) {
                errorEmbed.setTitle('Failed to timeout');
                errorEmbed.setDescription(`You can't timeout a bot!`);
                return interaction.editReply({ embeds: [errorEmbed] });
            }
            if (StaffMember) {
                errorEmbed.setTitle('Failed to timeout');
                errorEmbed.setDescription(`You can't timeout a staff member!`);
                return interaction.editReply({ embeds: [errorEmbed] });
            }

            const logEmbed = new Discord.EmbedBuilder()
            .setAuthor({ name: `Moderation Action`, iconURL: `https://i.imgur.com/6vU8Acu.png` })
            .setColor("Red")
            .addFields([
              { name: `Action`, value: `\`\`Timeout\`\` *(<t:${(Date.now() / 1000 | 0)}:R>)*` },
              { name: `Details`, value: `\`\`Staff\`\` <@!${interaction.user.id}>\n\`\`User\`\` <@!${member.id}>\n\`\`Reason\`\` ${reason}\n\`\`Time\`\` ${time}` },
              ])
            .setTimestamp()
            .setFooter({ text: `#${guildData.totalActions} | ID: ${punishmentID}`, iconURL: `${interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })

            const punishmentIDButton = new Discord.ButtonBuilder()
            .setStyle('Primary')
            .setCustomId('punishmentid')
            .setLabel(`ID: ${punishmentID}`)
            .setDisabled(true);

            const viewProfileButton = new Discord.ButtonBuilder()
            .setStyle('Link')
            .setLabel('View Profile')
            .setURL(`${config.Dashboard.URL}/view/${member.id}`);

        const actionRow = new Discord.ActionRowBuilder().addComponents(punishmentIDButton, viewProfileButton);
        // components: [actionRow]

            let logsChannel = interaction.guild.channels.cache.get(config.Timeout.LogsChannelID);

            async function timeoutUser() {

                // DM User
                if (config.Timeout.DMUser.Enabled) {
                    try {
                        const embedSettings = config.Timeout.DMUser.Embed;
                        const dmEmbed = new Discord.EmbedBuilder()
                        if(embedSettings.Author && embedSettings.AuthorIcon) dmEmbed.setAuthor({ name: embedSettings.Author, iconURL: embedSettings.AuthorIcon })
                        if(embedSettings.Author && !embedSettings.AuthorIcon) dmEmbed.setAuthor({ name: embedSettings.Author })
                        if (embedSettings.Color) dmEmbed.setColor(embedSettings.Color);
                        if (embedSettings.Description) dmEmbed.setDescription(embedSettings.Description.replace('{guildName}', interaction.guild.name)
                            .replace('{user}', `<@!${member.id}>`)
                            .replace('{username}', user.username)
                            .replace('{staff}', `<@!${interaction.user.id}>`)
                            .replace('{reason}', reason)
                            .replace('{punishmentID}', punishmentID)
                            .replace('{time}', time))

                        if (embedSettings.ThumbnailEnabled) {
                            if (embedSettings.CustomThumbnail && embedSettings.CustomThumbnail !== '') {
                                dmEmbed.setThumbnail(embedSettings.CustomThumbnail);
                            } else {
                                dmEmbed.setThumbnail(user.displayAvatarURL({ format: 'png', dynamic: true }));
                            }
                        }

                        dmEmbed.addFields(embedSettings.Fields.map(field => ({
                            name: field.name,
                            value: field.value.replace('{guildName}', interaction.guild.name)
                                .replace('{user}', `<@!${member.id}>`)
                                .replace('{username}', user.username)
                                .replace('{staff}', `<@!${interaction.user.id}>`)
                                .replace('{reason}', reason)
                                .replace('{time}', time)
                                .replace('{punishmentID}', punishmentID),
                        })));

                        if (embedSettings.Timestamp) {
                            dmEmbed.setTimestamp();
                        }

                        const footerText = embedSettings.Footer.text.replace('{guildName}', interaction.guild.name)
                            .replace('{username}', user.username)
                            .replace('{reason}', reason)
                            .replace('{punishmentID}', punishmentID)

                        // Check if footer.text is not blank before setting the footer
                        if (footerText.trim() !== '') {
                            if (embedSettings.Footer.Enabled && embedSettings.Footer.CustomIconURL == '' && embedSettings.Footer.IconEnabled) {
                                dmEmbed.setFooter({
                                    text: footerText,
                                    iconURL: user.displayAvatarURL({ format: 'png', dynamic: true }),
                                });
                            } else {
                                dmEmbed.setFooter({
                                    text: footerText,
                                });
                            }
                        }

                        // Additional customization options from config.yaml
                        if (footerText.trim() !== '' && embedSettings.Footer.CustomIconURL !== '' && embedSettings.Footer.IconEnabled) {
                            dmEmbed.setFooter({
                                text: footerText,  // Include text if it's not empty
                                iconURL: embedSettings.Footer.CustomIconURL,
                            });
                        }

                        const appealButton = new Discord.ButtonBuilder()
                        .setStyle('Link')
                        .setLabel('Appeal Punishment')
                        .setURL(config.AppealSystem.CustomLink || `${config.Dashboard.URL}/appeal/${punishmentID}`);
              
                        const actionRow = new Discord.ActionRowBuilder().addComponents(appealButton);
              
                        if(config.AppealSystem.Enabled && config.Timeout.Appealable) await member.send({ embeds: [dmEmbed], components: [actionRow] });
                        if(config.AppealSystem.Enabled && !config.Timeout.Appealable) await member.send({ embeds: [dmEmbed] });
                        if(!config.AppealSystem.Enabled) await member.send({ embeds: [dmEmbed] });
                    } catch (e) {
                        console.log('\x1b[33m%s\x1b[0m', "[INFO] I tried to DM a user, but their DM's are locked.");
                    }

                    let userFromDB = await userModel.findOne({ userID: user.id });
                    if(!userFromDB) await userModel.create({ userID: user.id });

                    const newPunishment = new punishmentModel({
                        userID: user.id,
                        username: user.username,
                        punishment: 'Timeout',
                        punishmentID: punishmentID,
                        reason: reason,
                        staff: interaction.user.id,
                        staffUsername: interaction.user.username,
                        recentMessages: userFromDB?.messageHistory || []
                    });
                    await newPunishment.save();

                    guildData.totalActions = (guildData.totalActions || 0) + 1;
                    guildData.totalTimeouts = (guildData.totalTimeouts || 0) + 1;
                    await guildData.save();

                    utils.incrementStats(new Date(), 'timeouts')

                    member.timeout(timeInMs, reason).catch(error => interaction.editReply({ content: `Sorry, I couldn't timeout because of an error`, ephemeral: true }));
                    interaction.editReply({ content: `${user} has been timed out for ${time}`, ephemeral: true })
                    if (logsChannel) logsChannel.send({ embeds: [logEmbed], components: [actionRow] });
                }
            }
            timeoutUser()

        } else if (interaction.options.getSubcommand() === 'clear') {
            // Code for clearing a timeout
            const user = interaction.options.getUser("user");
            const member = await interaction.guild.members.fetch(user.id);

            // Clear timeout logic
            // Example: Check if the user has a timeout, and then remove it
            if (member.communicationDisabledUntilTimestamp) {
                member.timeout(null, "Timeout cleared").catch(error =>  console.log(error));
                interaction.editReply({ content: `Timeout for ${user} has been cleared`, ephemeral: true });

                guildData.totalActions = (guildData.totalActions || 0) + 1;
                await guildData.save();

            } else {
                interaction.editReply({ content: `There is no timeout set for ${user}`, ephemeral: true });
            }
        }
    }
};
