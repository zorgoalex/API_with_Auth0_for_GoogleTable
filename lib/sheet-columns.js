// Конфигурация колонок Google Sheets
// Индексы колонок в массиве данных (0-based)

export const COLUMN_INDICES = {
  ORDER_DATE: 0,        // Дата заказа
  ORDER_NUMBER: 1,      // Номер заказа
  CUSTOMER_NAME: 2,     // Имя клиента
  AREA: 3,              // Площадь
  MILLING_TYPE: 4,      // Тип фрезеровки
  STATUS: 5,            // Статус
  PLANNED_DATE: 6,      // Планируемая дата
  NOTES: 7,             // Примечания
  CAD_FILES: 8,         // CAD файлы
  PAYMENT: 9,           // Оплата
  DELIVERY_DATE: 10     // Дата выдачи
};

// Названия колонок для отображения
export const COLUMN_NAMES = {
  [COLUMN_INDICES.ORDER_DATE]: 'Дата заказа',
  [COLUMN_INDICES.ORDER_NUMBER]: 'Номер заказа',
  [COLUMN_INDICES.CUSTOMER_NAME]: 'Клиент',
  [COLUMN_INDICES.AREA]: 'Площадь',
  [COLUMN_INDICES.MILLING_TYPE]: 'Тип фрезеровки',
  [COLUMN_INDICES.STATUS]: 'Статус',
  [COLUMN_INDICES.PLANNED_DATE]: 'Планируемая дата',
  [COLUMN_INDICES.NOTES]: 'Примечания',
  [COLUMN_INDICES.CAD_FILES]: 'CAD файлы',
  [COLUMN_INDICES.PAYMENT]: 'Оплата',
  [COLUMN_INDICES.DELIVERY_DATE]: 'Дата выдачи'
};

// Функция для получения значения по индексу колонки
export function getColumnValue(row, columnIndex) {
  return row[columnIndex] || '';
}

// Функция для создания объекта заказа из строки данных
export function createOrderObject(row, rowIndex) {
  return {
    _id: rowIndex + 2, // +2 т.к. индексация с 0 и есть заголовок
    orderDate: getColumnValue(row, COLUMN_INDICES.ORDER_DATE),
    orderNumber: getColumnValue(row, COLUMN_INDICES.ORDER_NUMBER),
    customerName: getColumnValue(row, COLUMN_INDICES.CUSTOMER_NAME),
    area: getColumnValue(row, COLUMN_INDICES.AREA),
    millingType: getColumnValue(row, COLUMN_INDICES.MILLING_TYPE),
    status: getColumnValue(row, COLUMN_INDICES.STATUS),
    plannedDate: getColumnValue(row, COLUMN_INDICES.PLANNED_DATE),
    notes: getColumnValue(row, COLUMN_INDICES.NOTES),
    cadFiles: getColumnValue(row, COLUMN_INDICES.CAD_FILES),
    payment: getColumnValue(row, COLUMN_INDICES.PAYMENT),
    deliveryDate: getColumnValue(row, COLUMN_INDICES.DELIVERY_DATE)
  };
}

// Функция для создания объекта обновления
export function createUpdateObject(columnName, value) {
  const updateObj = {};
  
  // Маппинг названий полей на названия колонок в таблице
  const fieldToColumn = {
    'orderDate': 'Дата заказа',
    'orderNumber': 'Номер заказа',
    'customerName': 'Клиент',
    'area': 'Площадь',
    'millingType': 'Тип фрезеровки',
    'status': 'Статус',
    'plannedDate': 'Планируемая дата',
    'notes': 'Примечания',
    'cadFiles': 'CAD файлы',
    'payment': 'Оплата',
    'deliveryDate': 'Дата выдачи'
  };
  
  if (fieldToColumn[columnName]) {
    updateObj[fieldToColumn[columnName]] = value;
  }
  
  return updateObj;
}