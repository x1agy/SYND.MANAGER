import ContractsService from '../services/contractsService';

import {
CacheType,
Interaction,
SlashCommandBuilder,
} from 'discord.js';

const getContractsCommands = () => {
  const addCommand = (name: string) => {
    return new SlashCommandBuilder()
      .setName(name)
      .setDescription('Добавить отчет о контракте (до 10 контрактов)');
  };

  const addOptions = (command: SlashCommandBuilder) => {
    for (let i = 0; i < 10; i++) {
      if (i === 0) {
        command
          .addIntegerOption((option) =>
            option
              .setName('кол-во_эссенции1')
              .setDescription('Колличество эссенции (обязательно)')
              .setRequired(true)
          )
          .addAttachmentOption((option) =>
            option
              .setName('скриншот1')
              .setDescription('Скриншот (обязательно)')
              .setRequired(true)
          );
      } else {
        command
          .addIntegerOption((option) =>
            option
              .setName(`кол-во_эссенции${i + 1}`)
              .setDescription(`Колличество эссенции контракта ${i + 1}`)
          )
          .addAttachmentOption((option) =>
            option
              .setName(`скриншот${i + 1}`)
              .setDescription(`Скриншот контракта ${i + 1}`)
          );
      }
    }
    return command;
  };

  return [addOptions(addCommand('k')).toJSON()];
};

const contractsInteractionHandler = async (
  interaction: Interaction<CacheType>
) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName !== 'k') return;

  await interaction.deferReply({ ephemeral: true }).catch(() => {});

  const safeReply = async (content: string) => {
    try {
      await interaction.editReply({ content });
    } catch (err: any) {
      if (!interaction.replied) {
        await interaction.reply({ content, flags: 64 });
      }
    }
  };

  try {
    const userName = (
      'nickname' in interaction.member!
        ? interaction.member?.nickname ?? ''
        : ''
    ).match(/\[.+\]/)?.[0];

    if (!userName) {
      await safeReply(
        '❌ Приведите свой никнейм к единому формату - [ваше имя]'
      );
      return;
    }

    const contractUpdates: { essenceNumber: number; screenshot: any }[] = [];
    const errors: string[] = [];

    for (let i = 1; i <= 10; i++) {
      const essenceNumber = interaction.options.getInteger(
        `кол-во_эссенции${i}`
      );
      const screenshot = interaction.options.getAttachment(`скриншот${i}`);

      if (i === 1) {
        if (!essenceNumber || !screenshot) {
          await safeReply(
            '❌ Первый контракт с количеством эссенции и скриншотом обязателен!'
          );
          return;
        }
        contractUpdates.push({ essenceNumber, screenshot });
      } else if (essenceNumber && screenshot) {
        contractUpdates.push({ essenceNumber, screenshot });
      } else if (
        (essenceNumber && !screenshot) ||
        (!essenceNumber && screenshot)
      ) {
        errors.push(
          `❌ Для контракта #${i} указан только один параметр (нужны оба)!`
        );
      }
    }

    if (errors.length > 0) {
      await safeReply(errors.join('\n'));
      return;
    }

    const validatedErrors = [];
    const results = [];
    const validReports = [];

    for (let i = 0; i < contractUpdates.length; i++) {
      const update = contractUpdates[i]!;
      const { essenceNumber, screenshot } = update;

      if (![13, 11, 9, 5, 7, 3].includes(essenceNumber)) {
        validatedErrors.push(
          `❌ Контракт #${i + 1}: Недопустимое количество эссенции!`
        );
        continue;
      }

      validReports.push({ essenceNumber, screenshotLink: screenshot.url });
      results.push(`✅ Контракт #${i + 1}: ${essenceNumber} эссенции`);
    }

    if (validReports.length > 0) {
      try {
        await ContractsService.addReports(
          userName + ` ${interaction.user.id}`,
          validReports
        );
      } catch (error) {
        validatedErrors.unshift('❌ Ошибка при сохранении контрактов');
        results.splice(0, results.length);
      }
    }

    let message = '';
    if (results.length > 0) {
      message += results.join('\n');
    }
    if (validatedErrors.length > 0) {
      if (message) message += '\n\n';
      message += validatedErrors.join('\n');
    }

    if (!message) {
      message = '❌ Не удалось добавить контракты';
    }

    await safeReply(message);
  } catch (error) {
    console.error('Ошибка обработки команды k:', error);

    if (interaction.deferred || interaction.replied) {
      try {
        await interaction.editReply({
          content: '❌ Произошла ошибка при выполнении команды',
        });
      } catch (e) {
        console.error('Не удалось редактировать ответ после ошибки:', e);
      }
    } else {
      await interaction.reply({
        content: '❌ Произошла ошибка при выполнении команды',
        ephemeral: true,
      });
    }
  }
};

export { getContractsCommands, contractsInteractionHandler };