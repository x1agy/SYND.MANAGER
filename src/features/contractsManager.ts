import ContractsService from '../services/contractsService';

import {
CacheType,
Interaction,
SlashCommandBuilder,
} from 'discord.js';

const getContractsCommands = () => {
return [
  new SlashCommandBuilder()
    .setName('k')
    .setDescription('Добавить отчет о контракте')
    .addIntegerOption((option) =>
      option
        .setName('кол-во_эссенции')
        .setDescription('Колличество эссенции')
        .setRequired(true)
    )
    .addAttachmentOption((option) =>
      option.setName('скриншот').setDescription('Скриншот').setRequired(true)
    )
    .toJSON(),
];
};

const contractsInteractionHandler = async (
interaction: Interaction<CacheType>
) => {
if (!interaction.isChatInputCommand()) return;

const { commandName } = interaction;

if (commandName !== 'k') return;

await interaction.deferReply({ ephemeral: true }).catch(() => null);

try {
    const essenceNumber = interaction.options.getInteger('кол-во_эссенции');
    const screenshot = interaction.options.getAttachment('скриншот');

    if (!essenceNumber || !screenshot) {
        await interaction.editReply({
            content: '❌ Все параметры обязательны!',
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

    await ContractsService.addReport(userName + ` ${interaction.user.id}`, essenceNumber, screenshot.url);

    await interaction.editReply({
        content: '✅ Отчет успешно добавлен!',
    });
} catch (error) {
    console.error('Ошибка обработки команды k:', error);

    interaction.editReply({
        content: '❌ Произошла ошибка при выполнении команды',
    });
}
};

export { getContractsCommands, contractsInteractionHandler };