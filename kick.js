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
        .setName('kick')
        .setDescription("Kick a user from the server")
        .addUserOption(option => option.setName('user').setDescription('The user to kick').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('The reason for kick').setRequired(config.Kick.RequireReason)),
    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason");

        let punishmentID = await utils.generatePunishmentID();

        const errorEmbed = new Discord.EmbedBuilder();
        errorEmbed.setColor('#ED4245');
        errorEmbed.setTimestamp();

        const { success, message, discordMessage } = await utils.kickUser(user, interaction.user, reason, punishmentID);

        if (success) {
            await interaction.editReply({ content: discordMessage, ephemeral: true });
        } else {
            errorEmbed.setTitle('Failed to kick');
            errorEmbed.setDescription(message);
            return interaction.editReply({ embeds: [errorEmbed] });
        }
    }

}