import { google } from 'googleapis';
import { verifyAuth } from '../../lib/auth';

export default async function handler(req, res) {
  console.log('=== SETUP PUSH DEBUG START ===');
  
  if (req.method !== 'POST') {
    console.log('Method not POST:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('1. Starting setup push notifications...');
    
    // Временно пропускаем auth для диагностики
    console.log('2. Skipping auth for debug...');
    /*
    const user = await verifyAuth(req);
    if (!user) {
      console.error('Authentication failed');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.log('User authenticated:', user);
    */

    // Проверяем переменные окружения
    console.log('3. Checking environment variables...');
    console.log('GOOGLE_CREDENTIALS exists:', !!process.env.GOOGLE_CREDENTIALS);
    console.log('GOOGLE_SHEET_ID:', process.env.GOOGLE_SHEET_ID);
    console.log('AUTH0_BASE_URL:', process.env.AUTH0_BASE_URL);
    
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

    console.log('4. Environment variables OK');

    // Парсим credentials
    console.log('5. Parsing GOOGLE_CREDENTIALS...');
    let credentials;
    try {
      credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
      console.log('Credentials parsed, type:', credentials.type);
      console.log('Project ID:', credentials.project_id);
    } catch (parseError) {
      console.error('Failed to parse GOOGLE_CREDENTIALS:', parseError.message);
      return res.status(500).json({ 
        error: 'Invalid GOOGLE_CREDENTIALS JSON',
        details: parseError.message
      });
    }

    console.log('6. Creating Google Auth...');
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file'
      ]
    });

    console.log('7. Creating Drive client...');
    const drive = google.drive({ version: 'v3', auth });
    
    console.log('8. Testing Drive API access...');
    try {
      const fileInfo = await drive.files.get({
        fileId: process.env.GOOGLE_SHEET_ID,
        fields: 'id,name,mimeType,capabilities'
      });
      console.log('File access OK:', {
        id: fileInfo.data.id,
        name: fileInfo.data.name,
        mimeType: fileInfo.data.mimeType
      });
    } catch (fileError) {
      console.error('File access failed:', {
        message: fileError.message,
        code: fileError.code,
        status: fileError.status
      });
      return res.status(500).json({ 
        error: 'Cannot access Google Sheet',
        details: fileError.message,
        code: fileError.code
      });
    }

    console.log('9. Everything OK - would setup webhook here');
    
    // Временно возвращаем успех без настройки webhook
    return res.status(200).json({
      success: true,
      debug: 'All checks passed',
      fileId: process.env.GOOGLE_SHEET_ID,
      message: 'Debug mode - webhook not actually set up'
    });

  } catch (error) {
    console.error('=== SETUP PUSH ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error code:', error.code);
    console.error('Error response:', error.response?.data);
    
    res.status(500).json({ 
      error: error.message,
      stack: error.stack,
      code: error.code,
      details: error.response?.data
    });
  } finally {
    console.log('=== SETUP PUSH DEBUG END ===');
  }
} 