const { Collection, Client, Intents, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const Discord = require ("discord.js")
const fs = require('fs');
const yaml = require("js-yaml")
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
const color = require('ansi-colors');
const { client } = require("./index.js")
const axios = require('axios')
const glob = require("glob");
const punishmentModel = require('./models/punishmentModel');
const statsModel = require('./models/statisticsModel');
const userModel = require("./models/userModel");
const guildModel = require('./models/guildModel');
const parseDuration = require('parse-duration');

client.commands = new Collection();
client.slashCommands = new Collection();

// Slash Commands
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

if(config.GuildID) {
  const slashCommands = [];
  const commandFiles = fs.readdirSync(`./slashCommands`).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {

  const command = require(`./slashCommands/${file}`);
  slashCommands.push(command.data.toJSON());
  console.log(`[SLASH COMMAND] ${file} loaded!`);
  client.slashCommands.set(command.data.name, command);
}


// Addon loading
glob('./addons/**/*.js', function (err, files) {
    if (err) return console.error(err);
  
    const loadedAddons = [];
  
    files.forEach(async file => {
      if (file.endsWith('.js')) {
        const folderName = file.match(/\/addons\/([^/]+)/)[1];
  
        if (!loadedAddons.includes(folderName)) {
          loadedAddons.push(folderName);
          console.log(`${color.green(`[ADDON] ${folderName} loaded!`)}`);
        }
  
        try {
          if (fs.existsSync(file)) {
            let addon = require(file);
  
            if (addon && addon.data && addon.data.toJSON) {
              await slashCommands.push(addon.data.toJSON());
              await client.slashCommands.set(addon.data.name, addon);
            } else if (addon && addon.run && typeof addon.run === 'function') {
              await addon.run(client);
            }
          }
        } catch (addonError) {
          console.error(`${color.red(`[ERROR] ${folderName}: ${addonError.message}`)}`);
          console.error(addonError.stack);
        }
      }
    })
})


client.on('ready', async () => {
  
    const rest = new REST({
        version: '10'
    }).setToken(config.Token);
    (async () => {
        try {
                await rest.put(
                    Routes.applicationGuildCommands(client.user.id, config.GuildID), {
                        body: slashCommands
                    },
                );
        } catch (error) {
            if (error) {
              let logMsg = `\n\n[${new Date().toLocaleString()}] [ERROR] ${error.stack}`;
              await fs.appendFile("./logs.txt", logMsg, (e) => { 
                if(e) console.log(e);
              });
              await console.log(error)
              await console.log('\x1b[31m%s\x1b[0m', `[ERROR] Slash commands are unavailable because application.commands scope wasn't selected when inviting the bot. Please use the link below to re-invite your bot.`)
              await console.log('\x1b[31m%s\x1b[0m', `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`)
            }
        }
    })();
  });
}


// Command and event handler etc..
fs.readdir('./events/', (err, files) => {
    if (err) return console.error
  
    files.forEach(async (file) => {
      if(!file.endsWith('.js') || file === 'dailyStatsUpdater.js') return;
        console.log(`[EVENT] ${file} loaded!`)
  
      const evt = require(`./events/${file}`);
      let evtName = file.split('.')[0];
      client.on(evtName, evt.bind(null, client));
    });
  });
  

  const staffModel = require('./models/staffModel');
  exports.checkRolePriority = async function (member, targetUser, targetRole, commandUser) {
    const guild = client.guilds.cache.get(config.GuildID);
    let guildOwner = await guild.fetchOwner();
    const StaffMember = await staffModel.findOne({ userId: commandUser.id });
    const isGuildOwner = guildOwner.id === commandUser?.id;
    if (config.FullAccessUsers.includes(commandUser.id)) return true;

    let isAdministrator = false;
    let isModerator = false;

    if (StaffMember) {
        let staffRole = config.staffRoles.find(r => r.name.toLowerCase() === StaffMember.roleName.toLowerCase());

        if (staffRole) {
            if (staffRole.permissions.includes("ADMINISTRATOR")) {
                isAdministrator = true;
            }
            if (staffRole.permissions.includes("MANAGE_STAFF_MEMBERS")) {
                isModerator = true;
            }
        }
    }

    // console.log("isAdministrator:", isAdministrator);
    // console.log("isModerator:", isModerator);

    if ((StaffMember && isAdministrator) || isGuildOwner) return true;
    if (commandUser.id === client.user.id) return true;
    if (!StaffMember) return false;
    if (targetUser.id === guildOwner.id) return false;

    let hasPermissions = false;
    if (StaffMember) {
        let staffRole = config.staffRoles.find(r => r.name.toLowerCase() === StaffMember.roleName.toLowerCase());

        if (staffRole && staffRole.permissions.includes("MANAGE_STAFF_MEMBERS")) {
            hasPermissions = true;
        }
    }

    // console.log("hasPermissions:", hasPermissions);

    if (!hasPermissions && !isModerator) return false;

    const userRoleName = StaffMember.roleName;
    const targetUserRoleName = targetRole;

    // Find the priority of the role assigned to the user in the configuration
    const userRolePriority = userRoleName ? getRolePriority(userRoleName) : undefined;

    // Find the priority of the role assigned to the target user in the configuration
    const targetUserRolePriority = targetUserRoleName ? getRolePriority(targetUserRoleName) : undefined;

    // Find the priority of the target role in the configuration
    const targetRolePriority = targetRole ? getRolePriority(targetRole) : undefined;

    // console.log("userRolePriority:", userRolePriority);
    // console.log("targetUserRolePriority:", targetUserRolePriority);
    // console.log("targetRolePriority:", targetRolePriority);

    // Check if all priorities are defined and compare them
    return (
        userRolePriority !== undefined &&
        (!targetUserRolePriority || targetUserRolePriority !== undefined) &&
        (!targetRolePriority || targetRolePriority !== undefined) &&
        // Additional check to ensure users can only add roles with lower priority
        ((targetRolePriority === undefined && userRolePriority < targetUserRolePriority) ||
            (targetRolePriority !== undefined && userRolePriority < targetRolePriority)) &&
        // Additional check to ensure users with the same role priority cannot be removed
        ((userRolePriority !== targetUserRolePriority) || (userRolePriority !== targetUserRolePriority && !targetRolePriority))
    );
};

function getRolePriority(roleName) {
    const roleConfig = config.staffRoles.find(role => role && role.name && role.name.toLowerCase() === roleName.toLowerCase());
    return roleConfig ? roleConfig.priority : undefined;
}


// Function to generate a random alphanumeric ID, to use as punishment id
exports.generatePunishmentID = async function () {
    const characters = 'ABCDEFGHJKMNPQRSTUVWXYZ123456789';
    let result = 'P'; // Start with 'P'
    
    // Modified pattern
    const pattern = ['1', 'B', '3', '4', 'C', '6', 'D', '8'];
  
    // Generate random characters for the remaining slots
    for (let i = 0; i < pattern.length - 1; i++) { 
        if (pattern[i] === 'B') {
            // Add a random uppercase letter
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        } else if (pattern[i] === 'C') {
            // Add a random digit
            result += Math.floor(Math.random() * 10); // Random digit between 0 and 9
        } else if (pattern[i] === 'D') {
            // Add a random uppercase letter or digit
            const randomChar = characters.charAt(Math.floor(Math.random() * characters.length));
            result += isNaN(parseInt(randomChar)) ? randomChar : parseInt(randomChar);
        } else {
            // Add the fixed character from the pattern
            result += pattern[i];
        }
    }
    return result;
}

exports.incrementStats = async function (date, field) {
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const filter = { date: dateOnly };
    const update = { $inc: { [field]: 1 } };
    const options = { upsert: true, new: true };

    return await statsModel.findOneAndUpdate(filter, update, options);
}

exports.checkPermission = async function (userID, permission) {
    try {
        const guild = client.guilds.cache.get(config.GuildID);
        let guildOwner = await guild.fetchOwner();
        const isGuildOwner = guildOwner.id === userID;
        if(isGuildOwner) return true;
        if (userID === client.user.id) return true;
        if (config.FullAccessUsers.includes(userID)) return true;
        
        // Find the staff member in the database
        const staffMember = await staffModel.findOne({ userId: userID });
        if (!staffMember) {
            //console.log(`User with ID ${userID} is not a staff member.`);
            return false;
        }

        // Find the role name for the staff member
        const roleName = staffMember.roleName.toLowerCase();

        // Find the corresponding role in the config
        const roleConfig = config.staffRoles.find(r => r.name.toLowerCase() === roleName);
        if (!roleConfig) {
             //console.log(`Role ${roleName} not found in the config.`);
            return false;
        }

        
        // Check if the role has the specified permission
        if (roleConfig.permissions.includes(permission) || roleConfig.permissions.includes("ADMINISTRATOR")) {
             // console.log(`User with ID ${userID} has permission ${permission}.`);
            return true;
        } else {
             // console.log(`User with ID ${userID} does not have permission ${permission}.`);
            return false;
        }
    } catch (error) {
        console.error('Error checking permission:', error);
        return false;
    }
};


exports.checkActionLimit = async function (user, StaffMember, actionType) {
    try {
        const guild = client.guilds.cache.get(config.GuildID);
        let guildOwner = await guild.fetchOwner();
        const isGuildOwner = guildOwner.id === StaffMember.id;
        if (isGuildOwner) return { success: true, message: `User is guild owner` };
        if (StaffMember.id === client.user.id) return { success: true, message: `User is myself (bot)` };
        if (config.FullAccessUsers.includes(StaffMember.id)) return { success: true, message: `User has full access` };

        const staffMemberData = await staffModel.findOne({ userId: StaffMember.id });
        if (!staffMemberData) return { success: false, message: `Staff member data not found for user ${StaffMember.id}!` };

        const roleConfig = config.staffRoles.find(role => role.name.toLowerCase() === staffMemberData.roleName.toLowerCase());
        if (!roleConfig) return { success: false, message: `Role config not found for role ${staffMemberData.roleName}!` };
        if (!roleConfig.actionLimits || !roleConfig.actionLimits.Limits || !roleConfig.actionLimits.Limits[actionType]) return { success: false, message: `Action limit configuration not found for ${actionType}!` };
        if (!roleConfig.actionLimits || !roleConfig.actionLimits.Enabled) return { success: true };

        const actionLimitsConfig = roleConfig.actionLimits.Limits;

        const actionLimitsData = staffMemberData.actionLimits[actionType];

        const timePeriod = actionLimitsConfig.TimePeriod;
        const { lastActionTimestamp, actionsWithinTimePeriod } = actionLimitsData;

        if (!timePeriod || !lastActionTimestamp) return { success: false, message: `Invalid action limit configuration for ${actionType}!` };

        const currentTime = new Date();
        const timeDiff = currentTime - new Date(lastActionTimestamp);

        const timePeriodMilliseconds = parseDuration(timePeriod);

        if (timePeriodMilliseconds === null || timePeriodMilliseconds <= 0) return { success: false, message: `Invalid time period configuration for ${actionType}!` };

        if (actionsWithinTimePeriod === 0) return { success: true };

        if (timeDiff < timePeriodMilliseconds && actionsWithinTimePeriod >= actionLimitsConfig[actionType]) {
            const remainingTime = timePeriodMilliseconds - timeDiff;
        
            const remainingTimeInSeconds = Math.floor(remainingTime / 1000);
            const hours = Math.floor(remainingTimeInSeconds / 3600);
            const minutes = Math.floor((remainingTimeInSeconds % 3600) / 60);
            const seconds = remainingTimeInSeconds % 60;
        
            const remainingTimeString = `${hours}h ${minutes}m ${seconds}s`;
        
            return {
                success: false,
                message: `You have exceeded the ${actionType} limit. Please wait ${remainingTimeString} before trying again.`
            };
        }

        return { success: true };
    } catch (error) {
        console.error("Error in checkActionLimit:", error);
        return { success: false, message: "An error occurred while checking action limit." };
    }
}



exports.kickUser = async function (user, staff, reason, punishmentID) {
const guild = client.guilds.cache.get(config.GuildID);
const guildData = await guildModel.findOne({ guildID: config.GuildID });

let member = await guild.members.fetch(user.id);
let staffUser = await guild.members.fetch(staff.id);

if(!reason) reason = "No reason specified."

const StaffMember = await staffModel.findOne({ userId: member.id });

const hasPermission = await exports.checkPermission(staffUser.id, "KICK_USERS");
if (!hasPermission) return { success: false, message: `Sorry, you don't have permissions to do this!` };

if (member.id === staffUser.id) return { success: false, message: `You can't kick yourself!` };
if (!member) return { success: false, message: `The user is not in the server!` };
if (!member.kickable) return { success: false, message: `You can't kick this user!` };
if (member.user.bot) return { success: false, message: `You can't kick a bot!` };
if (StaffMember) return { success: false, message: `You can't kick a staff member!` };

const actionLimitCheckResult = await exports.checkActionLimit(member, staffUser, "Kick");
if (!actionLimitCheckResult.success) return { success: false, message: actionLimitCheckResult.message };

const logEmbed = new EmbedBuilder()
.setAuthor({ name: `Moderation Action`, iconURL: `https://i.imgur.com/6vU8Acu.png` })
.setColor("Red")
.addFields([
  { name: `Action`, value: `\`\`Kick\`\` *(<t:${(Date.now() / 1000 | 0)}:R>)*` },
  { name: `Details`, value: `\`\`Staff\`\` <@!${staffUser.id}>\n\`\`User\`\` <@!${member.id}>\n\`\`Reason\`\` ${reason}` },
  ])
.setTimestamp()
.setFooter({ text: `#${guildData.totalActions} | ID: ${punishmentID}`, iconURL: `${staffUser.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })

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

const logsChannel = guild.channels.cache.get(config.Kick.LogsChannelID);

    // DM User
    if (config.Kick.DMUser.Enabled) {
      try {
          const embedSettings = config.Kick.DMUser.Embed;
          const dmEmbed = new EmbedBuilder();
          if (embedSettings.Author && embedSettings.AuthorIcon) dmEmbed.setAuthor({ name: embedSettings.Author, iconURL: embedSettings.AuthorIcon });
          if (embedSettings.Author && !embedSettings.AuthorIcon) dmEmbed.setAuthor({ name: embedSettings.Author });
          if (embedSettings.Color) dmEmbed.setColor(embedSettings.Color);
          if (embedSettings.Description) dmEmbed.setDescription(embedSettings.Description.replace('{guildName}', guild.name)
              .replace('{user}', `<@!${member.id}>`)
              .replace('{username}', member.user.username)
              .replace('{staff}', `<@!${staffUser.id}>`)
              .replace('{reason}', reason)
              .replace('{punishmentID}', punishmentID));

          if (embedSettings.ThumbnailEnabled) {
              if (embedSettings.CustomThumbnail && embedSettings.CustomThumbnail !== '') {
                  dmEmbed.setThumbnail(embedSettings.CustomThumbnail);
              } else {
                  dmEmbed.setThumbnail(member.user.displayAvatarURL({ format: 'png', dynamic: true }));
              }
          }

          dmEmbed.addFields(embedSettings.Fields.map(field => ({
              name: field.name,
              value: field.value.replace('{guildName}', guild.name)
                  .replace('{user}', `<@!${member.id}>`)
                  .replace('{username}', member.user.username)
                  .replace('{staff}', `<@!${staffUser.id}>`)
                  .replace('{reason}', reason)
                  .replace('{punishmentID}', punishmentID),
          })));

          if (embedSettings.Timestamp) {
              dmEmbed.setTimestamp();
          }

          const footerText = embedSettings.Footer.text.replace('{guildName}', guild.name)
              .replace('{username}', member.user.username)
              .replace('{reason}', reason)
              .replace('{punishmentID}', punishmentID);

          // Check if footer.text is not blank before setting the footer
          if (footerText.trim() !== '') {
              if (embedSettings.Footer.Enabled && embedSettings.Footer.CustomIconURL == '' && embedSettings.Footer.IconEnabled) {
                  dmEmbed.setFooter({
                      text: footerText,
                      iconURL: member.user.displayAvatarURL({ format: 'png', dynamic: true }),
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

          if(config.AppealSystem.Enabled && config.Kick.Appealable) await member.send({ embeds: [dmEmbed], components: [actionRow] });
          if(config.AppealSystem.Enabled && !config.Kick.Appealable) await member.send({ embeds: [dmEmbed] });
          if(!config.AppealSystem.Enabled) await member.send({ embeds: [dmEmbed] });
      } catch (e) {
          console.log('\x1b[33m%s\x1b[0m', "[INFO] I tried to DM a user, but their DM's are locked.");
      }
  }

  let userFromDB = await userModel.findOne({ userID: member.id });
  if(!userFromDB) await userModel.create({ userID: member.id });

  const newPunishment = new punishmentModel({
      userID: member.id,
      username: member.user.username,
      punishment: 'Kick',
      punishmentID: punishmentID,
      reason: reason,
      staff: staffUser.id,
      staffUsername: staffUser.user.username,
      recentMessages: userFromDB?.messageHistory || []
  });
  await newPunishment.save();

  guildData.totalActions = (guildData.totalActions || 0) + 1;
  guildData.totalKicks = (guildData.totalKicks || 0) + 1;
  await guildData.save();



// Action limit
if (staffUser.id !== client.user.id) {
let guildOwner = await guild.fetchOwner();
if (guildOwner.id !== staffUser.id) {
const UserStaffMember = await staffModel.findOne({ userId: staffUser.id });
const roleConfig = config.staffRoles.find(role => role.name.toLowerCase() === UserStaffMember.roleName.toLowerCase());

if (roleConfig.actionLimits.Enabled) {
    // Parse the time period string into milliseconds
    const timePeriodMilliseconds = parseDuration(roleConfig.actionLimits.Limits.TimePeriod);

    // Reset actionsWithinTimePeriod if the time period has passed since the last action
    const currentTime = new Date();
    const timeDiff = currentTime - new Date(UserStaffMember.actionLimits.Kick.lastActionTimestamp);

    if (timeDiff >= timePeriodMilliseconds) {
        UserStaffMember.actionLimits.Kick.actionsWithinTimePeriod = 0;
    }

    // Increment actionsWithinTimePeriod by 1
    UserStaffMember.actionLimits.Kick.actionsWithinTimePeriod += 1;
    UserStaffMember.actionLimits.Kick.lastActionTimestamp = new Date();

    await UserStaffMember.save();
}
}
}
//

   exports.incrementStats(new Date(), 'kicks')

  await member.kick({ reason: reason })
  if (logsChannel) logsChannel.send({ embeds: [logEmbed], components: [actionRow] });
  return { success: true, discordMessage: `<@!${member.id}> has been kicked!`, message: `${member.user.username} has been kicked!` };
}






exports.banUser = async function (user, staff, reason, punishmentID) {
  const guild = client.guilds.cache.get(config.GuildID);
  const guildData = await guildModel.findOne({ guildID: config.GuildID });
  
  let member = await guild.members.fetch(user.id);
  let staffUser = await guild.members.fetch(staff.id);
  
  if(!reason) reason = "No reason specified."
  
  const StaffMember = await staffModel.findOne({ userId: member.id });
  
  const hasPermission = await exports.checkPermission(staffUser.id, "BAN_USERS");
  if (!hasPermission) return { success: false, message: `Sorry, you don't have permissions to do this!` };

  if (member.id === staffUser.id) return { success: false, message: `You can't ban yourself!` };
  if (!member) return { success: false, message: `The user is not in the server!` };
  if (!member.bannable) return { success: false, message: `You can't ban this user!` };
  if (member.user.bot) return { success: false, message: `You can't ban a bot!` };
  if (StaffMember) return { success: false, message: `You can't ban a staff member!` };
  
  const actionLimitCheckResult = await exports.checkActionLimit(member, staffUser, "Ban");
  if (!actionLimitCheckResult.success) return { success: false, message: actionLimitCheckResult.message };
  
  const logEmbed = new EmbedBuilder()
  .setAuthor({ name: `Moderation Action`, iconURL: `https://i.imgur.com/6vU8Acu.png` })
  .setColor("Red")
  .addFields([
    { name: `Action`, value: `\`\`Ban\`\` *(<t:${(Date.now() / 1000 | 0)}:R>)*` },
    { name: `Details`, value: `\`\`Staff\`\` <@!${staffUser.id}>\n\`\`User\`\` <@!${member.id}>\n\`\`Reason\`\` ${reason}` },
    ])
  .setTimestamp()
  .setFooter({ text: `#${guildData.totalActions} | ID: ${punishmentID}`, iconURL: `${staffUser.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })
  
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

  const logsChannel = guild.channels.cache.get(config.Ban.LogsChannelID);
  
      // DM User
      if (config.Ban.DMUser.Enabled) {
        try {
            const embedSettings = config.Ban.DMUser.Embed;
            const dmEmbed = new EmbedBuilder();
            if (embedSettings.Author && embedSettings.AuthorIcon) dmEmbed.setAuthor({ name: embedSettings.Author, iconURL: embedSettings.AuthorIcon });
            if (embedSettings.Author && !embedSettings.AuthorIcon) dmEmbed.setAuthor({ name: embedSettings.Author });
            if (embedSettings.Color) dmEmbed.setColor(embedSettings.Color);
            if (embedSettings.Description) dmEmbed.setDescription(embedSettings.Description.replace('{guildName}', guild.name)
                .replace('{user}', `<@!${member.id}>`)
                .replace('{username}', member.user.username)
                .replace('{staff}', `<@!${staffUser.id}>`)
                .replace('{reason}', reason)
                .replace('{punishmentID}', punishmentID));
  
            if (embedSettings.ThumbnailEnabled) {
                if (embedSettings.CustomThumbnail && embedSettings.CustomThumbnail !== '') {
                    dmEmbed.setThumbnail(embedSettings.CustomThumbnail);
                } else {
                    dmEmbed.setThumbnail(member.user.displayAvatarURL({ format: 'png', dynamic: true }));
                }
            }
  
            dmEmbed.addFields(embedSettings.Fields.map(field => ({
                name: field.name,
                value: field.value.replace('{guildName}', guild.name)
                    .replace('{user}', `<@!${member.id}>`)
                    .replace('{username}', member.user.username)
                    .replace('{staff}', `<@!${staffUser.id}>`)
                    .replace('{reason}', reason)
                    .replace('{punishmentID}', punishmentID),
            })));
  
            if (embedSettings.Timestamp) {
                dmEmbed.setTimestamp();
            }
  
            const footerText = embedSettings.Footer.text.replace('{guildName}', guild.name)
                .replace('{username}', member.user.username)
                .replace('{reason}', reason)
                .replace('{punishmentID}', punishmentID);
  
            // Check if footer.text is not blank before setting the footer
            if (footerText.trim() !== '') {
                if (embedSettings.Footer.Enabled && embedSettings.Footer.CustomIconURL == '' && embedSettings.Footer.IconEnabled) {
                    dmEmbed.setFooter({
                        text: footerText,
                        iconURL: member.user.displayAvatarURL({ format: 'png', dynamic: true }),
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

            if(config.AppealSystem.Enabled && config.Ban.Appealable) await member.send({ embeds: [dmEmbed], components: [actionRow] });
            if(config.AppealSystem.Enabled && !config.Ban.Appealable) await member.send({ embeds: [dmEmbed] });
            if(!config.AppealSystem.Enabled) await member.send({ embeds: [dmEmbed] });
        } catch (e) {
            console.log('\x1b[33m%s\x1b[0m', "[INFO] I tried to DM a user, but their DM's are locked.");
        }
    }
  
    let userFromDB = await userModel.findOne({ userID: member.id });
    if(!userFromDB) await userModel.create({ userID: member.id });

    const newPunishment = new punishmentModel({
        userID: member.id,
        username: member.user.username,
        punishment: 'Ban',
        punishmentID: punishmentID,
        reason: reason,
        staff: staffUser.id,
        staffUsername: staffUser.user.username,
        recentMessages: userFromDB?.messageHistory || []
    });
    await newPunishment.save();

    guildData.totalActions = (guildData.totalActions || 0) + 1;
    guildData.totalBans = (guildData.totalBans || 0) + 1;
    await guildData.save();


    // Action limit
    if (staffUser.id !== client.user.id) {
    let guildOwner = await guild.fetchOwner();
    if (guildOwner.id !== staffUser.id) {
    const UserStaffMember = await staffModel.findOne({ userId: staffUser.id });
    const roleConfig = config.staffRoles.find(role => role.name.toLowerCase() === UserStaffMember.roleName.toLowerCase());

if (roleConfig.actionLimits.Enabled) {
    // Parse the time period string into milliseconds
    const timePeriodMilliseconds = parseDuration(roleConfig.actionLimits.Limits.TimePeriod);

    // Reset actionsWithinTimePeriod if the time period has passed since the last action
    const currentTime = new Date();
    const timeDiff = currentTime - new Date(UserStaffMember.actionLimits.Ban.lastActionTimestamp);

    if (timeDiff >= timePeriodMilliseconds) {
        UserStaffMember.actionLimits.Ban.actionsWithinTimePeriod = 0;
    }

    // Increment actionsWithinTimePeriod by 1
    UserStaffMember.actionLimits.Ban.actionsWithinTimePeriod += 1;
    UserStaffMember.actionLimits.Ban.lastActionTimestamp = new Date();

    await UserStaffMember.save();
}
}
}
//

    exports.incrementStats(new Date(), 'bans')

    await member.ban({ reason: reason })
    if (logsChannel) logsChannel.send({ embeds: [logEmbed], components: [actionRow] });
    return { success: true, discordMessage: `<@!${member.id}> has been banned!`, message: `${member.user.username} has been banned!` };
  }






  exports.warnUser = async function (user, staff, reason, punishmentID) {
    const guild = client.guilds.cache.get(config.GuildID);
    const guildData = await guildModel.findOne({ guildID: config.GuildID });
    
    let member = await guild.members.fetch(user.id);
    let staffUser = await guild.members.fetch(staff.id);
    
    if(!reason) reason = "No reason specified."
    
    const StaffMember = await staffModel.findOne({ userId: member.id });
    
    const hasPermission = await exports.checkPermission(staffUser.id, "WARN_USERS");
    if (!hasPermission) return { success: false, message: `Sorry, you don't have permissions to do this!` };

    if (member.id === staffUser.id) return { success: false, message: `You can't warn yourself!` };
    if (!member) return { success: false, message: `The user is not in the server!` };
    if (member.user.bot) return { success: false, message: `You can't warn a bot!` };
    if (StaffMember) return { success: false, message: `You can't warn a staff member!` };

    const actionLimitCheckResult = await exports.checkActionLimit(member, staffUser, "Warn");
    if (!actionLimitCheckResult.success) return { success: false, message: actionLimitCheckResult.message };
    
    const logEmbed = new EmbedBuilder()
    .setAuthor({ name: `Moderation Action`, iconURL: `https://i.imgur.com/6vU8Acu.png` })
    .setColor("Red")
    .addFields([
      { name: `Action`, value: `\`\`Warn\`\` *(<t:${(Date.now() / 1000 | 0)}:R>)*` },
      { name: `Details`, value: `\`\`Staff\`\` <@!${staffUser.id}>\n\`\`User\`\` <@!${member.id}>\n\`\`Reason\`\` ${reason}` },
      ])
    .setTimestamp()
    .setFooter({ text: `#${guildData.totalActions} | ID: ${punishmentID}`, iconURL: `${staffUser.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })
    
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
  
    const logsChannel = guild.channels.cache.get(config.Warn.LogsChannelID);
    
        // DM User
        if (config.Warn.DMUser.Enabled) {
          try {
              const embedSettings = config.Warn.DMUser.Embed;
              const dmEmbed = new EmbedBuilder();
              if (embedSettings.Author && embedSettings.AuthorIcon) dmEmbed.setAuthor({ name: embedSettings.Author, iconURL: embedSettings.AuthorIcon });
              if (embedSettings.Author && !embedSettings.AuthorIcon) dmEmbed.setAuthor({ name: embedSettings.Author });
              if (embedSettings.Color) dmEmbed.setColor(embedSettings.Color);
              if (embedSettings.Description) dmEmbed.setDescription(embedSettings.Description.replace('{guildName}', guild.name)
                  .replace('{user}', `<@!${member.id}>`)
                  .replace('{username}', member.user.username)
                  .replace('{staff}', `<@!${staffUser.id}>`)
                  .replace('{reason}', reason)
                  .replace('{punishmentID}', punishmentID));
    
              if (embedSettings.ThumbnailEnabled) {
                  if (embedSettings.CustomThumbnail && embedSettings.CustomThumbnail !== '') {
                      dmEmbed.setThumbnail(embedSettings.CustomThumbnail);
                  } else {
                      dmEmbed.setThumbnail(member.user.displayAvatarURL({ format: 'png', dynamic: true }));
                  }
              }
    
              dmEmbed.addFields(embedSettings.Fields.map(field => ({
                  name: field.name,
                  value: field.value.replace('{guildName}', guild.name)
                      .replace('{user}', `<@!${member.id}>`)
                      .replace('{username}', member.user.username)
                      .replace('{staff}', `<@!${staffUser.id}>`)
                      .replace('{reason}', reason)
                      .replace('{punishmentID}', punishmentID),
              })));
    
              if (embedSettings.Timestamp) {
                  dmEmbed.setTimestamp();
              }
    
              const footerText = embedSettings.Footer.text.replace('{guildName}', guild.name)
                  .replace('{username}', member.user.username)
                  .replace('{reason}', reason)
                  .replace('{punishmentID}', punishmentID);
    
              // Check if footer.text is not blank before setting the footer
              if (footerText.trim() !== '') {
                  if (embedSettings.Footer.Enabled && embedSettings.Footer.CustomIconURL == '' && embedSettings.Footer.IconEnabled) {
                      dmEmbed.setFooter({
                          text: footerText,
                          iconURL: member.user.displayAvatarURL({ format: 'png', dynamic: true }),
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
  
              if(config.AppealSystem.Enabled && config.Warn.Appealable) await member.send({ embeds: [dmEmbed], components: [actionRow] });
              if(config.AppealSystem.Enabled && !config.Warn.Appealable) await member.send({ embeds: [dmEmbed] });
              if(!config.AppealSystem.Enabled) await member.send({ embeds: [dmEmbed] });
          } catch (e) {
              console.log('\x1b[33m%s\x1b[0m', "[INFO] I tried to DM a user, but their DM's are locked.");
          }
      }
    
      let userFromDB = await userModel.findOne({ userID: member.id });
      if(!userFromDB) await userModel.create({ userID: member.id });

      const newPunishment = new punishmentModel({
          userID: member.id,
          username: member.user.username,
          punishment: 'Warn',
          punishmentID: punishmentID,
          reason: reason,
          staff: staffUser.id,
          staffUsername: staffUser.user.username,
          recentMessages: userFromDB?.messageHistory || []
      });
      await newPunishment.save();
  
      const totalWarnings = await punishmentModel.countDocuments({ userID: member.id, punishment: 'Warn' });

      guildData.totalActions = (guildData.totalActions || 0) + 1;
      guildData.totalWarns = (guildData.totalWarns || 0) + 1;
      await guildData.save();
  
// Action limit
if (staffUser.id !== client.user.id) {
let guildOwner = await guild.fetchOwner();
if (guildOwner.id !== staffUser.id) {
const UserStaffMember = await staffModel.findOne({ userId: staffUser.id });
const roleConfig = config.staffRoles.find(role => role.name.toLowerCase() === UserStaffMember.roleName.toLowerCase());

if (roleConfig.actionLimits.Enabled) {
    // Parse the time period string into milliseconds
    const timePeriodMilliseconds = parseDuration(roleConfig.actionLimits.Limits.TimePeriod);

    // Reset actionsWithinTimePeriod if the time period has passed since the last action
    const currentTime = new Date();
    const timeDiff = currentTime - new Date(UserStaffMember.actionLimits.Warn.lastActionTimestamp);

    if (timeDiff >= timePeriodMilliseconds) {
        UserStaffMember.actionLimits.Warn.actionsWithinTimePeriod = 0;
    }

    // Increment actionsWithinTimePeriod by 1
    UserStaffMember.actionLimits.Warn.actionsWithinTimePeriod += 1;
    UserStaffMember.actionLimits.Warn.lastActionTimestamp = new Date();

    await UserStaffMember.save();
}
}
}
//

    exports.incrementStats(new Date(), 'warns')

    if (logsChannel) logsChannel.send({ embeds: [logEmbed], components: [actionRow] });
    return { success: true, discordMessage: `<@!${member.id}> has been warned! They now have ${totalWarnings} warning(s)`, message: `${member.user.username} has been warned! They now have ${totalWarnings} warning(s)` };
    }


    exports.dmUser = async function (user, staff, message) {
        const guild = client.guilds.cache.get(config.GuildID);
        const guildData = await guildModel.findOne({ guildID: config.GuildID });
        
        let member = await guild.members.fetch(user.id);
        let staffUser = await guild.members.fetch(staff.id);
        
        const StaffMember = await staffModel.findOne({ userId: member.id });
        
        const hasPermission = await exports.checkPermission(staffUser.id, "DM_USERS");
        if (!hasPermission) return { success: false, message: `Sorry, you don't have permissions to do this!` };
    
        if (member.id === staffUser.id) return { success: false, message: `You can't dm yourself!` };
        if (!member) return { success: false, message: `The user is not in the server!` };
        if (member.user.bot) return { success: false, message: `You can't DM a bot!` };
        if (StaffMember) return { success: false, message: `You can't DM a staff member!` };
        
        const logEmbed = new EmbedBuilder()
        .setAuthor({ name: `Moderation Action`, iconURL: `https://i.imgur.com/6vU8Acu.png` })
        .setColor("Red")
        .addFields([
          { name: `Action`, value: `\`\`DM User\`\` *(<t:${(Date.now() / 1000 | 0)}:R>)*` },
          { name: `Details`, value: `\`\`Staff\`\` <@!${staffUser.id}>\n\`\`User\`\` <@!${member.id}>\n\`\`Message\`\` ${message}` },
          ])
        .setTimestamp()
        .setFooter({ text: `#${guildData.totalActions}`, iconURL: `${staffUser.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })
      
              const viewProfileButton = new Discord.ButtonBuilder()
                  .setStyle('Link')
                  .setLabel('View Profile')
                  .setURL(`${config.Dashboard.URL}/view/${member.id}`);
      
            const actionRow = new Discord.ActionRowBuilder().addComponents(viewProfileButton);
            const logsChannel = guild.channels.cache.get(config.Warn.LogsChannelID);
        
            // DM User
              try {
                  await member.send({ content: `${message}` });
              } catch (e) {
                  console.log('\x1b[33m%s\x1b[0m', "[INFO] I tried to DM a user, but their DM's are locked.");
                  return { success: false, message: `You can't DM this user because they have direct messages disabled!` };
              }
    
          guildData.totalActions = (guildData.totalActions || 0) + 1;
          await guildData.save();
    
        if (logsChannel) logsChannel.send({ embeds: [logEmbed], components: [actionRow] });
        return { success: true, message: `Successfully sent a direct message to ${member.user.username}` };
        }



  exports.setNote = async function (user, staff, noteText) {
    const guild = client.guilds.cache.get(config.GuildID);
    const guildData = await guildModel.findOne({ guildID: config.GuildID });
    
    let member = await guild.members.fetch(user.id);
    let staffUser = await guild.members.fetch(staff.id);
    
    const StaffMember = await staffModel.findOne({ userId: member.id });
    
    const hasPermission = await exports.checkPermission(staffUser.id, "SET_NOTES");
    if (!hasPermission) return { success: false, message: `Sorry, you don't have permissions to do this!` };

    if (member.id === staffUser.id) return { success: false, message: `You can't set a note for yourself!` };
    if (!member) return { success: false, message: `The user is not in the server!` };
    if (member.user.bot) return { success: false, message: `You can't set a note on a bot!` };
    if (StaffMember) return { success: false, message: `You can't set a note on a staff member!` };
    if (noteText.length > 1024) return { success: false, message: `Note text cannot exceed 1024 characters!` };
    
    const logEmbed = new EmbedBuilder()
    .setAuthor({ name: `Moderation Action`, iconURL: `https://i.imgur.com/6vU8Acu.png` })
    .setColor("Red")
    .addFields([
      { name: `Action`, value: `\`\`Note Set\`\` *(<t:${(Date.now() / 1000 | 0)}:R>)*` },
      { name: `Details`, value: `\`\`Staff\`\` <@!${staffUser.id}>\n\`\`User\`\` <@!${member.id}>\n\`\`Note\`\` ${noteText}` },
      ])
    .setTimestamp()
    .setFooter({ text: `#${guildData.totalActions}`, iconURL: `${staffUser.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })
    
    const logsChannel = guild.channels.cache.get(config.Note.LogsChannelID);
    
      let userData = await userModel.findOne({ userID: member.id });
      if (!userData) userData = new userModel({ userID: member.id });

      userData.note = noteText;
      await userData.save();

      guildData.totalActions = (guildData.totalActions || 0) + 1;
      await guildData.save();

      let truncatedNoteText = noteText.length > 400 ? noteText.substring(0, 400) + '...' : noteText;

      if (logsChannel) logsChannel.send({ embeds: [logEmbed] });
      return { success: true, discordMessage: `<@!${member.id}>'s note has been set to \`${truncatedNoteText}\`!`, message: `${member.user.username}'s note has been set to ${noteText}!` };
    }


// Check config for errors
exports.checkConfig = function(client){
    let foundErrors = [];
    let guild = client.guilds.cache.get(config.GuildID)

    const validPermissions = [
        'ADMINISTRATOR',
        'MANAGE_STAFF_MEMBERS',
        'ACCESS_DASHBOARD',
        'VIEW_USERS',
        'SET_NOTES',
        'SET_SLOWMODE',
        'PURGE_MESSAGES',
        'CLEAR_CHANNEL',
        'CLEAR_HISTORY',
        'VIEW_HISTORY',
        'DELETE_PUNISHMENTS',
        'VIEW_RECENT_PUNISHMENTS',
        'VIEW_RECENT_MESSAGES',
        'CLEAR_RECENT_MESSAGES',
        'WARN_USERS',
        'TIMEOUT_USERS',
        'KICK_USERS',
        'BAN_USERS',
        'VIEW_APPEALS',
        'MANAGE_APPEALS',
        'DELETE_APPEALS',
        'VIEW_STATS',
        'LOOKUP_PUNISHMENTS',
        'UNBAN_USERS',
        'DM_USERS',
        'OVERVIEW_MESSAGES',
    ];

    config.staffRoles.forEach(role => {
        const invalidPermissions = role.permissions.filter(permission => !validPermissions.includes(permission));
        if (invalidPermissions.length > 0) {
            console.log('\x1b[31m%s\x1b[0m', `[WARNING] Invalid permissions found for role ${role.name} in the config. (${invalidPermissions.join(', ')})`);
            foundErrors.push(`Invalid permissions found for role "${role.name}": ${invalidPermissions.join(', ')}`);
        }
    });

    if(foundErrors.length > 0) {
        let logMsg = `\n\n[${new Date().toLocaleString()}] [CONFIG ERROR(S)] \n${foundErrors.join("\n ").trim()}`;
        fs.appendFile("./logs.txt", logMsg, (e) => { 
          if(e) console.log(e);
        });
    }

}

  client.login(config.Token).catch(error => {
    if (error.message.includes("Used disallowed intents")) {
      console.log('\x1b[31m%s\x1b[0m', `Used disallowed intents (READ HOW TO FIX): \n\nYou did not enable Privileged Gateway Intents in the Discord Developer Portal!\nTo fix this, you have to enable all the privileged gateway intents in your discord developer portal, you can do this by opening the discord developer portal, go to your application, click on bot on the left side, scroll down and enable Presence Intent, Server Members Intent, and Message Content Intent`);
      process.exit();
    } else if (error.message.includes("An invalid token was provided")) {
      console.log('\x1b[31m%s\x1b[0m', `[ERROR] The bot token specified in the config is incorrect!`)
      process.exit()
    } else {
      console.log('\x1b[31m%s\x1b[0m', `[ERROR] An error occured while attempting to login to the bot`)
      console.log(error)
      process.exit()
    }
  })
