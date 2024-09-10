const color = require('ansi-colors');
const axios = require('axios');
const fs = require('fs');

console.log(`${color.yellow(`Starting bot, this can take a while..`)}`);

const version = Number(process.version.split('.')[0].replace('v', ''));
if (version < 18) {
  console.log(`${color.red(`[ERROR] Plex Staff requires a NodeJS version of 18 or higher!\nYou can check your NodeJS by running the "node -v" command in your terminal.`)}`);

  // Add update instructions
  console.log(`${color.blue(`\n[INFO] To update Node.js, follow the instructions below for your operating system:`)}`);
  console.log(`${color.green(`- Windows:`)} Download and run the installer from ${color.cyan(`https://nodejs.org/`)}`);
  console.log(`${color.green(`- Ubuntu/Debian:`)} Run the following commands in the Terminal:`);
  console.log(`${color.cyan(`  - sudo apt update`)}`);
  console.log(`${color.cyan(`  - sudo apt upgrade nodejs`)}`);
  console.log(`${color.green(`- CentOS:`)} Run the following commands in the Terminal:`);
  console.log(`${color.cyan(`  - sudo yum update`)}`);
  console.log(`${color.cyan(`  - sudo yum install -y nodejs`)}`);

  let logMsg = `\n\n[${new Date().toLocaleString()}] [ERROR] Plex Staff requires a NodeJS version of 18 or higher!`;
  fs.appendFile("./logs.txt", logMsg, (e) => { 
    if(e) console.log(e);
  });

  process.exit()
}

const packageFile = require('./package.json');
let logMsg = `\n\n[${new Date().toLocaleString()}] [STARTING] Attempting to start the bot..\nNodeJS Version: ${process.version}\nBot Version: ${packageFile.version}`;
fs.appendFile("./logs.txt", logMsg, (e) => { 
  if(e) console.log(e);
});

const { Collection, Client, Discord, ActionRowBuilder, ButtonBuilder, GatewayIntentBits } = require('discord.js');
const yaml = require("js-yaml")
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
const client = new Client({ 
  restRequestTimeout: 60000,
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.GuildMembers, 
    GatewayIntentBits.GuildPresences, 
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ] 
});

exports.client = client;
require("./utils.js");

async function uploadToHaste(textToUpload) {
  try {
    const response = await axios.post('https://paste.plexdevelopment.net/documents', textToUpload);
    return response.data.key;
  } catch (error) {
    if (error.response) {
      console.error('Error uploading to Haste-server. Status:', error.response.status);
      console.error('Response data:', error.response.data);
    } else {
      console.error('Error uploading to Haste-server:', error.message);
    }
    return null;
  }
}

const logsFilePath = './logs.txt';
const configFilePath = './config.yml';
const maxLength = 5000;

async function handleAndUploadError(errorType, error) {
  try {
    console.log(error);

    const errorPrefix = `[${new Date().toLocaleString()}] [${errorType}] [v${packageFile.version}]`;
    const errorMsg = `\n\n${errorPrefix}\n${error.stack}`;
    await fs.appendFile("./logs.txt", errorMsg, (e) => {
      if (e) console.log(e);
    });

    const configContent = fs.readFileSync(configFilePath, 'utf8');
    const redactedConfigContent = redactSensitiveValues(configContent);
    let uploadContent = `[${new Date().toLocaleString()}]\n`;

    const configSection = `Config\n${redactedConfigContent}\n\n`;
    const errorSection = `[${errorType}] [v${packageFile.version}]\n${error.stack}`;
    uploadContent += `${configSection}${errorSection}\n`;

let logsContent = fs.readFileSync(logsFilePath, 'utf8');

if (logsContent.length > maxLength) {
  logsContent = logsContent.substring(logsContent.length - maxLength);
}

const logsSection = `\n\n\nLogs\n${logsContent}\n`;

uploadContent += logsSection;

    const key = await uploadToHaste(uploadContent);

    if (key) {
      const hasteURL = `https://paste.plexdevelopment.net/${key}`;
      console.log(`${color.green.bold(`[v${packageFile.version}]`)} ${color.red(`If you require assistance, create a ticket in our Discord server and share this link:`)} ${color.yellow(hasteURL)}\n\n`);
    } else {
      console.log('Paste Upload failed.');
    }
  } catch (err) {
    console.error('Error handling and uploading error:', err);
  }
}


function redactSensitiveValues(yamlContent) {
    // Define sensitive keys that need to be redacted
    const sensitiveKeys = ['Token', 'LicenseKey', 'MongoURI', 'secretKey', 'clientSecret', 'hCaptchaSiteKey', 'hCaptchaSecretKey'];
    
    const lines = yamlContent.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        for (const key of sensitiveKeys) {
            const index = lines[i].indexOf(key + ':');
            if (index !== -1) {
                const startIndex = index + key.length + 1;
                const endIndex = lines[i].indexOf('#') !== -1 ? lines[i].indexOf('#') - 1 : lines[i].length;
                lines[i] = lines[i].substring(0, startIndex) + ' [REDACTED]' + lines[i].substring(endIndex);
            }
        }
    }
    
    return lines.join('\n');
}




client.on('warn', async (error) => {
  handleAndUploadError('WARN', error);
});

client.on('error', async (error) => {
  handleAndUploadError('ERROR', error);
});

process.on('unhandledRejection', async (error) => {
  handleAndUploadError('unhandledRejection', error);
});

process.on('uncaughtException', async (error) => {
  handleAndUploadError('uncaughtException', error);
});

