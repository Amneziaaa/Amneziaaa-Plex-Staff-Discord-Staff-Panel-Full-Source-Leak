const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require ("discord.js")
const fs = require('fs');
const yaml = require("js-yaml")
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
const utils = require("../utils.js");
const staffModel = require('../models/staffModel');
const punishmentModel = require('../models/punishmentModel');

module.exports = {
    //enabled: commands.General.Ping.Enabled,
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription("Issue a warning for a user")
        .addUserOption(option => option.setName('user').setDescription('The user to warn').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('The reason for warning').setRequired(config.Warn.RequireReason)),
    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason");

        let punishmentID = await utils.generatePunishmentID();

        const errorEmbed = new Discord.EmbedBuilder();
        errorEmbed.setColor('#ED4245');
        errorEmbed.setTimestamp();

        const { success, message, discordMessage } = await utils.warnUser(user, interaction.user, reason, punishmentID);

        if (success) {
            await interaction.editReply({ content: discordMessage, ephemeral: true });
        } else {
            errorEmbed.setTitle('Failed to warn');
            errorEmbed.setDescription(message);
            return interaction.editReply({ embeds: [errorEmbed] });
        }
    }

}