import { verifyAuth } from '../../../lib/auth';
import jwt from 'jsonwebtoken';

// Store active connections for real-time updates
const clients = new Set();

export default async function handler(req, res) {
  if (req.method === 'POST') {
    // Google Drive Push Notification
    try {
      const channelId = req.headers['x-goog-channel-id'];
      const resourceId = req.headers['x-goog-resource-id'];
      const resourceState = req.headers['x-goog-resource-state'];
      const channelToken = req.headers['x-goog-channel-token'];
      
      console.log('Drive webhook received:', {
        channelId,
        resourceId,
        resourceState,
        channelToken,
        headers: req.headers,
        body: req.body
      });
      
      // Проверяем токен безопасности
      if (channelToken !== 'sheet-change-token') {
        console.warn('Invalid channel token received:', channelToken);
        return res.status(401).json({ error: 'Invalid token' });
      }
      
      // Проверяем что это изменение нашего файла
      if (resourceState === 'update' && resourceId) {
        console.log('Valid sheet change detected, broadcasting to clients...');
        
        // Уведомляем всех подключенных клиентов
        broadcastUpdate({
          type: 'sheet-changed',
          timestamp: new Date().toISOString(),
          resourceId,
          channelId
        });
      } else {
        console.log('Ignoring webhook - not an update or no resourceId');
      }
      
      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'GET') {
    // SSE endpoint для фронтенда
    try {
      // Проверяем авторизацию через query параметр
      const token = req.query.token;
      if (!token) {
        return res.status(401).json({ error: 'Token required' });
      }
      
      try {
        // Декодируем токен (упрощенная проверка)
        jwt.decode(token);
      } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });
      
      // Добавляем клиента в список
      const clientId = Date.now() + Math.random();
      const client = {
        id: clientId,
        res,
        lastPing: Date.now()
      };
      
      clients.add(client);
      
      // Отправляем initial message
      res.write(`data: ${JSON.stringify({ 
        type: 'connected', 
        clientId,
        timestamp: new Date().toISOString() 
      })}\n\n`);
      
      // Ping каждые 30 секунд
      const pingInterval = setInterval(() => {
        if (res.writableEnded) {
          clearInterval(pingInterval);
          clients.delete(client);
          return;
        }
        
        res.write(`data: ${JSON.stringify({ 
          type: 'ping', 
          timestamp: new Date().toISOString() 
        })}\n\n`);
      }, 30000);
      
      // Обработка отключения
      req.on('close', () => {
        clearInterval(pingInterval);
        clients.delete(client);
        console.log(`Client ${clientId} disconnected`);
      });
      
    } catch (error) {
      console.error('SSE error:', error);
      res.status(500).json({ error: error.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

// Отправка обновлений всем клиентам
function broadcastUpdate(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  
  clients.forEach(client => {
    if (!client.res.writableEnded) {
      try {
        client.res.write(message);
      } catch (error) {
        console.error('Error sending to client:', error);
        clients.delete(client);
      }
    } else {
      clients.delete(client);
    }
  });
  
  console.log(`Broadcasted update to ${clients.size} clients:`, data);
} 