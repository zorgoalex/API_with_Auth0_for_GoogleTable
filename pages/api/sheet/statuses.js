import { requireAuth } from '../../../lib/auth';
import { getColumnValidationRules } from '../../../lib/google-sheets';

// Fallback статусы на случай, если не удалось получить из Google Sheets
const FALLBACK_STATUSES = {
  'Фрезеровка': ['Модерн', 'Фрезеровка', 'Черновой', 'Выборка', 'Краска'],
  'Оплата': ['не оплачен', 'в долг', 'частично', 'оплачен', 'за счет фирмы'],
  'Статус': ['Готов', 'Выдан', 'Распилен', '-'],
  'CAD файлы': ['Отрисован', '-'],
  'Материал': ['16мм', '18мм', '8мм', '10мм', 'ЛДСП'],
  'Закуп пленки': ['Готов', '-'],
  'Распил': ['Готов', '-'],
  'Шлифовка': ['Готов', '-'],
  'Пленка': ['Готов', '-'],
  'Упаковка': ['Готов', '-'],
  'Выдан': ['Готов', '-'],
};

export default async function handler(req, res) {
  // Проверяем авторизацию
  const user = await requireAuth(req, res);
  if (!user) return;

  const { method } = req;

  try {
    if (method === 'GET') {
      let validationRules = await getColumnValidationRules();

      // Если правила не найдены или пустой объект, используем fallback
      if (!validationRules || Object.keys(validationRules).length === 0) {
        console.warn('No validation rules found in Google Sheets, using fallback statuses');
        validationRules = FALLBACK_STATUSES;
      }

      console.log('Returning statuses:', validationRules);
      res.status(200).json(validationRules);
    } else {
      res.setHeader('Allow', ['GET']);
      res.status(405).end(`Method ${method} Not Allowed`);
    }
  } catch (error) {
    console.error('API Error (statuses):', error);
    console.warn('Error fetching validation rules, using fallback statuses');
    // При ошибке возвращаем fallback
    res.status(200).json(FALLBACK_STATUSES);
  }
}
