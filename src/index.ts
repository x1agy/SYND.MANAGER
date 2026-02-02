import { Client, GatewayIntentBits, Partials } from 'discord.js';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.Channel, // для работы с каналами
    Partials.Message, // для работы с сообщениями
    Partials.User, // для работы с пользователями
  ],
});

client.once('clientReady', () => {
  console.log(`Бот запущен как ${client.user?.tag}`);
  console.log(`Бот работает на ${client.guilds.cache.size} серверах`);
});

client.on('messageCreate', async (message) => {
  // Игнорируем сообщения от ботов
  if (message.author.bot) return;

  console.log(`Сообщение от ${message.author.tag}: ${message.content}`);

  if (message.content === '!ping') {
  }
});

// Обработка ошибок
client.on('error', console.error);
client.on('warn', console.warn);

client
  .login(process.env.DISCORD_TOKEN)
  .then(() => console.log('Бот авторизован успешно'))
  .catch((error) => {
    console.error('Ошибка авторизации:', error);
    process.exit(1);
  });
