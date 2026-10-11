import { Client, GatewayIntentBits, MessageFlags, Partials, REST, Routes } from 'discord.js';
import { InventoryService } from './services/inventoryService';
import {
  getStorageCommands,
  storageInteractionHandler,
} from './features/storageManager';
import {
  AVAILABLE_CHANNELS,
  DISCORD_TOKEN,
  SYND_CHANNEL,
} from './constants/envVars';
import { handleVoiceStateUpdate } from './features/voiceCreate';
import { getMusicCommands, handleMusicVoiceStateUpdate, musicInteractionHandler } from './features/musicManager';
import {
  contractsInteractionHandler,
  getContractsCommands,
} from './features/contractsManager';
import {
  discordInteractionHandler,
  getDiscordCommands,
} from './features/discordManager';

const client = new Client({
  intents: [
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.User, Partials.GuildMember],
});

const inventoryService = new InventoryService(client);
const storageCommandNames = new Set(getStorageCommands().map((command) => command.name));
const contractsCommandNames = new Set(getContractsCommands().map((command) => command.name));
const discordCommandNames = new Set(getDiscordCommands().map((command) => command.name));
const musicCommandNames = new Set(getMusicCommands().map((command) => command.name));
const commands = [
  ...getStorageCommands(),
  ...getContractsCommands(),
  ...getDiscordCommands(),
  ...getMusicCommands(),
];

async function registerCommandsForGuild(guildId: string) {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user!.id, guildId), {
    body: commands,
  });
}

client.once('ready', async () => {
  console.log(`✅ Бот запущен как ${client.user?.tag}`);

  await inventoryService.loadInventory();
  await inventoryService.init();

  const guildIds =
    AVAILABLE_CHANNELS.length > 0
      ? AVAILABLE_CHANNELS
      : [...client.guilds.cache.keys()];

  for (const guildId of guildIds) {
    await registerCommandsForGuild(guildId).catch((error) => {
      console.error(
        `❌ Не удалось зарегистрировать команды для сервера ${guildId}:`,
        error
      );
    });
  }

  console.log('✅ Команды зарегистрированы');
});

client.on('voiceStateUpdate', (oldState, newState) => {
  handleMusicVoiceStateUpdate(oldState, newState);
  void handleVoiceStateUpdate(oldState, newState).catch(console.error);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.guildId) return;

  try {
    if (interaction.isAutocomplete()) {
      if (interaction.guildId === SYND_CHANNEL && storageCommandNames.has(interaction.commandName)) {
        await storageInteractionHandler(interaction, inventoryService, client);
      }
      return;
    }
    if (!interaction.isChatInputCommand()) return;

    // Every interaction belongs to one handler. Other commands remain independent.
    const name = interaction.commandName;
    if (musicCommandNames.has(name)) {
      await musicInteractionHandler(interaction);
    } else if (discordCommandNames.has(name)) {
      await discordInteractionHandler(interaction, client);
    } else if (interaction.guildId === SYND_CHANNEL) {
      if (storageCommandNames.has(name)) {
        await storageInteractionHandler(interaction, inventoryService, client);
      } else if (contractsCommandNames.has(name)) {
        await contractsInteractionHandler(interaction);
      }
    }
  } catch (error) {
    console.error('Ошибка обработки взаимодействия:', error);
    if (!interaction.isChatInputCommand()) return;
    try {
      const content = '❌ Не удалось выполнить команду. Попробуйте ещё раз.';
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content });
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      console.error('Не удалось сообщить об ошибке команды:', replyError);
    }
  }
});

client.on('error', console.error);
client.on('warn', console.warn);

client
  .login(DISCORD_TOKEN)
  .then(() => console.log('🔑 Бот авторизован'))
  .catch((error) => {
    console.error('❌ Ошибка авторизации:', error);
    process.exit(1);
  });
