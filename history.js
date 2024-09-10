const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const fs = require('fs');
const yaml = require('js-yaml');
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));
const punishmentModel = require('../models/punishmentModel');
const utils = require("../utils.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription("View punishment history of a user")
        .addUserOption(option => option.setName('user').setDescription('The user to view punishment history').setRequired(true)),
    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        const errorEmbed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTimestamp();

        const hasPermission = await utils.checkPermission(interaction.user.id, "VIEW_HISTORY");
        if (!hasPermission) {
            errorEmbed.setTitle('Failed to view history');
            errorEmbed.setDescription(`Sorry, you don't have permissions to do this!`);
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        const user = interaction.options.getUser('user');
        let punishmentEmoji = '';
        let staffUsername = '';

        try {
            // Find all documents with the user's ID in the punishmentModel, sorted by date descending
            let punishments = await punishmentModel.find({ userID: user.id }).sort({ date: -1 });

            if (punishments.length === 0) {
                return interaction.editReply({ content: "No punishment history found for this user.", ephemeral: true });
            }

            const MAX_FIELDS_PER_PAGE = 10;
            const pages = [];
            let currentPage = [];
            let fieldCount = 0;

            for (const punishment of punishments) {
                let punishmentEmoji = ''; // Initialize punishmentEmoji inside the loop
            
                const formattedDate = punishment.date.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            
                try {
                    const staffMember = await client.users.fetch(punishment.staff);
                    if (staffMember) {
                        staffUsername = staffMember.username;
                    }
                } catch (error) {
                    console.error('Error fetching staff username:', error);
                    staffUsername = "Unknown";
                }
            
                switch (punishment.punishment.toLowerCase()) {
                    case 'kick':
                        punishmentEmoji = '👞';
                        break;
                    case 'warn':
                        punishmentEmoji = '⚠️';
                        break;
                    case 'timeout':
                        punishmentEmoji = '🔇';
                        break;
                    case 'ban':
                        punishmentEmoji = '🚫';
                        break;
                    default:
                        punishmentEmoji = '';
                }
            
                const punishmentInfo = `
                    \`\`ID\`\` [${punishment.punishmentID}](${config.Dashboard.URL}/punishment/lookup/${punishment.punishmentID})
                    \`\`Staff\`\` ${staffUsername}
                    \`\`Reason\`\` ${punishment.reason}
                    \`\`Date\`\` ${formattedDate}`;
            
                currentPage.push({ name: `${punishmentEmoji} ${punishment.punishment.toUpperCase()}`, value: punishmentInfo });
                fieldCount++;
            
                // If maximum fields per page reached or last punishment reached
                if (fieldCount === MAX_FIELDS_PER_PAGE || currentPage.length === punishments.length) {
                    // Add current page to pages array
                    pages.push(currentPage);
                    // Reset current page and field count
                    currentPage = [];
                    fieldCount = 0;
                }
            }
            

            let currentPageIndex = 0;
            const embed = new EmbedBuilder()
                .setColor(config.EmbedColors)
                .setTitle(`Punishment History for ${user.tag} (${punishments.length})`)
                .setTimestamp()
                .addFields(pages[currentPageIndex]);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('previousPage')
                        .setLabel('Previous Page')
                        .setStyle('Primary'),
                    new ButtonBuilder()
                        .setCustomId('nextPage')
                        .setLabel('Next Page')
                        .setStyle('Primary'),
                );

            const message = await interaction.editReply({ embeds: [embed], components: [row], ephemeral: true });

            const collectorFilter = i => i.user.id === interaction.user.id;
            const collector = message.createMessageComponentCollector({ filter: collectorFilter, time: 300000 });

            collector.on('collect', async buttonInteraction => {
                // Move the declaration of formattedDate here
            
                let punishmentEmoji = ''; // Initialize punishmentEmoji inside the collector
                
                if (buttonInteraction.customId === 'previousPage') {
                    if (currentPageIndex > 0) {
                        currentPageIndex--;
                    }
                } else if (buttonInteraction.customId === 'nextPage') {
                    if (currentPageIndex < Math.ceil(punishments.length / MAX_FIELDS_PER_PAGE) - 1) {
                        currentPageIndex++;
                    }
                }
            
                const startIndex = currentPageIndex * MAX_FIELDS_PER_PAGE;
                const endIndex = Math.min(startIndex + MAX_FIELDS_PER_PAGE, punishments.length);
            
                const fields = punishments.slice(startIndex, endIndex).map((punishment, index) => {
                    // Inside the map function, reassign punishmentEmoji for each punishment
                    switch (punishment.punishment.toLowerCase()) {
                        case 'kick':
                            punishmentEmoji = '👞';
                            break;
                        case 'warn':
                            punishmentEmoji = '⚠️';
                            break;
                        case 'timeout':
                            punishmentEmoji = '🔇';
                            break;
                        case 'ban':
                            punishmentEmoji = '🚫';
                            break;
                        default:
                            punishmentEmoji = '';
                    }
            
                    return {
                        name: `${punishmentEmoji} ${punishment.punishment.toUpperCase()}`,
                        value: `
                            \`\`ID\`\` [${punishment.punishmentID}](${config.Dashboard.URL}/punishment/lookup/${punishment.punishmentID})
                            \`\`Staff\`\` ${staffUsername}
                            \`\`Reason\`\` ${punishment.reason}
                            \`\`Date\`\` ${punishment.date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
                    };
                });
            
                const newEmbed = new EmbedBuilder()
                    .setColor(config.EmbedColors)
                    .setTitle(`Punishment History for ${user.tag} (${punishments.length})`)
                    .setTimestamp()
                    .addFields(fields);
            
                const newComponents = [row];
            
                await buttonInteraction.update({ embeds: [newEmbed], components: newComponents, ephemeral: true });
            });
            

        } catch (error) {
            console.error('Error fetching punishment history:', error);
            await interaction.editReply({ content: 'An error occurred while fetching punishment history.', ephemeral: true });
        }
    }
};