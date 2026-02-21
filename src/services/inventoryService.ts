import { Client, TextChannel, Message, EmbedBuilder } from 'discord.js';
import { GoogleSheetsService } from './googleSheets';
import { ALERT_CHAT_ID, STORAGE_CHAT_ID } from '../constants/envVars';
import { InventoryItem } from '../types/inventory';
import { storageCategoriesOrder } from '../constants/storage';

function stringToHexColor(str: string): `#${string}` {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const hex = (hash >>> 0).toString(16);
  const colorHex = hex.slice(-6).padStart(6, '0');
  return `#${colorHex}`;
}

const ITEMS_PER_EMBED = 25;
const hrImage =
  'https://cdn.discordapp.com/attachments/666640006202261525/1471896340429803733/synd_bot_000023424.png?ex=699099ca&is=698f484a&hm=2a903b82bdb5b8573671f7f1404a81146a72224bdc09b19188f1116bfac1d1f1';

export class InventoryService {
  private googleSheets: GoogleSheetsService;
  inventory: InventoryItem[] = [];
  writeEnabled: boolean = true;
  emoji: { [key: string]: any } = {};
  discordClient: Client;
  storageChannel?: TextChannel;
  private inventoryMessages: Map<string, Message> = new Map();

  constructor(client: Client) {
    this.googleSheets = new GoogleSheetsService();
    this.discordClient = client;
  }

  private getMoscowTime(): string {
    const now = new Date();
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(now);
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
      await this.postInventoryMessages();
    } catch (error) {
      console.error('InventoryService.init error:', error);
    }
  }

  async purgeBotMessages(): Promise<void> {
    if (!this.storageChannel) return;
    try {
      const fetched = await this.storageChannel.messages.fetch({ limit: 100 });
      const botId = this.discordClient.user?.id;
      if (!botId) return;
      const botMessages = fetched.filter((m) => m.author?.id === botId);

      for (const m of botMessages.values()) {
        try {
          await m.delete();
        } catch (err) {
          console.warn('Failed to delete message', m.id, err);
        }
      }

      this.inventoryMessages.clear();
    } catch (err) {
      console.warn('Failed to purge bot messages:', err);
    }
  }

  async loadInventory(): Promise<void> {
    this.inventory = await this.googleSheets.getInventory();
    if (this.storageChannel) {
      this.postInventoryMessages();
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
    userName: string
  ): Promise<boolean> {
    const item = this.getItemByName(name);
    if (!this.writeEnabled) return false;
    if (!item) return false;

    const newQuantity = (item.quantity ?? 0) + change;

    if (newQuantity < 0) {
      this.discordClient.channels.fetch(ALERT_CHAT_ID).then((channel) =>
        (channel as unknown as TextChannel)?.send(
          `
            🚨 **ВНИМАНИЕ: ОТРИЦАТЕЛЬНЫЙ ОСТАТОК!**
            📦 **Предмет:** ${this.emoji[item.emoji ?? ''] ?? ''} ${item.name}
            👤 **Пользователь:** ${userName}
            📊 **Изменение:** ${change > 0 ? '+' : ''}${change}
            🧮 **Новый остаток:** ${newQuantity}
            ⏰ **Время:** ${new Date().toLocaleString('ru-RU')}
            <@&1467630587803209901>
          `.trim()
        )
      );
    }

    const success = await this.googleSheets.updateInventory(
      item.name,
      newQuantity
    );

    if (!success) return false;

    const action = change > 0 ? 'положил' : 'взял';
    this.googleSheets.addLogEntry([
      [userName, action, this.getMoscowTime(), item.name, change],
    ]);
    this.googleSheets.addHistoryEntry([
      [item.name, newQuantity, this.getMoscowTime()],
    ]);

    setTimeout(() => {
      this.loadInventory();
    });

    return true;
  }

  async performInventory(user: string) {
    const sheetInventory = await this.googleSheets.getInventory();
    const memoryInventory = [...this.inventory];

    const memoryMap = new Map(memoryInventory.map((item) => [item.name, item]));

    const changes: InventoryItem[] = [];

    for (const sheetItem of sheetInventory) {
      const memoryItem = memoryMap.get(sheetItem.name);
      if (sheetItem.quantity !== memoryItem?.quantity) {
        changes.push(sheetItem);
      }
    }

    const timestamp = this.getMoscowTime();

    if (changes.length > 0) {
      this.googleSheets.addLogEntry(
        changes.map((item) => [
          user,
          'инвентаризация',
          timestamp,
          item.name,
          item.quantity!,
        ])
      );
      this.googleSheets.addHistoryEntry(
        changes.map((item) => [item.name, item.quantity!, timestamp])
      );
    }

    this.inventory = sheetInventory;
  }

  getCurrentInventory(): InventoryItem[] {
    return this.inventory;
  }

  setWriteEnabled(enabled: boolean): void {
    this.writeEnabled = enabled;
  }

  private async postInventoryMessages(): Promise<void> {
    if (!this.storageChannel) return;
    const grouped = this.buildCategoryEmbeds();

    const newKeys: string[] = [];

    for (const { category, embeds } of grouped) {
      const safeCat = encodeURIComponent(category);
      for (let idx = 0; idx < embeds.length; idx++) {
        const embed = embeds[idx]!;
        const key = `${safeCat}::${idx}`;
        newKeys.push(key);

        const existing = this.inventoryMessages.get(key);
        if (existing) {
          const edited = await existing.edit({ embeds: [embed] });
          this.inventoryMessages.set(key, edited);
        } else {
          const sent = await this.storageChannel.send({
            embeds: [embed],
          });
          this.inventoryMessages.set(key, sent);
        }
      }
    }

    for (const [key, msg] of Array.from(this.inventoryMessages.entries())) {
      if (!newKeys.includes(key)) {
        await msg.delete().catch(() => {});
        this.inventoryMessages.delete(key);
      }
    }
  }

  private buildCategoryEmbeds(): {
    category: string;
    embeds: EmbedBuilder[];
  }[] {
    const items = this.inventory.slice().sort((a, b) => {
      const catA = a.category ?? '';
      const catB = b.category ?? '';

      const indexA = storageCategoriesOrder.indexOf(catA);
      const indexB = storageCategoriesOrder.indexOf(catB);

      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }

      if (indexA !== -1) return -1;

      if (indexB !== -1) return 1;

      const categoryComparison = catA.localeCompare(catB, 'ru');
      if (categoryComparison !== 0) return categoryComparison;
      return a.name.localeCompare(b.name, 'ru');
    });

    const map = new Map<string, InventoryItem[]>();
    for (const it of items) {
      const cat = (it.category ?? 'Без категории').trim() || 'Без категории';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(it);
    }

    const result: { category: string; embeds: EmbedBuilder[] }[] = [];

    for (const [category, arr] of map.entries()) {
      const totalPages = Math.max(1, Math.ceil(arr.length / ITEMS_PER_EMBED));
      for (let i = 0; i < arr.length; i += ITEMS_PER_EMBED) {
        const chunk = arr.slice(i, i + ITEMS_PER_EMBED);

        const pageIndex = Math.floor(i / ITEMS_PER_EMBED) + 1;
        const embed = new EmbedBuilder()
          .setTitle(
            `${category}${
              totalPages > 1 ? ` — часть ${pageIndex}/${totalPages}` : ''
            }`
          )
          .setColor(stringToHexColor(category))
          .setTimestamp(new Date())
          .setFooter({
            text: `Предметов в категории: ${arr.length}`,
          });

        for (const it of chunk) {
          const qty =
            typeof it.quantity === 'number' ? String(it.quantity) : '—';
          const emoji = this.emoji[it.emoji ?? ''] ?? '';
          const name = `${emoji ? emoji + ' ' : ''}${it.name}`.slice(0, 256);
          const value = `Количество: **${qty}**`.slice(0, 1024);
          embed.addFields({ name, value, inline: true });
        }

        embed.setImage(hrImage);

        const existing = result.find((r) => r.category === category);
        if (existing) {
          existing.embeds.push(embed);
        } else {
          result.push({ category, embeds: [embed] });
        }
      }
    }
    return result;
  }
}
