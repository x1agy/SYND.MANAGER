import { google } from 'googleapis';
import { storageSheetsPath } from '../constants/storage';
import { GOOGLE_API, GOOGLE_SHEET_ID } from '../constants/envVars';

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

  async getInventory(): Promise<
    Array<{ name: string; quantity: number; emoji: string }>
  > {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${storageSheetsPath.storage}!A2:C`,
      });

      const rows = response.data.values || [];
      return rows.map((row) => ({
        name: row[0] || '',
        quantity: parseInt(row[1]) || 0,
        emoji: row[2] || '',
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
    userName: string,
    action: string,
    itemName: string,
    quantity: number,
    note: string = ''
  ): Promise<void> {
    try {
      const timestamp = new Date().toLocaleString('ru-RU');

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${storageSheetsPath.usersHistory}!A:E`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[userName, action, timestamp, itemName, quantity, note]],
        },
      });
    } catch (error) {
      console.error('Ошибка при добавлении записи в журнал:', error);
    }
  }

  async addHistoryEntry(itemName: string, quantity: number): Promise<void> {
    try {
      const timestamp = new Date().toLocaleString('ru-RU');

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${storageSheetsPath.itemsHistory}!A:C`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[itemName, quantity, timestamp]],
        },
      });
    } catch (error) {
      console.error('Ошибка при добавлении записи в историю:', error);
    }
  }
}