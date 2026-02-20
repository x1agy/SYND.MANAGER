import { google } from 'googleapis';
import { storageSheetsPath } from '../constants/storage';
import { GOOGLE_API, GOOGLE_SHEET_ID } from '../constants/envVars';
import { InventoryItem } from '../types/inventory';

export class GoogleSheetsService {
  private sheets;
  private spreadsheetId: string;

  constructor() {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(GOOGLE_API),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
    this.spreadsheetId = GOOGLE_SHEET_ID;
  }

  async getInventory(): Promise<Array<InventoryItem>> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${storageSheetsPath.storage}!A2:D`,
      });

      const rows = response.data.values || [];
      return rows.map((row) => ({
        name: row[0] ?? '',
        quantity: parseInt(row[1]) || 0,
        emoji: row[2] ?? '',
        category: row[3] ?? '',
      }));
    } catch (error) {
      console.error('Ошибка при чтении инвентаря:', error);
      return [];
    }
  }

  async updateInventory(
    itemName: string,
    newQuantity: number
  ): Promise<boolean> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${storageSheetsPath.storage}!A:A`,
      });

      const rows = response.data.values ?? [];
      let rowIndex = -1;

      for (let i = 0; i < rows.length; i++) {
        if (rows[i]?.[0] === itemName) {
          rowIndex = i + 1;
          break;
        }
      }

      if (rowIndex === -1) {
        console.error(`Предмет ${itemName} не найден в инвентаре`);
        return false;
      }

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${storageSheetsPath.storage}!B${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[newQuantity]],
        },
      });

      return true;
    } catch (error) {
      console.error('Ошибка при обновлении инвентаря:', error);
      return false;
    }
  }

  async addLogEntry(
    entries: [
      userName: string,
      action: string,
      timestamp: string,
      itemName: string,
      quantity: number
    ][]
  ): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${storageSheetsPath.usersHistory}!A:E`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [...entries],
        },
      });
    } catch (error) {
      console.error('Ошибка при добавлении записи в журнал:', error);
    }
  }

  async addHistoryEntry(
    entries: [itemName: string, quantity: number, timestamp: string][]
  ): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${storageSheetsPath.itemsHistory}!A:C`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [...entries],
        },
      });
    } catch (error) {
      console.error('Ошибка при добавлении записи в историю:', error);
    }
  }
}