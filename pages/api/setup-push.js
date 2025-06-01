import { google } from 'googleapis';
import { verifyAuth } from '../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Setup push notifications request started');
    
    // Проверяем авторизацию
    const user = await verifyAuth(req);
    if (!user) {
      console.error('Authentication failed');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log('User authenticated:', user);

    // Проверяем наличие необходимых переменных окружения
    if (!process.env.GOOGLE_CREDENTIALS) {
      console.error('GOOGLE_CREDENTIALS not found in environment');
      return res.status(500).json({ error: 'GOOGLE_CREDENTIALS not configured' });
    }
    
    if (!process.env.GOOGLE_SHEET_ID) {
      console.error('GOOGLE_SHEET_ID not found in environment');
      return res.status(500).json({ error: 'GOOGLE_SHEET_ID not configured' });
    }
    
    if (!process.env.AUTH0_BASE_URL) {
      console.error('AUTH0_BASE_URL not found in environment');
      return res.status(500).json({ error: 'AUTH0_BASE_URL not configured' });
    }

    // Инициализируем Google Drive API
    console.log('Initializing Google Auth...');
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file'
      ]
    });

    console.log('Creating Drive API client...');
    const drive = google.drive({ version: 'v3', auth });
    
    // URL для webhook'а
    const webhookUrl = `${process.env.AUTH0_BASE_URL}/api/webhook/drive-changes`;
    console.log('Webhook URL:', webhookUrl);
    
    // Сначала проверим доступ к файлу
    console.log('Checking file access...');
    try {
      const fileInfo = await drive.files.get({
        fileId: process.env.GOOGLE_SHEET_ID,
        fields: 'id,name,mimeType'
      });
      console.log('File accessible:', fileInfo.data);
    } catch (fileError) {
      console.error('Cannot access file:', fileError.message);
      return res.status(500).json({ 
        error: 'Cannot access Google Sheet file',
        details: fileError.message
      });
    }

    // Настраиваем push notification для файла
    console.log('Setting up watch request...');
    const watchResponse = await drive.files.watch({
      fileId: process.env.GOOGLE_SHEET_ID,
      requestBody: {
        id: `sheet-watch-${Date.now()}`, // Уникальный ID канала
        type: 'web_hook',
        address: webhookUrl,
        payload: true,
        token: 'sheet-change-token' // Токен для проверки безопасности
      }
    });

    console.log('Push notification setup successful:', watchResponse.data);

    res.status(200).json({
      success: true,
      channel: watchResponse.data,
      webhookUrl,
      fileId: process.env.GOOGLE_SHEET_ID
    });

  } catch (error) {
    console.error('Error setting up push notifications:', error);
    console.error('Error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      statusText: error.response?.statusText
    });
    
    res.status(500).json({ 
      error: error.message,
      details: error.response?.data,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
} 