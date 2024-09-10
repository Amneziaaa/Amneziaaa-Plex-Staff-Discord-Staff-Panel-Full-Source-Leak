const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require ("discord.js")
const fs = require('fs');
const yaml = require("js-yaml")
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
const utils = require("../utils.js");
const staffModel = require('../models/staffModel');
const userModel = require("../models/userModel");
const guildModel = require('../models/guildModel');

module.exports = {
    //enabled: commands.General.Ping.Enabled,
    data: new SlashCommandBuilder()
        .setName('note')
        .setDescription("Manage notes for a user")
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set a note on a user')
                .addUserOption(option => option.setName('user').setDescription('The user to set the note on').setRequired(true))
                .addStringOption(option => option.setName('note').setDescription('The note to set on the user').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear the note of a user')
                .addUserOption(option => option.setName('user').setDescription('The user to clear note for').setRequired(true))
        ),
    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        const guildData = await guildModel.findOne({ guildID: config.GuildID });

        const user = interaction.options.getUser("user");
        const noteText = interaction.options.getString("note");

        const errorEmbed = new Discord.EmbedBuilder();
        errorEmbed.setColor('#ED4245');
        errorEmbed.setTimestamp();

        if (interaction.options.getSubcommand() === 'set') {

        const { success, message, discordMessage } = await utils.setNote(user, interaction.user, noteText);

        if (success) {
            await interaction.editReply({ content: discordMessage, ephemeral: true });
        } else {
            errorEmbed.setTitle('Failed to set note');
            errorEmbed.setDescription(message);
            return interaction.editReply({ embeds: [errorEmbed] });
        }
    } else if (interaction.options.getSubcommand() === 'clear') {

        const hasPermission = await utils.checkPermission(interaction.user.id, "SET_NOTES");
        if (!hasPermission) {
            errorEmbed.setTitle('Failed to set note');
            errorEmbed.setDescription(`Sorry, you don't have permissions to do this!`);
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        let userData = await userModel.findOne({ userID: user.id });
        if (!userData || !userData.note) {
            errorEmbed.setTitle('Failed to set note');
            errorEmbed.setDescription("The user doesn't have a note!");
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        const logEmbed = new Discord.EmbedBuilder()
        .setAuthor({ name: `Moderation Action`, iconURL: `https://i.imgur.com/6vU8Acu.png` })
        .setColor("Red")
        .addFields([
          { name: `Action`, value: `\`\`Note Cleared\`\` *(<t:${(Date.now() / 1000 | 0)}:R>)*` },
          { name: `Details`, value: `\`\`Staff\`\` <@!${interaction.user.id}>\n\`\`User\`\` <@!${user.id}>\n\`\`Old Note\`\` ${userData.note}` },
          ])
        .setTimestamp()
        .setFooter({ text: `#${guildData.totalActions}`, iconURL: `${interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })

        const logsChannel = interaction.guild.channels.cache.get(config.Note.LogsChannelID);

        userData.note = undefined;
        await userData.save();

        guildData.totalActions = (guildData.totalActions || 0) + 1;
        await guildData.save();

        await interaction.editReply({ content: `<@!${user.id}>'s note has been cleared!`, ephemeral: true });
        if (logsChannel) logsChannel.send({ embeds: [logEmbed] });
}

}

}