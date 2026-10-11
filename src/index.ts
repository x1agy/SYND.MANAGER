import { Client, GatewayIntentBits, Partials, REST, Routes } from 'discord.js';
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
const commands = [
  ...getStorageCommands(),
  ...getContractsCommands(),
  ...getDiscordCommands(),
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
  handleVoiceStateUpdate(oldState, newState);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.guildId) return;

  if (interaction.guildId === SYND_CHANNEL) {
    storageInteractionHandler(interaction, inventoryService, client);
    contractsInteractionHandler(interaction);
  }
  discordInteractionHandler(interaction, client);
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
