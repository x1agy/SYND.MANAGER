import { Client, TextChannel } from 'discord.js';
import { GoogleSheetsService } from './googleSheets';

export interface InventoryItem {
  name: string;
  quantity?: number;
  emoji?: string;
}

export class InventoryService {
  private googleSheets: GoogleSheetsService;
  inventory: InventoryItem[] = [];
  writeEnabled: boolean = true;

  constructor() {
    this.googleSheets = new GoogleSheetsService();
    this.loadInventory();
  }

  async loadInventory(): Promise<void> {
    this.inventory = await this.googleSheets.getInventory();
    console.log(`📦 Загружено ${this.inventory.length} предметов из инвентаря`);
  }

  getItemByName(name: string): InventoryItem | undefined {
    return this.inventory.find(
      (item) => item.name.toLowerCase() === name.toLowerCase()
    );
  }

  async updateItem(
    name: string,
    change: number,
    userName: string,
    discordClient: Client
  ): Promise<boolean> {
    if (!this.writeEnabled) {
      return false;
    }

    const item = this.getItemByName(name);
    if (!item) {
      return false;
    }

    const newQuantity = (item.quantity ?? 0) + change;

    if (newQuantity < 0) {
      try {
        const channel = (await discordClient.channels.fetch(
          '1468224396375363696'
        )) as TextChannel;

        const message = `
          🚨 **ВНИМАНИЕ: ОТРИЦАТЕЛЬНЫЙ ОСТАТОК!**
          📦 **Предмет:** ${item.emoji || ''} ${item.name}
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
    if (!success) {
      return false;
    }

    const action = change > 0 ? 'положил' : 'взял';
    await this.googleSheets.addLogEntry(userName, action, item.name, change);
    await this.googleSheets.addHistoryEntry(item.name, newQuantity);

    await this.loadInventory();

    return true;
  }

  getCurrentInventory(): InventoryItem[] {
    return this.inventory;
  }

  setWriteEnabled(enabled: boolean): void {
    this.writeEnabled = enabled;
  }
}
