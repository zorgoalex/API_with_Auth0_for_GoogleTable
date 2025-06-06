import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

export async function getGoogleSheet() {
  try {
    let credentials;
    
    // Пробуем использовать GOOGLE_CREDENTIALS JSON
    if (process.env.GOOGLE_CREDENTIALS) {
      try {
        credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
      } catch (e) {
        console.error('Failed to parse GOOGLE_CREDENTIALS:', e);
        throw new Error('Invalid GOOGLE_CREDENTIALS JSON format');
      }
    } else {
      // Fallback на отдельные переменные
      let privateKey = process.env.GOOGLE_PRIVATE_KEY;
      
      if (!privateKey) {
        throw new Error('GOOGLE_PRIVATE_KEY is missing');
      }
      
      // Более надежная обработка приватного ключа для Vercel
      if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
        privateKey = privateKey.slice(1, -1);
      }
      
      // Заменяем \\n на реальные переносы строк
      privateKey = privateKey.replace(/\\n/g, '\n');
      
      // Проверяем что ключ начинается и заканчивается правильно
      if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        throw new Error('Invalid private key format - missing header');
      }
      
      if (!privateKey.includes('-----END PRIVATE KEY-----')) {
        throw new Error('Invalid private key format - missing footer');
      }

      credentials = {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: privateKey
      };
    }

    const serviceAccountAuth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    
    return doc.sheetsByIndex[0]; // Первый лист
  } catch (error) {
    console.error('Error initializing Google Sheet:', error);
    throw error;
  }
}

export async function getAllRows() {
  try {
    const sheet = await getGoogleSheet();
    const rows = await sheet.getRows();
    
    if (!sheet.headerValues || sheet.headerValues.length === 0) {
      return [];
    }
    
    return rows.map((row, index) => {
      const rowData = {};
      sheet.headerValues.forEach(header => {
        rowData[header] = row.get(header) || '';
      });
      rowData._id = row.rowNumber || index + 2; // +2 because header is row 1
      return rowData;
    });
  } catch (error) {
    console.error('Error getting rows:', error);
    throw error;
  }
}

export async function addRow(data) {
  try {
    const sheet = await getGoogleSheet();
    const newRow = await sheet.addRow(data);
    
    const rowData = {};
    sheet.headerValues.forEach(header => {
      rowData[header] = newRow.get(header) || '';
    });
    rowData._id = newRow.rowNumber;
    
    return rowData;
  } catch (error) {
    console.error('Error adding row:', error);
    throw error;
  }
}

export async function updateRow(rowId, data) {
  try {
    console.log('updateRow called with:', { rowId, data });
    
    const sheet = await getGoogleSheet();
    const rows = await sheet.getRows();
    
    console.log('Total rows in sheet:', rows.length);
    console.log('Looking for rowId:', rowId);
    console.log('Available row numbers:', rows.map(r => r.rowNumber || rows.indexOf(r) + 2).slice(0, 10));
    
    const row = rows.find(r => (r.rowNumber || rows.indexOf(r) + 2) === rowId);
    
    if (!row) {
      console.error('Row not found. Available rows:', rows.map((r, idx) => ({
        index: idx,
        rowNumber: r.rowNumber,
        calculatedId: r.rowNumber || idx + 2,
        firstCellValue: r.get(sheet.headerValues[0])
      })).slice(0, 10));
      throw new Error('Row not found');
    }
    
    console.log('Found row:', {
      rowNumber: row.rowNumber,
      currentData: Object.fromEntries(sheet.headerValues.map(h => [h, row.get(h)]))
    });
    
    Object.keys(data).forEach(key => {
      if (key !== '_id' && key !== 'rowId') {
        console.log(`Updating ${key}: ${row.get(key)} -> ${data[key]}`);
        row.set(key, data[key]);
      }
    });
    
    await row.save();
    console.log('Row saved successfully');
    
    const rowData = {};
    sheet.headerValues.forEach(header => {
      rowData[header] = row.get(header) || '';
    });
    rowData._id = row.rowNumber || rowId;
    
    return rowData;
  } catch (error) {
    console.error('Error updating row:', error);
    throw error;
  }
}

export async function deleteRow(rowId) {
  try {
    const sheet = await getGoogleSheet();
    const rows = await sheet.getRows();
    const row = rows.find(r => (r.rowNumber || rows.indexOf(r) + 2) === rowId);
    
    if (!row) {
      throw new Error('Row not found');
    }
    
    await row.delete();
    return { success: true };
  } catch (error) {
    console.error('Error deleting row:', error);
    throw error;
  }
} 