import { requireAuth } from '../../lib/auth';
import { getAllRows, addRow, updateRow, deleteRow } from '../../lib/google-sheets';

export default async function handler(req, res) {
  // Проверяем авторизацию
  const user = await requireAuth(req, res);
  if (!user) return; // requireAuth уже отправил ответ

  const { method, query, body } = req;
  const { rowId } = query;

  try {
    switch (method) {
      case 'GET':
        const rows = await getAllRows();
        res.status(200).json(rows);
        break;

      case 'POST':
        const newRow = await addRow(body);
        res.status(201).json(newRow);
        break;

      case 'PUT':
        if (!rowId) {
          return res.status(400).json({ error: 'rowId is required' });
        }
        
        // Поддержка частичного обновления
        const updatedRow = await updateRow(parseInt(rowId), body);
        res.status(200).json(updatedRow);
        break;

      case 'DELETE':
        if (!rowId) {
          return res.status(400).json({ error: 'rowId is required' });
        }
        
        await deleteRow(parseInt(rowId));
        res.status(200).json({ success: true });
        break;

      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        res.status(405).end(`Method ${method} Not Allowed`);
    }
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
}