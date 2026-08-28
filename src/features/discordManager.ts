import {
  CacheType,
  Client,
  Guild,
  Interaction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  User,
} from 'discord.js';

const memberListCacheTtlMs = 60_000;
const memberListCache = new Map<string, { expiresAt: number; users: User[] }>();
const memberListRequests = new Map<string, Promise<User[]>>();

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

const fetchGuildUsers = (guild: Guild): Promise<User[]> => {
  const cached = memberListCache.get(guild.id);
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.users);
  }

  const pendingRequest = memberListRequests.get(guild.id);
  if (pendingRequest) {
    return pendingRequest;
  }

  const request = guild.members
    .fetch()
    .then((members) => {
      const users = [...members.values()]
        .map((member) => member.user)
        .filter((user) => !user.bot);

      memberListCache.set(guild.id, {
        expiresAt: Date.now() + memberListCacheTtlMs,
        users,
      });

      return users;
    })
    .finally(() => {
      memberListRequests.delete(guild.id);
    });

  memberListRequests.set(guild.id, request);
  return request;
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
    const users = await fetchGuildUsers(interaction.guild);
    const lines = users.map((user) => command.mapUser(user));

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
    console.error(`Ошибка команды ${interaction.commandName}:`, error);

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
