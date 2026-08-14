#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const targetGuildId = process.env.GUILD_ID || process.argv[2] || null;

if (!token) {
  console.error(
    '❌ Укажите DISCORD_TOKEN в .env или передайте его в окружение.'
  );
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

async function collectServerMembers() {
  await client.guilds.fetch().catch(() => null);

  const guild = targetGuildId
    ? client.guilds.cache.get(targetGuildId) ||
      (await client.guilds.fetch(targetGuildId).catch(() => null))
    : client.guilds.cache.first() || null;

  if (!guild) {
    throw new Error(
      targetGuildId
        ? `Сервер с ID ${targetGuildId} не найден у этого бота.`
        : 'У бота нет доступных серверов.'
    );
  }

  if (!guild.members || typeof guild.members.fetch !== 'function') {
    throw new Error(
      targetGuildId
        ? `У сервера ${targetGuildId} нет доступного менеджера участников.`
        : 'У этого сервера нет доступного менеджера участников.'
    );
  }

  const members = await guild.members.fetch().catch(() => null);

  if (!members) {
    return [];
  }

  return [...members.values()]
    .map((member) => member.user)
    .filter((user) => Boolean(user) && !user.bot)
    .sort((a, b) => a.username.localeCompare(b.username));
}

client.once('clientReady', async () => {
  console.log(`✅ Бот запущен как ${client.user?.tag}`);

  let members = [];

  try {
    members = await collectServerMembers();
  } catch (error) {
    console.error(`❌ ${error.message}`);
    await client.destroy();
    return;
  }

  const outputLines = members.map((user) => user.username);

  const outputPath = path.join(__dirname, 'server-members.txt');
  fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf8');

  console.log(`\n✅ Файл сохранён: ${outputPath}`);
  console.log(`Всего участников: ${members.length}`);
  for (const user of members) {
    console.log(user.username);
  }

  await client.destroy();
});

client.login(token).catch((error) => {
  console.error('❌ Ошибка входа:', error);
  process.exit(1);
});
