import { Client, GatewayIntentBits, Partials, REST, Routes } from 'discord.js';
import { InventoryService } from './services/inventoryService';
import {
  getStorageCommands,
  storageInteractionHandler,
} from './features/storageManager';
import { DISCORD_TOKEN, SYND_CHANNEL } from './constants/envVars';
import { handleVoiceStateUpdate } from './features/voiceCreate';
import {
  contractsInteractionHandler,
  getContractsCommands,
} from './features/contractsManager';

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

client.once('ready', async () => {
  console.log(`✅ Бот запущен как ${client.user?.tag}`);

  await inventoryService.loadInventory();
  await inventoryService.init();

  const commands = [...getStorageCommands(), ...getContractsCommands()];

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(client.user!.id, SYND_CHANNEL),
    { body: commands }
  );

  console.log('✅ Команды зарегистрированы');
});

client.on('voiceStateUpdate', (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
});

client.on('interactionCreate', async (interaction) => {
  storageInteractionHandler(interaction, inventoryService, client);
  contractsInteractionHandler(interaction);
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
