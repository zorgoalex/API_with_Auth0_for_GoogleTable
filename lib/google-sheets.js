import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

export async function getGoogleSheet() {
  try {
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
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
    const sheet = await getGoogleSheet();
    const rows = await sheet.getRows();
    const row = rows.find(r => (r.rowNumber || rows.indexOf(r) + 2) === rowId);
    
    if (!row) {
      throw new Error('Row not found');
    }
    
    Object.keys(data).forEach(key => {
      if (key !== '_id' && key !== 'rowId') {
        row.set(key, data[key]);
      }
    });
    
    await row.save();
    
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