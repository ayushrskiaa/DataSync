import { google, sheets_v4 } from 'googleapis';
import { logger } from '../utils/logger';
import { SheetData } from '../types';

export class GoogleSheetsService {
  private sheets: sheets_v4.Sheets;
  private auth: any;

  private static normalizeSheetName(name: string): string {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private static quoteSheetName(sheetName: string): string {
    const normalized = sheetName.trim().replace(/\s+/g, ' ');
    const escapedName = normalized.replace(/'/g, "''");
    return `'${escapedName}'`;
  }

  static buildRange(sheetName: string, cellRange: string = 'A:ZZ'): string {
    const trimmedRange = cellRange?.trim() || 'A:ZZ';
    return `${GoogleSheetsService.quoteSheetName(sheetName)}!${trimmedRange}`;
  }

  constructor() {
    this.auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    logger.info('Google OAuth client configured', {
      hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
      hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
      redirectUri: process.env.GOOGLE_REDIRECT_URI
    });

    // Set credentials if refresh token is available
    if (process.env.GOOGLE_REFRESH_TOKEN) {
      this.auth.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      });
    }

    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  }

  // Get OAuth URL for authorization
  getAuthUrl(): string {
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!redirectUri) {
      throw new Error('GOOGLE_REDIRECT_URI is not configured');
    }

    return this.auth.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.readonly'
      ],
      prompt: 'consent',
      redirect_uri: redirectUri
    });
  }

  // Exchange code for tokens
  async getTokensFromCode(code: string): Promise<any> {
    const { tokens } = await this.auth.getToken(code);
    this.auth.setCredentials(tokens);
    return tokens;
  }

  // Set credentials
  setCredentials(tokens: any): void {
    this.auth.setCredentials(tokens);
  }

  // Get spreadsheet metadata
  async getSpreadsheetInfo(spreadsheetId: string): Promise<any> {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'properties,sheets.properties'
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to get spreadsheet info for ${spreadsheetId}`, error);
      throw error;
    }
  }

  async listSheetTitles(spreadsheetId: string): Promise<string[]> {
    const info = await this.getSpreadsheetInfo(spreadsheetId);
    return (info.sheets || [])
      .map((sheet: any) => sheet.properties?.title)
      .filter((title: string | undefined): title is string => Boolean(title));
  }

  async verifySheetExists(spreadsheetId: string, sheetName: string): Promise<string> {
    const target = GoogleSheetsService.normalizeSheetName(sheetName || 'Sheet1');
    const titles = await this.listSheetTitles(spreadsheetId);
    const matched = titles.find(title => GoogleSheetsService.normalizeSheetName(title) === target);

    if (!matched) {
      const hint = titles.length > 0 ? titles.join(', ') : 'No sheets found';
      throw new Error(`Sheet "${sheetName}" not found in spreadsheet. Available sheets: ${hint}`);
    }

    return matched;
  }

  // Read data from a sheet
  async readSheet(spreadsheetId: string, range: string): Promise<SheetData> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING'
      });

      const values = response.data.values || [];
      const headers = values.length > 0 ? values[0] : [];
      const rows = values.slice(1);

      return {
        values: rows,
        headers: headers as string[]
      };
    } catch (error) {
      logger.error(`Failed to read sheet ${spreadsheetId}:${range}`, error);
      throw error;
    }
  }

  // Write data to a sheet
  async writeSheet(
    spreadsheetId: string,
    range: string,
    values: any[][],
    append: boolean = false
  ): Promise<void> {
    try {
      if (append) {
        await this.sheets.spreadsheets.values.append({
          spreadsheetId,
          range,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: {
            values
          }
        });
      } else {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId,
          range,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values
          }
        });
      }
    } catch (error) {
      logger.error(`Failed to write to sheet ${spreadsheetId}:${range}`, error);
      throw error;
    }
  }

  // Update specific cells
  async updateCells(
    spreadsheetId: string,
    updates: Array<{ range: string; values: any[][] }>
  ): Promise<void> {
    try {
      const data = updates.map(update => ({
        range: update.range,
        values: update.values
      }));

      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data
        }
      });
    } catch (error) {
      logger.error(`Failed to batch update cells in ${spreadsheetId}`, error);
      throw error;
    }
  }

  // Delete rows
  async deleteRows(spreadsheetId: string, sheetId: number, startIndex: number, endIndex: number): Promise<void> {
    try {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex,
                endIndex
              }
            }
          }]
        }
      });
    } catch (error) {
      logger.error(`Failed to delete rows in ${spreadsheetId}`, error);
      throw error;
    }
  }

  // Append rows
  async appendRows(spreadsheetId: string, sheetName: string, values: any[][]): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: GoogleSheetsService.buildRange(sheetName, 'A:A'),
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values
        }
      });
    } catch (error) {
      logger.error(`Failed to append rows to ${spreadsheetId}:${sheetName}`, error);
      throw error;
    }
  }

  // Clear range
  async clearRange(spreadsheetId: string, range: string): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range
      });
    } catch (error) {
      logger.error(`Failed to clear range ${spreadsheetId}:${range}`, error);
      throw error;
    }
  }

  // Get sheet ID by name
  async getSheetIdByName(spreadsheetId: string, sheetName: string): Promise<number> {
    try {
      const info = await this.getSpreadsheetInfo(spreadsheetId);
      const sheet = info.sheets?.find((s: any) => s.properties?.title === sheetName);
      if (!sheet) {
        throw new Error(`Sheet ${sheetName} not found in spreadsheet ${spreadsheetId}`);
      }
      return sheet.properties.sheetId;
    } catch (error) {
      logger.error(`Failed to get sheet ID for ${sheetName}`, error);
      throw error;
    }
  }

  // Format data for Google Sheets
  formatDataForSheets(rows: any[], columns: string[]): any[][] {
    return rows.map(row => 
      columns.map(col => {
        const value = row[col];
        if (value === null || value === undefined) return '';
        if (value instanceof Date) return value.toISOString();
        if (typeof value === 'object') return JSON.stringify(value);
        return value;
      })
    );
  }

  // Parse data from Google Sheets
  parseDataFromSheets(values: any[][], headers: string[]): any[] {
    return values.map(row => {
      const obj: any = {};
      headers.forEach((header, index) => {
        const value = row[index];
        obj[header] = value === '' ? null : value;
      });
      return obj;
    });
  }
}
