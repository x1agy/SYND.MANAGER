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
    return this.inventory.find(item => item.name.toLowerCase() === name.toLowerCase());
  }

  async updateItem(name: string, change: number, userName: string): Promise<boolean> {
    if (!this.writeEnabled) {
      return false;
    }

    const item = this.getItemByName(name);
    if (!item) {
      return false;
    }

    const newQuantity = (item.quantity ?? 0) + change;

    const success = await this.googleSheets.updateInventory(item.name, newQuantity);
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