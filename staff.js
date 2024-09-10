const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require("discord.js");
const fs = require('fs');
const yaml = require("js-yaml");
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));
const staffModel = require('../models/staffModel');
const utils = require("../utils.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('staff')
        .setDescription("Manage staff members")
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a staff member')
                .addUserOption(option => option.setName('user').setDescription('The user to add').setRequired(true))
                .addStringOption(option => {
                    option.setName('role')
                        .setDescription('The role to assign')
                        .setRequired(true);
                    
                        config.staffRoles.forEach(staffRole => {
                            option.addChoices({ name: staffRole.name, value: staffRole.name.toLowerCase() });
                        });
                    
                    return option;
                })
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a staff member')
                .addUserOption(option => option.setName('user').setDescription('The user to remove').setRequired(true)),
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Edit the role of a staff member')
                .addUserOption(option => option.setName('user').setDescription('The user to edit').setRequired(true))
                .addStringOption(option => {
                    option.setName('role')
                        .setDescription('The new role to assign')
                        .setRequired(true);
                    
                        config.staffRoles.forEach(staffRole => {
                            option.addChoices({ name: staffRole.name, value: staffRole.name.toLowerCase() });
                        });
                    
                    return option;
                })
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('View all staff members and their roles'),
        ),
    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        const errorEmbed = new Discord.EmbedBuilder();
        errorEmbed.setColor('#ED4245');
        errorEmbed.setTimestamp();

        const hasPermission = await utils.checkPermission(interaction.user.id, "MANAGE_STAFF_MEMBERS");
        if (!hasPermission) {
            errorEmbed.setTitle('Permission Denied');
            errorEmbed.setDescription(`Sorry, you don't have permissions to do this!`);
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        const subcommand = interaction.options.getSubcommand();

        const embed = new Discord.EmbedBuilder();
        embed.setColor('#57F287');
        embed.setTimestamp();

        if (subcommand === 'add') {
            const user = interaction.options.getUser('user');
            const roleName = interaction.options.getString('role');

            const lowercaseRoleName = roleName.toLowerCase();

            let originalStaffRole = config.staffRoles.find(r => r.name.toLowerCase() === roleName);

            const existingStaffMember = await staffModel.findOne({ userId: user.id });
            if (existingStaffMember) {
                errorEmbed.setTitle('Already a Staff Member');
                errorEmbed.setDescription(`<@!${user.id}> (${user.username}) is already a staff member. If you need to make changes, consider using the following commands:
                - To update their role, use \`\`/staff edit\`\`
                - To remove them, use \`\`/staff remove\`\``);
                return interaction.editReply({ embeds: [errorEmbed] });
            }

            const validRolesList = config.staffRoles.map(role => `- ${role.name}`).join('\n');
            const staffRole = config.staffRoles.find(r => r.name.toLowerCase() === lowercaseRoleName);
            if (!staffRole) {
                errorEmbed.setTitle('Invalid Staff Role');
                errorEmbed.setDescription(`Please provide a valid new staff role. Valid roles:\n${validRolesList}`);
                return interaction.editReply({ embeds: [errorEmbed] });
            }

            // Check role priority
            const hasPermissionToAdd = await utils.checkRolePriority(existingStaffMember, user, lowercaseRoleName, interaction.user);
            if (!hasPermissionToAdd) {
                errorEmbed.setTitle('Permission Denied');
                errorEmbed.setDescription(`You don't have permission to manage this staff member!`);
                return interaction.editReply({ embeds: [errorEmbed] });
            }

            const newStaffMember = new staffModel({
                userId: user.id,
                roleName: originalStaffRole.name,
            });

            newStaffMember.save()
                .then(async () => {
                    embed.setTitle('Staff Member Added');
                    embed.setDescription(`<@!${user.id}> (${user.username}) has been added as a staff member with the role \`\`${originalStaffRole.name}\`\`.`);
                    interaction.editReply({ embeds: [embed] });
                    
                    // Automatically give the role specified in roleToGive
                    const roleToGive = staffRole.discordRoleToGive;
                    if (roleToGive) {
                        const role = interaction.guild.roles.cache.get(roleToGive);
                        if (role) {
                            const member = await interaction.guild.members.fetch(user.id);
                            member.roles.add(role);
                        }
                    }
                })
                .catch(error => {
                    console.error(error);
                    errorEmbed.setTitle('Error Adding Staff Member');
                    errorEmbed.setDescription('An error occurred while adding the staff member.');
                    interaction.editReply({ embeds: [errorEmbed] });
                });
        } else if (subcommand === 'remove') {
            const userToRemove = interaction.options.getUser('user');

            const existingStaffMember = await staffModel.findOne({ userId: userToRemove.id });
            if (!existingStaffMember) {
                errorEmbed.setTitle('User Not Found');
                errorEmbed.setDescription(`<@!${userToRemove.id}> (${userToRemove.username}) is not a staff member.`);
                return interaction.editReply({ embeds: [errorEmbed] });
            }

            // Check role priority
            const hasPermissionToRemove = await utils.checkRolePriority(existingStaffMember, userToRemove, existingStaffMember.roleName, interaction.user);
            if (!hasPermissionToRemove) {
                errorEmbed.setTitle('Permission Denied');
                errorEmbed.setDescription(`You don't have permission to manage this staff member!`);
                return interaction.editReply({ embeds: [errorEmbed] });
            }

            let oldStaffRole = existingStaffMember.roleName

            staffModel.findOneAndDelete({ userId: userToRemove.id })
                .then(async () => {
                    embed.setTitle('Staff Member Removed');
                    embed.setDescription(`<@!${userToRemove.id}> (${userToRemove.username}) has been removed as a staff member.`);
                    interaction.editReply({ embeds: [embed] });

                    // Automatically remove the role specified in roleToGive
                    const currentStaffRole = config.staffRoles.find(r => r.name.toLowerCase() === oldStaffRole.toLowerCase());
                    const oldRoleToRemove = currentStaffRole ? currentStaffRole.discordRoleToGive : '';
                    if (oldRoleToRemove) {
                        const role = interaction.guild.roles.cache.get(oldRoleToRemove);
                        if (role) {
                            const member = await interaction.guild.members.fetch(userToRemove.id);
                            member.roles.remove(role);
                        }
                    }
                })
                .catch(error => {
                    console.error(error);
                    errorEmbed.setTitle('Error Updating Staff Member');
                    errorEmbed.setDescription('An error occurred while removing the staff member.');
                    interaction.editReply({ embeds: [errorEmbed] });
                });
        } else if (subcommand === 'edit') {
            const userToEdit = interaction.options.getUser('user');
            const newRoleName = interaction.options.getString('role');

            const lowercaseNewRoleName = newRoleName.toLowerCase();

            let originalStaffRole = config.staffRoles.find(r => r.name.toLowerCase() === newRoleName);

            const existingStaffMember = await staffModel.findOne({ userId: userToEdit.id });
            if (!existingStaffMember) {
                errorEmbed.setTitle('User Not Found');
                errorEmbed.setDescription(`<@!${userToEdit.id}> (${userToEdit.username}) is not a staff member.`);
                return interaction.editReply({ embeds: [errorEmbed] });
            }

            if (existingStaffMember.roleName === lowercaseNewRoleName) {
                errorEmbed.setTitle('Role Already Assigned');
                errorEmbed.setDescription(`<@!${userToEdit.id}> (${userToEdit.username}) already has the role \`\`${originalStaffRole.name}\`\`.`);
                return interaction.editReply({ embeds: [errorEmbed] });
            }

            const validRolesList = config.staffRoles.map(role => `- ${role.name}`).join('\n');
            const staffRole = config.staffRoles.find(r => r.name.toLowerCase() === lowercaseNewRoleName);
            if (!staffRole) {
                errorEmbed.setTitle('Invalid Staff Role');
                errorEmbed.setDescription(`Please provide a valid new staff role. Valid roles:\n${validRolesList}`);
                return interaction.editReply({ embeds: [errorEmbed] });
            }

            // Check role priority
            const hasPermissionToEdit = await utils.checkRolePriority(existingStaffMember, userToEdit, lowercaseNewRoleName, interaction.user);
            if (!hasPermissionToEdit) {
                errorEmbed.setTitle('Permission Denied');
                errorEmbed.setDescription(`You don't have permission to manage this staff member!`);
                return interaction.editReply({ embeds: [errorEmbed] });
            }

            let oldStaffRole = existingStaffMember.roleName

            existingStaffMember.roleName = originalStaffRole.name;

            existingStaffMember.save()
                .then(async () => {
                    embed.setTitle('Staff Role Updated');
                    embed.setDescription(`<@!${userToEdit.id}> (${userToEdit.username}) staff role has been updated to \`\`${originalStaffRole.name.nameewRoleName}\`\`.`);
                    interaction.editReply({ embeds: [embed] });
                    
                    // Automatically update the role specified in roleToGive
                    const currentStaffRole = config.staffRoles.find(r => r.name.toLowerCase() === oldStaffRole.toLowerCase());
                    const oldRoleToRemove = currentStaffRole ? currentStaffRole.discordRoleToGive : '';

                    const newRoleToGive = staffRole.discordRoleToGive;
                    if (oldRoleToRemove !== newRoleToGive) {
                        if (oldRoleToRemove) {
                            const oldRole = interaction.guild.roles.cache.get(oldRoleToRemove);
                            if (oldRole) {
                                const member = await interaction.guild.members.fetch(userToEdit.id);
                                member.roles.remove(oldRole);
                            }
                        }

                        if (newRoleToGive) {
                            const newRole = interaction.guild.roles.cache.get(newRoleToGive);
                            if (newRole) {
                                const member = await interaction.guild.members.fetch(userToEdit.id);
                                member.roles.add(newRole);
                            }
                        }
                    }
                })
                .catch(error => {
                    console.error(error);
                    errorEmbed.setTitle('Error Updating Staff Member');
                    errorEmbed.setDescription('An error occurred while updating the staff member.');
                    interaction.editReply({ embeds: [errorEmbed] });
                });
            } else if (subcommand === 'list') {
                const allStaffMembers = await staffModel.find();
    
                if (allStaffMembers.length === 0) {
                    embed.setTitle('No Staff Members Found');
                    embed.setDescription('There are currently no staff members.');
                    return interaction.editReply({ embeds: [embed] });
                }
    
                embed.setTitle('Staff Members List');
                const staffList = allStaffMembers.map(member => `- <@!${member.userId}> - Role: \`${member.roleName}\``).join('\n');
                embed.setDescription(staffList);
                interaction.editReply({ embeds: [embed] });
            } else {
                errorEmbed.setTitle('Invalid Subcommand');
                errorEmbed.setDescription('Please provide a valid subcommand.');
                interaction.editReply({ embeds: [errorEmbed] });
            }
        },
    };