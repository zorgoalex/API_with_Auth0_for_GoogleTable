import { google } from 'googleapis';
import { verifyAuth } from '../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Проверяем авторизацию
    const user = await verifyAuth(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Инициализируем Google Drive API
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ]
    });

    const drive = google.drive({ version: 'v3', auth });
    
    // URL для webhook'а
    const webhookUrl = `${process.env.AUTH0_BASE_URL}/api/webhook/drive-changes`;
    
    // Настраиваем push notification для файла
    const watchResponse = await drive.files.watch({
      fileId: process.env.GOOGLE_SHEET_ID,
      requestBody: {
        id: `sheet-watch-${Date.now()}`, // Уникальный ID канала
        type: 'web_hook',
        address: webhookUrl,
        payload: true
      }
    });

    console.log('Push notification setup:', watchResponse.data);

    res.status(200).json({
      success: true,
      channel: watchResponse.data,
      webhookUrl
    });

  } catch (error) {
    console.error('Error setting up push notifications:', error);
    res.status(500).json({ 
      error: error.message,
      details: error.response?.data 
    });
  }
} 