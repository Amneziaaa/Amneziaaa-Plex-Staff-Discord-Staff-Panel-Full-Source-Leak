const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require ("discord.js")
const fs = require('fs');
const yaml = require("js-yaml")
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
const utils = require("../utils.js");
const guildModel = require('../models/guildModel');

module.exports = {
    //enabled: commands.General.Ping.Enabled,
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription("Purge a specific amount of messages from a channel")
        .addNumberOption(option => option.setName('amount').setDescription('The amount of messages to purge').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('The reason for the purge').setRequired(config.Purge.RequireReason)),
    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        const errorEmbed = new Discord.EmbedBuilder()
        .setColor('#ED4245')
        .setTimestamp();

        const hasPermission = await utils.checkPermission(interaction.user.id, "PURGE_MESSAGES");
        if (!hasPermission) {
            errorEmbed.setTitle('Failed to purge');
            errorEmbed.setDescription(`Sorry, you don't have permissions to do this!`);
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        const guildData = await guildModel.findOne({ guildID: config.GuildID });

        let amount = interaction.options.getNumber("amount");
        let reason = interaction.options.getString("reason");
        if(amount > 100) amount = 100
        if(!reason) reason = "No reason specified."

        const logEmbed = new Discord.EmbedBuilder()
        .setAuthor({ name: `Moderation Action`, iconURL: `https://i.imgur.com/6vU8Acu.png` })
        .setColor("Red")
        .addFields([
          { name: `Action`, value: `\`\`Purge\`\` *(<t:${(Date.now() / 1000 | 0)}:R>)*` },
          { name: `Details`, value: `\`\`Staff\`\` <@!${interaction.user.id}>\n\`\`Channel\`\` ${interaction.channel.name}\n\`\`Amount\`\` ${amount}\n\`\`Reason\`\` ${reason}` },
          ])
        .setTimestamp()
        .setFooter({ text: `#${guildData.totalActions}`, iconURL: `${interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })

        let logsChannel = interaction.guild.channels.cache.get(config.Purge.LogsChannelID);
                try {
                    // let purgeAmountVariable = lang.PurgeCleared.replace(/{amount}/g, `${amount}`)
                    await interaction.channel.bulkDelete(amount)
                    await interaction.editReply({ content: `✅ Successfully cleared \`\`${amount}\`\` messages`, ephemeral: true })

                    guildData.totalActions = (guildData.totalActions || 0) + 1;
                    await guildData.save();

                    if (logsChannel) await logsChannel.send({ embeds: [logEmbed] })
                } catch(error) {
                    await interaction.editReply({ content: "You can't delete messages older than 2 weeks!\n*Tip: If you want to delete all messages in a channel, Use the ``/clearchannel`` command.*", ephemeral: true })
                }

    }

}