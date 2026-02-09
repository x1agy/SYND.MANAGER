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
  const addCommand = (name: string) => {
    return new SlashCommandBuilder()
      .setName(name)
      .setDescription('Обновить количество предметов');
  };

  const addOptions = (command: SlashCommandBuilder) => {
    for (let i = 0; i < 5; i++) {
      if (i === 0) {
        command
          .addStringOption((option) =>
            option
              .setName('предмет1')
              .setDescription('первый предмет (обязательный)')
              .setRequired(true)
              .setAutocomplete(true)
          )
          .addIntegerOption((option) =>
            option
              .setName('количество1')
              .setRequired(true)
              .setDescription(`количество 1 предмета`)
          );
      } else {
        command
          .addStringOption((option) =>
            option
              .setName('предмет' + (i + 1))
              .setDescription(`${i + 1} предмет`)
              .setAutocomplete(true)
          )
          .addIntegerOption((option) =>
            option
              .setName('количество' + (i + 1))
              .setDescription(`количество ${i + 1} предмета`)
          );
      }
    }

    return command;
  };

  return [
    addOptions(addCommand('w')).toJSON(),
    addOptions(addCommand('i')).toJSON(),
    // new SlashCommandBuilder()
    //   .setName('inv_start')
    //   .setDescription('Запретить использование команды /w'),

    // new SlashCommandBuilder()
    //   .setName('inv_stop')
    //   .setDescription('Разрешить использование команды /w'),

    new SlashCommandBuilder()
      .setName('update_emoji')
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
    if (auto.commandName === 'w' || auto.commandName === 'i') {
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
    if (commandName === 'w' || commandName === 'i') {
      {
        const isInv = commandName === 'i';
        if (!inventoryService.writeEnabled && !isInv) {
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

          if (isInv && (quantity ?? 0) < 0) {
            await interaction.editReply({
              content:
                '❌ Отрицательные значения невозможны при инвентаризации',
            });
          }

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

        await inventoryService.loadInventory();

        for (const update of itemUpdates) {
          const success = await inventoryService.updateItem(
            update.name,
            update.quantity,
            user,
            client,
            isInv
          );

          if (success) {
            const item = inventoryService.getItemByName(update.name);
            const action = update.quantity > 0 ? 'Добавлено' : 'Взято';
            const emoji = inventoryService.emoji[item?.emoji ?? ''] ?? '';
            results.push(
              `${isInv ? 'Инвентаризировано' : action} ${
                update.quantity
              } ${emoji} ${item?.name}`
            );
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
        return;
      }
    }

    switch (commandName) {
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

      case 'update_emoji': {
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
