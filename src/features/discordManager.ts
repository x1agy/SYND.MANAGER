import {
  CacheType,
  Client,
  Interaction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  User,
} from 'discord.js';

const memberListCommands: Record<
  string,
  {
    description: string;
    replyContent: string;
    fileName: string;
    mapUser: (user: User) => string;
  }
> = {
  logins: {
    description: 'Скачать список логинов участников сервера',
    replyContent: 'Список логинов участников сервера:',
    fileName: 'server-members.txt',
    mapUser: (user) => user.username,
  },
  ids: {
    description: 'Скачать список ID участников сервера',
    replyContent: 'Список ID участников сервера:',
    fileName: 'server-members-ids.txt',
    mapUser: (user) => user.id,
  },
};

const getDiscordCommands = () => {
  return Object.entries(memberListCommands).map(([name, command]) =>
    new SlashCommandBuilder()
      .setName(name)
      .setDescription(command.description)
      .toJSON()
  );
};

const discordInteractionHandler = async (
  interaction: Interaction<CacheType>,
  client: Client
) => {
  if (!interaction.isChatInputCommand()) return;

  const command = memberListCommands[interaction.commandName];
  if (!command) return;

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
    const lines = [...members.values()]
      .map((member) => member.user)
      .filter((user) => Boolean(user) && !user.bot)
      .map((user) => command.mapUser(user));

    const fileContent = lines.join('\n');

    await interaction.editReply({
      content: command.replyContent,
      files: [
        {
          attachment: Buffer.from(fileContent, 'utf8'),
          name: command.fileName,
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
