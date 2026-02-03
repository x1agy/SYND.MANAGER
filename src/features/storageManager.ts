import {
  AutocompleteInteraction,
  CacheType,
  Interaction,
  InteractionType,
  SlashCommandBuilder,
} from 'discord.js';
import { InventoryService } from '../services/inventoryService';
import { ADMIN_ROLE_ID } from '../constants/envVars';

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
  inventoryService: InventoryService
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
        const userName = ('nickname' in interaction.member! ? interaction.member?.nickname ?? '' : '').match(/\[.+\]/)?.[0];

        if(!userName){
            await interaction.reply({
            content: '❌ Приведите свой никнейм к единому формату - [ваше имя]',
            ephemeral: true,
          });
          return
        }

        const success = await inventoryService.updateItem(
          name,
          quantity,
          `${userName} ${interaction.user.id}`,
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
        const member = await interaction.guild?.members.fetch(
          interaction.user.id
        );
        if (!member?.roles.cache.has(ADMIN_ROLE_ID)) {
          await interaction.reply({
            content: '❌ У вас нет прав для выполнения этой команды',
            ephemeral: true,
          });
          return;
        }

        inventoryService.setWriteEnabled(false);
        await interaction.reply({
          content: '⛔ Использование команды /write запрещено',
          ephemeral: true,
        });
        break;
      }

      case 'inv_stop': {
        const member = await interaction.guild?.members.fetch(
          interaction.user.id
        );
        if (!member?.roles.cache.has(ADMIN_ROLE_ID)) {
          await interaction.reply({
            content: '❌ У вас нет прав для выполнения этой команды',
            ephemeral: true,
          });
          return;
        }

        inventoryService.setWriteEnabled(true);
        await interaction.reply({
          content: '✅ Использование команды /write разрешено',
          ephemeral: true,
        });
        break;
      }

      case 'inv': {
        const member = await interaction.guild?.members.fetch(
          interaction.user.id
        );
        if (!member?.roles.cache.has(ADMIN_ROLE_ID)) {
          await interaction.reply({
            content: '❌ У вас нет прав для выполнения этой команды',
            ephemeral: true,
          });
          return;
        }

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
