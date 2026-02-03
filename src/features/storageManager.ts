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
      .setName('write')
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
      .setDescription('Запретить использование команды /write'),

    new SlashCommandBuilder()
      .setName('inv_stop')
      .setDescription('Разрешить использование команды /write'),

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
    if (auto.commandName === 'write') {
      const focused = String(auto.options.getFocused() ?? '').toLowerCase();
      const suggestions = inventoryService
        .getCurrentInventory()
        .filter((it) => it.name.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((it) => ({ name: `${it.emoji} ${it.name}`, value: it.name }));
      await auto.respond(suggestions);
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    switch (commandName) {
      case 'write': {
        if (!inventoryService.writeEnabled) {
          await interaction.reply({
            content: 'Редактирование запрещено, проводится инвентаризация.',
            ephemeral: true,
          });
        }

        const name = interaction.options.getString('предмет', true);
        const quantity = interaction.options.getInteger('количество', true);
        const userName = (
          'nickname' in interaction.member!
            ? interaction.member?.nickname ?? ''
            : ''
        ).match(/\[.+\]/)?.[0];

        if (!userName) {
          await interaction.reply({
            content: '❌ Приведите свой никнейм к единому формату - [ваше имя]',
            ephemeral: true,
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
          await interaction.reply({
            content: `✅ ${quantity > 0 ? 'Добавлено' : 'Взято'} ${quantity} ${
              item?.name
            }`,
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: '❌ Не удалось обновить инвентарь.',
            ephemeral: true,
          });
        }
        break;
      }

      case 'inv_start': {
        inventoryService.setWriteEnabled(false);
        await interaction.reply({
          content:
            '⌛ Запущена инвентаризация склада, использование команды /write запрещено',
          ephemeral: true,
        });
        break;
      }

      case 'inv_stop': {
        inventoryService.setWriteEnabled(true);
        await interaction.reply({
          content:
            '✅ Инвентаризация склада окончена, использование команды /write разрешено',
          ephemeral: true,
        });
        break;
      }

      case 'inv': {
        await inventoryService.loadInventory();
        await interaction.reply({
          content: 'Данные обновлены',
          ephemeral: true,
        });
        break;
      }
    }
  } catch (error) {
    console.error('Ошибка обработки команды:', error);
    await interaction.reply({
      content: '❌ Произошла ошибка при выполнении команды',
      ephemeral: true,
    });
  }
};

export { getStorageCommands, storageInteractionHandler };
