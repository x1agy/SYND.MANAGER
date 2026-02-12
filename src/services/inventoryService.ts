import {
  Client,
  TextChannel,
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  InteractionCollector,
  ButtonInteraction,
  CacheType,
} from 'discord.js';
import { GoogleSheetsService } from './googleSheets';
import { ALERT_CHAT_ID, STORAGE_CHAT_ID } from '../constants/envVars';

export interface InventoryItem {
  name: string;
  quantity?: number;
  emoji?: string;
}

const ITEMS_PER_PAGE = 24;

export class InventoryService {
  private googleSheets: GoogleSheetsService;
  inventory: InventoryItem[] = [];
  writeEnabled: boolean = true;
  emoji: { [key: string]: any } = {};
  discordClient: Client;
  storageChannel?: TextChannel;
  private inventoryMessage?: Message;
  private currentPage: number = 0;
  private currentCollector:
    | InteractionCollector<ButtonInteraction<CacheType>>
    | undefined;

  constructor(client: Client) {
    this.googleSheets = new GoogleSheetsService();
    this.discordClient = client;
  }

  async init(): Promise<void> {
    try {
      const ch =
        (await this.discordClient.channels.fetch(STORAGE_CHAT_ID)) ?? null;
      if (!ch) {
        console.error('Storage channel not found or not a text channel');
        return;
      }
      this.storageChannel = ch as TextChannel;

      await this.purgeBotMessages();
      await this.postInventoryMessage(0);
    } catch (error) {
      console.error('InventoryService.init error:', error);
    }
  }

  async purgeBotMessages(): Promise<void> {
    if (!this.storageChannel) return;
    const fetched = await this.storageChannel.messages.fetch({ limit: 100 });
    const botId = this.discordClient.user?.id;
    if (!botId) return;
    const botMessages = fetched.filter((m) => m.author?.id === botId);

    for (const m of botMessages.values()) {
      await m.delete();
    }
  }

  async loadInventory(): Promise<void> {
    this.inventory = await this.googleSheets.getInventory();
    if (this.storageChannel) {
      await this.postInventoryMessage(this.currentPage ?? 0);
    }
  }

  getItemByName(name: string): InventoryItem | undefined {
    return this.inventory.find(
      (item) => item.name.toLowerCase() === name.toLowerCase()
    );
  }

  updateEmoji(emoji: { [key: string]: any }): void {
    this.emoji = { ...this.emoji, ...emoji };
  }

  async updateItem(
    name: string,
    change: number,
    userName: string,
    isInvent: boolean
  ): Promise<boolean> {
    const item = this.getItemByName(name);
    if (!this.writeEnabled) return false;
    if (!item) return false;

    const newQuantity = isInvent ? change : (item.quantity ?? 0) + change;

    if (newQuantity < 0) {
      try {
        const channel = (await this.discordClient.channels.fetch(
          ALERT_CHAT_ID
        )) as TextChannel;

        const message = `
          🚨 **ВНИМАНИЕ: ОТРИЦАТЕЛЬНЫЙ ОСТАТОК!**
          📦 **Предмет:** ${this.emoji[item.emoji ?? ''] ?? ''} ${item.name}
          👤 **Пользователь:** ${userName}
          📊 **Изменение:** ${change > 0 ? '+' : ''}${change}
          🧮 **Новый остаток:** ${newQuantity}
          ⏰ **Время:** ${new Date().toLocaleString('ru-RU')}
          <@&1467630587803209901>
        `.trim();

        await channel.send(message);
      } catch (error) {
        console.error('❌ Ошибка при отправке уведомления:', error);
      }
    }

    const success = await this.googleSheets.updateInventory(
      item.name,
      newQuantity
    );
    if (!success) return false;

    if (isInvent) {
      await this.googleSheets.addLogEntry(
        userName,
        'инвентаризация',
        item.name,
        change
      );
    } else {
      const action = change > 0 ? 'положил' : 'взял';
      await this.googleSheets.addLogEntry(userName, action, item.name, change);
    }
    await this.googleSheets.addHistoryEntry(item.name, newQuantity);

    return true;
  }

  getCurrentInventory(): InventoryItem[] {
    return this.inventory;
  }

  setWriteEnabled(enabled: boolean): void {
    this.writeEnabled = enabled;
  }

  private async postInventoryMessage(page = 0): Promise<void> {
    if (!this.storageChannel) return;
    const payload = this.getPayloadForPage(page);

    try {
      if (this.inventoryMessage) {
        try {
          this.inventoryMessage = await this.inventoryMessage.edit({
            embeds: payload.embeds,
            components: payload.components,
          });
        } catch (e) {
          await this.inventoryMessage.delete().catch(() => {});
          this.inventoryMessage = await this.storageChannel.send({
            embeds: payload.embeds,
            components: payload.components,
          });
        }
      } else {
        this.inventoryMessage = await this.storageChannel.send({
          embeds: payload.embeds,
          components: payload.components,
        });
      }

      this.currentPage = payload.page;
      this.attachCollectorToInventoryMessage();
    } catch (err) {
      console.error(
        'Ошибка при публикации/редактировании сообщения склада:',
        err
      );
    }
  }

  private attachCollectorToInventoryMessage(): void {
    if (!this.inventoryMessage) return;

    if (this.currentCollector && !this.currentCollector.ended) {
      this.currentCollector.stop();
    }

    this.currentCollector =
      this.inventoryMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 1000 * 60 * 60,
      });

    this.currentCollector.on('collect', async (interaction) => {
      if (!interaction.isButton()) return;
      const id = interaction.customId;

      try {
        if (id === 'inventory_prev') {
          this.currentPage = Math.max(0, (this.currentPage || 0) - 1);
        } else if (id === 'inventory_next') {
          this.currentPage = (this.currentPage || 0) + 1;
        }

        const payload = this.getPayloadForPage(this.currentPage);
        await interaction.update({
          embeds: payload.embeds,
          components: payload.components,
        });

        this.inventoryMessage = interaction.message;
        this.currentPage = payload.page;
      } catch (err) {
        console.error('Ошибка при обработке кнопки склада:', err);
        await interaction.reply({
          content: 'Ошибка при обработке нажатия хуй',
          ephemeral: true,
        });
      }
    });

    this.currentCollector.on('end', () => {
      this.currentCollector = undefined;
    });
  }

  private getPayloadForPage(page = 0) {
    let items = this.inventory.slice();

    const pages: EmbedBuilder[] = [];
    for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
      const pageItems = items.slice(i, i + ITEMS_PER_PAGE);
      const embed = new EmbedBuilder()
        .setTitle('📦 Склад / Инвентарь')
        .setColor('#2F3136')
        .setTimestamp(new Date())
        .setFooter({
          text: `Показаны ${i + 1}-${i + pageItems.length + 1} из ${
            items.length + 1
          }`,
        });

      for (const it of pageItems) {
        const qty = typeof it.quantity === 'number' ? String(it.quantity) : '—';
        const emoji = this.emoji[it.emoji ?? ''];
        embed.addFields({
          name: `${emoji ? emoji + ' ' : ''}${it.name}`,
          value: `Количество: **${qty}**`,
          inline: true,
        });
      }
      pages.push(embed);
    }
    const maxPage = pages.length - 1;
    const safePage = Math.min(Math.max(0, page), maxPage);

    const prevBtn = new ButtonBuilder()
      .setCustomId('inventory_prev')
      .setLabel('◀️ Назад')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 0);

    const nextBtn = new ButtonBuilder()
      .setCustomId('inventory_next')
      .setLabel('Вперёд ▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= maxPage);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      prevBtn,
      nextBtn
    );

    return {
      embeds: [pages[safePage]!],
      components: [row],
      page: safePage,
      maxPage,
    };
  }
}
