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
      .setDescription('Обновить количество предмета')
      .addStringOption((option) =>
        option
          .setName('предмет')
          .setDescription('Выберите предмет')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addIntegerOption((option) =>
        option
          .setName('количество')
          .setDescription('Количество (положительное/отрицательное)')
          .setRequired(true)
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

        const name = interaction.options.getString('предмет', true);
        const quantity = interaction.options.getInteger('количество', true);
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

        const success = await inventoryService.updateItem(
          name,
          quantity,
          `${userName} ${interaction.user.id}`,
          client
        );

        if (success) {
          const item = inventoryService.getItemByName(name);
          await interaction.editReply({
            content: `✅ ${quantity > 0 ? 'Добавлено' : 'Взято'} ${quantity} ${
              inventoryService.emoji[item?.emoji ?? ''] ?? ''
            } ${item?.name}`,
          });
        } else {
          await interaction.editReply({
            content: '❌ Не удалось обновить инвентарь.',
          });
        }
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
