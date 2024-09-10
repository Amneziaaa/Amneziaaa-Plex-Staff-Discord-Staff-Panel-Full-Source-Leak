const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require ("discord.js")
const fs = require('fs');
const yaml = require("js-yaml")
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
const utils = require("../utils.js");
const staffModel = require('../models/staffModel');
const punishmentModel = require('../models/punishmentModel');
const guildModel = require('../models/guildModel');

module.exports = {
    //enabled: commands.General.Ping.Enabled,
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription("Unban a user from the server")
        .addUserOption(option => option.setName('user').setDescription('The user to unban').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('The reason for unban').setRequired(config.Unban.RequireReason)),
    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason");

        let ban = await interaction.guild.bans.fetch();

        const guildData = await guildModel.findOne({ guildID: config.GuildID });

        const errorEmbed = new Discord.EmbedBuilder()
        .setColor('#ED4245')
        .setTimestamp();

        const hasPermission = await utils.checkPermission(interaction.user.id, "UNBAN_USERS");
        if (!hasPermission) {
            errorEmbed.setTitle('Failed to unban');
            errorEmbed.setDescription(`Sorry, you don't have permissions to do this!`);
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        if (!ban.get(user.id)) {
            errorEmbed.setTitle('Failed to unban');
            errorEmbed.setDescription(`The user is not banned!`);
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        try {
            await interaction.guild.bans.fetch().then(bans => {
                interaction.guild.members.unban(user, reason)
            })
    
            const logEmbed = new Discord.EmbedBuilder()
            .setAuthor({ name: `Moderation Action`, iconURL: `https://i.imgur.com/6vU8Acu.png` })
            .setColor("Red")
            .addFields([
              { name: `Action`, value: `\`\`Unban\`\` *(<t:${(Date.now() / 1000 | 0)}:R>)*` },
              { name: `Details`, value: `\`\`Staff\`\` <@!${interaction.user.id}>\n\`\`User\`\` <@!${user.id}>\n\`\`Reason\`\` ${reason}` },
              ])
            .setTimestamp()
            .setFooter({ text: `#${guildData.totalActions}`, iconURL: `${interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })
            

            const logsChannel = interaction.guild.channels.cache.get(config.Unban.LogsChannelID);
            interaction.editReply({ content: `${user} has been unbanned!`, ephemeral: true })
            if (logsChannel) logsChannel.send({ embeds: [logEmbed] })
        } catch(e) {
            console.log(e)
        }

    }

}