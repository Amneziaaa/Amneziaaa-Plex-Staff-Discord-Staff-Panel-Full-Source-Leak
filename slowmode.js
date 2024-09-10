const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require("discord.js");
const fs = require('fs');
const yaml = require("js-yaml");
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));
const guildModel = require('../models/guildModel');
const utils = require("../utils.js");

module.exports = {
    //enabled: commands.General.Ping.Enabled,
    data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription("Manage channel slowmode")
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription("Set slowmode in a channel")
                .addNumberOption(option => option.setName('amount').setDescription('Slowmode time in seconds (1-21600 Seconds), Set to 0 to disable.').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('The reason for slowmode').setRequired(config.Slowmode.RequireReason))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription("Clear slowmode in a channel")
        ),
    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        const errorEmbed = new Discord.EmbedBuilder()
        .setColor('#ED4245')
        .setTimestamp();

        const hasPermission = await utils.checkPermission(interaction.user.id, "SET_SLOWMODE");
        if (!hasPermission) {
            errorEmbed.setTitle('Failed to set slowmode');
            errorEmbed.setDescription(`Sorry, you don't have permissions to do this!`);
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        const guildData = await guildModel.findOne({ guildID: config.GuildID });

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set') {
            let amount = interaction.options.getNumber("amount");
            let reason = interaction.options.getString("reason");
            if (!reason) reason = "No reason specified."

            if (amount > 21600) amount = 21600;
            if (amount < 0) amount = 1;

            const logEmbed = new Discord.EmbedBuilder()
                .setAuthor({ name: `Moderation Action`, iconURL: `https://i.imgur.com/6vU8Acu.png` })
                .setColor("Red")
                .addFields(
                    { name: 'Action', value: `\`\`Slowmode\`\` (<t:${(Date.now() / 1000 | 0)}:R>)` },
                    { name: 'Details', value: `\`\`Staff\`\` <@!${interaction.user.id}>\n\`\`Channel\`\` ${interaction.channel.name}\n\`\`Time\`\` ${amount} seconds\n\`\`Reason\`\` ${reason}` }
                )
                .setTimestamp()
                .setFooter({ text: `${guildData.totalActions}`, iconURL: `${interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })

            let logsChannel = interaction.guild.channels.cache.get(config.Slowmode.LogsChannelID);
            try {
                await interaction.channel.setRateLimitPerUser(amount);
                await interaction.editReply({ content: `The cooldown for this channel has been set to \`\`${amount}\`\` seconds.`, ephemeral: true });

                guildData.totalActions = (guildData.totalActions || 0) + 1;
                await guildData.save();

                if (logsChannel) await logsChannel.send({ embeds: [logEmbed] });
            } catch (error) {
                await interaction.editReply({ content: "Failed to set slowmode in this channel, check your slowmode length.", ephemeral: true });
            }
        } else if (subcommand === 'clear') {
            try {
                await interaction.channel.setRateLimitPerUser(0);

                await interaction.editReply({ content: "Slowmode cleared.", ephemeral: true });
            } catch (error) {
                await interaction.editReply({ content: "Failed to clear slowmode in this channel.", ephemeral: true });
            }
        }
    }
};
