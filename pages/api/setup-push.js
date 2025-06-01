import { google } from 'googleapis';
import { verifyAuth } from '../../lib/auth';

export default async function handler(req, res) {
  console.log('=== SETUP PUSH START ===');
  
  if (req.method !== 'POST') {
    console.log('Method not POST:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('1. Starting push notification setup...');
    
    // Проверяем авторизацию
    console.log('2. Checking authorization...');
    const user = await verifyAuth(req);
    if (!user) {
      console.error('Authentication failed');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.log('User authenticated:', user?.email || user?.sub);

    // Проверяем переменные окружения
    console.log('3. Checking environment variables...');
    if (!process.env.GOOGLE_CREDENTIALS) {
      console.error('GOOGLE_CREDENTIALS missing');
      return res.status(500).json({ error: 'GOOGLE_CREDENTIALS not configured' });
    }
    
    if (!process.env.GOOGLE_SHEET_ID) {
      console.error('GOOGLE_SHEET_ID missing');
      return res.status(500).json({ error: 'GOOGLE_SHEET_ID not configured' });
    }
    
    if (!process.env.AUTH0_BASE_URL) {
      console.error('AUTH0_BASE_URL missing');
      return res.status(500).json({ error: 'AUTH0_BASE_URL not configured' });
    }
    console.log('Environment variables OK');

    // Парсим credentials
    console.log('4. Parsing credentials...');
    let credentials;
    try {
      credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
      console.log('Credentials parsed, project:', credentials.project_id);
    } catch (parseError) {
      console.error('Failed to parse GOOGLE_CREDENTIALS:', parseError.message);
      return res.status(500).json({ 
        error: 'Invalid GOOGLE_CREDENTIALS JSON',
        details: parseError.message
      });
    }

    console.log('5. Creating Google Auth...');
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file'
      ]
    });

    console.log('6. Creating Drive client...');
    const drive = google.drive({ version: 'v3', auth });
    
    console.log('7. Testing file access...');
    try {
      const fileInfo = await drive.files.get({
        fileId: process.env.GOOGLE_SHEET_ID,
        fields: 'id,name,mimeType'
      });
      console.log('File accessible:', fileInfo.data.name);
    } catch (fileError) {
      console.error('File access failed:', fileError.message);
      return res.status(500).json({ 
        error: 'Cannot access Google Sheet',
        details: fileError.message
      });
    }

    console.log('8. Setting up webhook...');
    const webhookUrl = `${process.env.AUTH0_BASE_URL}/api/webhook/drive-changes`;
    console.log('Webhook URL:', webhookUrl);
    
    const watchResponse = await drive.files.watch({
      fileId: process.env.GOOGLE_SHEET_ID,
      requestBody: {
        id: `sheet-watch-${Date.now()}`,
        type: 'web_hook',
        address: webhookUrl,
        payload: true,
        token: 'sheet-change-token'
      }
    });

    console.log('Push notification setup successful!');
    console.log('Channel info:', {
      id: watchResponse.data.id,
      resourceId: watchResponse.data.resourceId,
      expiration: watchResponse.data.expiration
    });

    return res.status(200).json({
      success: true,
      channel: watchResponse.data,
      webhookUrl,
      fileId: process.env.GOOGLE_SHEET_ID
    });

  } catch (error) {
    console.error('=== SETUP PUSH ERROR ===');
    console.error('Error:', error.message);
    if (error.response?.data) {
      console.error('Google API Error:', error.response.data);
    }
    
    res.status(500).json({ 
      error: error.message,
      details: error.response?.data
    });
  } finally {
    console.log('=== SETUP PUSH END ===');
  }
} 