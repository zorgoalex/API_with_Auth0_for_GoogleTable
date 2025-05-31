import { GoogleSpreadsheet } from 'google-spreadsheet';

export async function getGoogleSheet() {
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID);
  
  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  });
  
  await doc.loadInfo();
  
  return doc.sheetsByIndex[0]; // Первый лист
}

export async function getAllRows() {
  try {
    const sheet = await getGoogleSheet();
    const rows = await sheet.getRows();
    
    return rows.map(row => {
      const rowData = {};
      sheet.headerValues.forEach(header => {
        rowData[header] = row.get(header) || '';
      });
      rowData._id = row.rowNumber;
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
    const row = rows.find(r => r.rowNumber === rowId);
    
    if (!row) {
      throw new Error('Row not found');
    }
    
    Object.keys(data).forEach(key => {
      if (key !== '_id') {
        row.set(key, data[key]);
      }
    });
    
    await row.save();
    
    const rowData = {};
    sheet.headerValues.forEach(header => {
      rowData[header] = row.get(header) || '';
    });
    rowData._id = row.rowNumber;
    
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
    const row = rows.find(r => r.rowNumber === rowId);
    
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