import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { google } from 'googleapis';

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
        'https://www.googleapis.com/auth/drive.readonly',
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

/**
 * Получает правила валидации для колонок с выпадающими списками
 * Возвращает объект: { "Название колонки": ["Значение1", "Значение2", ...], ... }
 */
export async function getColumnValidationRules() {
  try {
    let credentials;

    // Получаем credentials (та же логика, что в getGoogleSheet)
    if (process.env.GOOGLE_CREDENTIALS) {
      try {
        credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
      } catch (e) {
        console.error('Failed to parse GOOGLE_CREDENTIALS:', e);
        throw new Error('Invalid GOOGLE_CREDENTIALS JSON format');
      }
    } else {
      let privateKey = process.env.GOOGLE_PRIVATE_KEY;

      if (!privateKey) {
        throw new Error('GOOGLE_PRIVATE_KEY is missing');
      }

      if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
        privateKey = privateKey.slice(1, -1);
      }

      privateKey = privateKey.replace(/\\n/g, '\n');

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

    // Создаем авторизацию для Google Sheets API v4
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
      ],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Получаем данные ТОЛЬКО для строки 2 (первая строка с данными)
    // Это быстрее, чем запрашивать много строк
    const response = await sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      ranges: ['A2:ZZ2'], // Только строка 2, все колонки
      fields: 'sheets(data(rowData(values(dataValidation))),properties(sheetId,title,gridProperties))',
      includeGridData: true,
    });

    console.log('Google Sheets API response received');

    const sheet = response.data.sheets?.[0]; // Первый лист
    if (!sheet) {
      console.warn('No sheets found in spreadsheet');
      return {};
    }

    console.log('Sheet title:', sheet.properties.title);

    // Получаем заголовки (первая строка)
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${sheet.properties.title}!1:1`,
    });

    const headers = headerResponse.data.values?.[0] || [];
    console.log('Headers:', headers);
    console.log('Headers count:', headers.length);

    // Парсим правила валидации из строки 2
    const validationRules = {};
    const rowData = sheet.data?.[0]?.rowData || [];

    console.log('Total rows in response:', rowData.length);

    // Проверяем строку 2
    if (rowData.length > 0) {
      const row = rowData[0]; // Строка 2
      const values = row.values || [];

      console.log('Cells in row 2:', values.length);

      values.forEach((cell, colIndex) => {
        if (cell.dataValidation) {
          const validation = cell.dataValidation;
          const columnName = headers[colIndex];

          if (!columnName) {
            console.warn(`No header found for column index ${colIndex}`);
            return;
          }

          // Проверяем тип валидации
          if (validation.condition) {
            const condition = validation.condition;

            // ONE_OF_LIST - список значений прямо в правиле
            if (condition.type === 'ONE_OF_LIST' && condition.values) {
              const listValues = condition.values.map(v => v.userEnteredValue).filter(Boolean);
              console.log(`Found ONE_OF_LIST for ${columnName}:`, listValues);
              validationRules[columnName] = listValues;
            }

            // ONE_OF_RANGE - список из диапазона ячеек
            else if (condition.type === 'ONE_OF_RANGE') {
              console.log(`Found ONE_OF_RANGE for ${columnName}, not yet supported`);
            }

            // BOOLEAN - чекбоксы
            else if (condition.type === 'BOOLEAN') {
              console.log(`Found BOOLEAN for ${columnName}`);
              validationRules[columnName] = ['TRUE', 'FALSE'];
            }

            // Другие типы
            else {
              console.log(`Unknown validation type for ${columnName}:`, condition.type);
            }
          }
        }
      });
    } else {
      console.warn('No row data found in response');
    }

    console.log('Final parsed validation rules:', validationRules);
    console.log('Validation rules count:', Object.keys(validationRules).length);

    return validationRules;

  } catch (error) {
    console.error('Error getting column validation rules:', error);
    throw error;
  }
}