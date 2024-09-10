const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require ("discord.js")
const fs = require('fs');
const yaml = require("js-yaml")
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
const guildModel = require('../models/guildModel');
const utils = require("../utils.js");

module.exports = {
    //enabled: commands.General.Ping.Enabled,
    data: new SlashCommandBuilder()
        .setName('clearchannel')
        .setDescription("Clone and delete channel to clear all messages.")
        .addStringOption(option => option.setName('reason').setDescription('The reason for clearing the channel')),
    async execute(interaction, client) {

        const errorEmbed = new Discord.EmbedBuilder()
        .setColor('#ED4245')
        .setTimestamp();

        const hasPermission = await utils.checkPermission(interaction.user.id, "CLEAR_CHANNEL");
        if (!hasPermission) {
            errorEmbed.setTitle('Failed to clear channel');
            errorEmbed.setDescription(`Sorry, you don't have permissions to do this!`);
            return interaction.reply({ embeds: [errorEmbed] });
        }

        const guildData = await guildModel.findOne({ guildID: config.GuildID });

        let reason = interaction.options.getString("reason");
        if(!reason) reason = "No reason specified."

        const logEmbed = new Discord.EmbedBuilder()
        .setAuthor({ name: `Moderation Action`, iconURL: `https://i.imgur.com/6vU8Acu.png` })
        .setColor("Red")
        .addFields([
          { name: `Action`, value: `\`\`Clear Channel\`\` *(<t:${(Date.now() / 1000 | 0)}:R>)*` },
          { name: `Details`, value: `\`\`Staff\`\` <@!${interaction.user.id}>\n\`\`Channel\`\` ${interaction.channel.name}\n\`\`Reason\`\` ${reason}` },
          ])
        .setTimestamp()
        .setFooter({ text: `#${guildData.totalActions}`, iconURL: `${interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })

        let logsChannel = interaction.guild.channels.cache.get("731044706745712710");

        await interaction.reply(`Clearing channel..`);
        const position = interaction.channel.position;
        const newChannel = await interaction.channel.clone();
        await interaction.channel.delete();
        await newChannel.setPosition(position);

        guildData.totalActions = (guildData.totalActions || 0) + 1;
        await guildData.save();

        if (logsChannel) await logsChannel.send({ embeds: [logEmbed] })
        return await newChannel.send(`This channel was cleared by <@!${interaction.user.id}>`)

    }

}