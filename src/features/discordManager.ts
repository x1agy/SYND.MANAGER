import {
  CacheType,
  Client,
  Interaction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

const getDiscordCommands = () => {
  return [
    new SlashCommandBuilder()
      .setName('members')
      .setDescription('Скачать список логинов участников сервера')
      .toJSON(),
  ];
};

const discordInteractionHandler = async (
  interaction: Interaction<CacheType>,
  client: Client
) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'members') return;

  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ Команда доступна только на сервере.',
      ephemeral: true,
    });
    return;
  }

  const member = interaction.member;
  const permissions =
    member && 'permissions' in member ? member.permissions : null;

  const isAdmin = Boolean(
    permissions &&
      typeof permissions !== 'string' &&
      (permissions.has(PermissionFlagsBits.Administrator) ||
        permissions.has(PermissionFlagsBits.ManageGuild))
  );

  if (!isAdmin) {
    await interaction.reply({
      content: '❌ Только администраторы могут использовать эту команду.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true }).catch(() => null);

  try {
    const members = await interaction.guild.members
      .fetch()
      .catch(() => new Map());
    const usernames = [...members.values()]
      .map((member) => member.user)
      .filter((user) => Boolean(user) && !user.bot)
      .map((user) => `${user.id}`);

    const fileContent = usernames.join('\n');

    await interaction.editReply({
      content: 'Список логинов участников сервера:',
      files: [
        {
          attachment: Buffer.from(fileContent, 'utf8'),
          name: 'server-members.txt',
        },
      ],
    });
  } catch (error) {
    console.error('Ошибка команды members:', error);

    try {
      await interaction.editReply({
        content: '❌ Не удалось получить список участников.',
      });
    } catch {
      await interaction.reply({
        content: '❌ Не удалось получить список участников.',
        ephemeral: true,
      });
    }
  }
};

export { getDiscordCommands, discordInteractionHandler };
