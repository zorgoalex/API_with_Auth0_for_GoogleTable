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
        type: 'service_account',
        project_id: process.env.GOOGLE_PROJECT_ID,
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
        private_key: privateKey,
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL
      };
    }

    const serviceAccountAuth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
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
    const sheet = await getGoogleSheet();
    const rows = await sheet.getRows();
    const row = rows.find(r => (r.rowNumber || rows.indexOf(r) + 2) === rowId);
    
    if (!row) {
      throw new Error('Row not found');
    }

    // Обновляем только переданные поля (частичное обновление)
    Object.keys(data).forEach(key => {
      if (key !== '_id' && sheet.headerValues.includes(key)) {
        row.set(key, data[key]);
      }
    });

    await row.save();
    
    // Возвращаем обновленную строку
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
    return true;
  } catch (error) {
    console.error('Error deleting row:', error);
    throw error;
  }
}

// Новая функция для batch обновлений (опционально для будущего)
export async function batchUpdateRows(updates) {
  try {
    const sheet = await getGoogleSheet();
    const rows = await sheet.getRows();
    
    const results = [];
    
    for (const { rowId, data } of updates) {
      const row = rows.find(r => (r.rowNumber || rows.indexOf(r) + 2) === rowId);
      if (!row) continue;
      
      Object.keys(data).forEach(key => {
        if (key !== '_id' && sheet.headerValues.includes(key)) {
          row.set(key, data[key]);
        }
      });
      
      await row.save();
      
      const rowData = {};
      sheet.headerValues.forEach(header => {
        rowData[header] = row.get(header) || '';
      });
      rowData._id = row.rowNumber || rowId;
      
      results.push(rowData);
    }
    
    return results;
  } catch (error) {
    console.error('Error in batch update:', error);
    throw error;
  }
}