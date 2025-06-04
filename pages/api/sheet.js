import { requireAuth } from '../../lib/auth';
import { getAllRows, addRow, updateRow, deleteRow } from '../../lib/google-sheets';

export default async function handler(req, res) {
  // Проверяем авторизацию
  const user = await requireAuth(req, res);
  if (!user) return;

  const { method, body, query } = req;

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
        const { rowId } = query;
        if (!rowId) {
          return res.status(400).json({ error: 'rowId is required in query parameters' });
        }
        const updatedRow = await updateRow(parseInt(rowId), body);
        res.status(200).json(updatedRow);
        break;

      case 'DELETE':
        const { rowId: deleteRowId } = query;
        await deleteRow(parseInt(deleteRowId));
        res.status(200).json({ success: true });
        break;

      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        res.status(405).end(`Method ${method} Not Allowed`);
        break;
    }
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
} 