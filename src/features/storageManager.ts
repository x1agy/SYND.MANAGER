import {
  AutocompleteInteraction,
  CacheType,
  Client,
  Interaction,
  InteractionType,
  SlashCommandBuilder,
} from 'discord.js';
import { InventoryService } from '../services/inventoryService';

const getStorageCommands = () => {
  return [
    new SlashCommandBuilder()
      .setName('w')
      .setDescription('Обновить количество предметов')
      .addStringOption((option) =>
        option
          .setName('предмет1')
          .setDescription('Первый предмет (обязательный)')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addIntegerOption((option) =>
        option
          .setName('количество1')
          .setDescription('Количество первого предмета')
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('предмет2')
          .setDescription('Второй предмет (опционально)')
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addIntegerOption((option) =>
        option
          .setName('количество2')
          .setDescription('Количество второго предмета')
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName('предмет3')
          .setDescription('Третий предмет (опционально)')
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addIntegerOption((option) =>
        option
          .setName('количество3')
          .setDescription('Количество третьего предмета')
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName('предмет4')
          .setDescription('Четвертый предмет (опционально)')
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addIntegerOption((option) =>
        option
          .setName('количество4')
          .setDescription('Количество четвертого предмета')
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName('предмет5')
          .setDescription('Пятый предмет (опционально)')
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addIntegerOption((option) =>
        option
          .setName('количество5')
          .setDescription('Количество пятого предмета')
          .setRequired(false)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('inv_start')
      .setDescription('Запретить использование команды /w'),

    new SlashCommandBuilder()
      .setName('inv_stop')
      .setDescription('Разрешить использование команды /w'),

    new SlashCommandBuilder()
      .setName('inv')
      .setDescription('Обновить данные бота'),
  ];
};

const storageInteractionHandler = async (
  interaction: Interaction<CacheType>,
  inventoryService: InventoryService,
  client: Client
) => {
  if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
    const auto = interaction as AutocompleteInteraction;
    if (auto.commandName === 'w') {
      const focused = String(auto.options.getFocused() ?? '').toLowerCase();
      const suggestions = inventoryService
        .getCurrentInventory()
        .filter((it) => it.name.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((it) => ({ name: `${it.name}`, value: it.name }));
      await auto.respond(suggestions);
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  await interaction.deferReply({ ephemeral: true }).catch(() => null);

  try {
    switch (commandName) {
      case 'w': {
        if (!inventoryService.writeEnabled) {
          await interaction.editReply({
            content: 'Редактирование запрещено, проводится инвентаризация.',
          });
          return;
        }

        const userName = (
          'nickname' in interaction.member!
            ? interaction.member?.nickname ?? ''
            : ''
        ).match(/\[.+\]/)?.[0];

        if (!userName) {
          await interaction.editReply({
            content: '❌ Приведите свой никнейм к единому формату - [ваше имя]',
          });
          return;
        }

        const itemUpdates = [];
        const user = `${userName} ${interaction.user.id}`;

        for (let i = 1; i <= 5; i++) {
          const itemName = interaction.options.getString(`предмет${i}`);
          const quantity = interaction.options.getInteger(`количество${i}`);

          if (i === 1) {
            if (!itemName || quantity === null) {
              await interaction.editReply({
                content: '❌ Первый предмет и его количество обязательны!',
              });
              return;
            }
            itemUpdates.push({ name: itemName, quantity });
          } else if (itemName && quantity !== null) {
            itemUpdates.push({ name: itemName, quantity });
          } else if (
            (itemName && quantity === null) ||
            (!itemName && quantity !== null)
          ) {
            await interaction.editReply({
              content: `❌ Для предмета #${i} указан только один параметр!`,
            });
            return;
          }
        }

        const results = [];
        const errors = [];

        // Обновляем каждый предмет
        for (const update of itemUpdates) {
          const success = await inventoryService.updateItem(
            update.name,
            update.quantity,
            user,
            client
          );

          if (success) {
            const item = inventoryService.getItemByName(update.name);
            const action = update.quantity > 0 ? 'Добавлено' : 'Взято';
            const emoji = inventoryService.emoji[item?.emoji ?? ''] ?? '';
            results.push(`${action} ${update.quantity} ${emoji} ${item?.name}`);
          } else {
            errors.push(`❌ Не удалось обновить предмет: ${update.name}`);
          }
        }

        let message = '';
        if (results.length > 0) {
          message += `✅ **Обновлено ${results.length} предмет(а/ов):**\n`;
          message += results.map((r) => `• ${r}`).join('\n');
        }
        if (errors.length > 0) {
          message += `\n\n**Ошибки:**\n${errors.join('\n')}`;
        }

        await interaction.editReply({
          content: message,
        });
        break;
      }

      case 'inv_start': {
        inventoryService.setWriteEnabled(false);
        await interaction.editReply({
          content:
            '⌛ Запущена инвентаризация склада, использование команды /w запрещено',
        });
        break;
      }

      case 'inv_stop': {
        inventoryService.setWriteEnabled(true);
        await interaction.editReply({
          content:
            '✅ Инвентаризация склада окончена, использование команды /w разрешено',
        });
        break;
      }

      case 'inv': {
        await inventoryService.loadInventory();

        client.guilds.cache.forEach((guild) => {
          const emojiObj: { [key: string]: any } = {};

          guild.emojis.cache.forEach((emoji) => {
            emojiObj[`:${emoji.name}:`] = emoji;
          });

          inventoryService.updateEmoji(emojiObj);
        });

        await interaction.editReply({
          content: 'Данные обновлены',
        });
        break;
      }
    }
  } catch (error) {
    console.error('Ошибка обработки команды:', error);

    try {
      await interaction.editReply({
        content: '❌ Произошла ошибка при выполнении команды',
      });
    } catch (e) {
      try {
        await interaction.followUp({
          content: '❌ Произошла ошибка при выполнении команды',
          ephemeral: true,
        });
      } catch (followUpError) {
        console.error('Не удалось отправить ответ:', followUpError);
      }
    }
  }
};

export { getStorageCommands, storageInteractionHandler };
