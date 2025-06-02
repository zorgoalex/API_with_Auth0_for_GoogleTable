import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { COLUMN_INDICES, createOrderObject, createUpdateObject } from '../lib/sheet-columns';

// Утилиты для работы с датами
const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const subDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
};

const isSunday = (date) => {
  return date.getDay() === 0;
};

const formatDate = (date) => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
};

const getDayName = (date) => {
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  return days[new Date(date).getDay()];
};

const parseDate = (dateStr) => {
  if (!dateStr) return null;
  
  // Обработка различных форматов даты
  const formats = [
    /^(\d{2})\.(\d{2})\.(\d{4})$/, // DD.MM.YYYY
    /^(\d{2})\/(\d{2})\/(\d{4})$/, // DD/MM/YYYY
    /^(\d{4})-(\d{2})-(\d{2})$/    // YYYY-MM-DD
  ];
  
  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      if (format === formats[0] || format === formats[1]) {
        return new Date(match[3], match[2] - 1, match[1]);
      } else {
        return new Date(match[1], match[2] - 1, match[3]);
      }
    }
  }
  
  return new Date(dateStr);
};

export default function KanbanView({ data, loading, error, onDataUpdate }) {
  const { getAccessTokenSilently } = useAuth0();
  const [days, setDays] = useState([]);
  const [ordersMap, setOrdersMap] = useState({});
  const [columnsCount, setColumnsCount] = useState(7);
  const [cardView, setCardView] = useState('default');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingMove, setPendingMove] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Константы для масштабирования
  const MAX_COLUMNS = 7;
  const MIN_COLUMNS = 1;

  // Инициализация дней
  useEffect(() => {
    if (!data || data.length === 0) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const startDate = subDays(today, 5);
    
    // Найти максимальную планируемую дату
    const maxPlannedDate = data.reduce((maxDate, row) => {
      const plannedDateStr = row[COLUMN_INDICES.PLANNED_DATE];
      if (!plannedDateStr) return maxDate;
      
      const plannedDate = parseDate(plannedDateStr);
      if (!plannedDate || isNaN(plannedDate)) return maxDate;
      
      return plannedDate > maxDate ? plannedDate : maxDate;
    }, today);
    
    let endDate = addDays(maxPlannedDate, 1);
    while (isSunday(endDate)) {
      endDate = addDays(endDate, 1);
    }
    
    // Генерация массива дней (исключая воскресенья)
    const newDays = [];
    let currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      if (!isSunday(currentDate)) {
        newDays.push(new Date(currentDate));
      }
      currentDate = addDays(currentDate, 1);
    }
    
    setDays(newDays);
  }, [data]);

  // Группировка заказов по дням
  useEffect(() => {
    if (!data || data.length === 0 || days.length === 0) return;

    const grouped = {};
    
    // Инициализация пустых массивов для каждого дня
    days.forEach(day => {
      grouped[formatDate(day)] = [];
    });
    
    // Группировка данных
    data.forEach((row, index) => {
      const order = createOrderObject(row, index);
      if (!order.plannedDate) return;
      
      const formattedDate = formatDate(parseDate(order.plannedDate));
      if (grouped[formattedDate]) {
        grouped[formattedDate].push(order);
      }
    });
    
    setOrdersMap(grouped);
  }, [data, days]);

  // Масштабирование
  const handleZoomOut = useCallback(() => {
    setColumnsCount(prev => Math.min(prev + 1, MAX_COLUMNS));
  }, []);

  const handleZoomIn = useCallback(() => {
    setColumnsCount(prev => Math.max(prev - 1, MIN_COLUMNS));
  }, []);

  // API вызов для обновления данных
  const updateOrderData = async (rowIndex, updateData) => {
    try {
      const token = await getAccessTokenSilently();
      const response = await fetch(`/api/sheet?rowId=${rowIndex}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        throw new Error('Failed to update order');
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error updating order:', error);
      throw error;
    }
  };

  // Выполнение перемещения заказа
  const executeOrderMove = async (order, sourceDate, targetDate, updateDeliveryDate = false) => {
    try {
      setIsUpdating(true);
      console.log('executeOrderMove - START', {
        orderNumber: order.orderNumber,
        sourceDate,
        targetDate,
        updateDeliveryDate
      });

      const updateData = createUpdateObject('plannedDate', targetDate);

      if (updateDeliveryDate && order.status?.toLowerCase() === 'выдан') {
        Object.assign(updateData, createUpdateObject('deliveryDate', targetDate));
      }

      await updateOrderData(order._id, updateData);
      
      // Вызываем обновление данных в родительском компоненте
      if (onDataUpdate) {
        await onDataUpdate();
      }

      console.log('executeOrderMove - END');
    } catch (error) {
      console.error('Error executing order move:', error);
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  // Обработчик перемещения заказа
  const handleOrderMove = async (order, sourceDate, targetDate) => {
    try {
      console.log('Moving order:', {
        orderNumber: order.orderNumber,
        from: sourceDate,
        to: targetDate,
        status: order.status
      });

      if (order.status?.toLowerCase() === 'выдан') {
        console.log('Order is issued, showing modal');
        setPendingMove({
          order,
          sourceDate,
          targetDate
        });
        setIsModalOpen(true);
      } else {
        console.log('Order is not issued, moving directly');
        await executeOrderMove(order, sourceDate, targetDate);
      }
    } catch (error) {
      console.error('Error moving order:', error);
    }
  };

  // Обработчики drag-and-drop
  const handleDragStart = (e, order, sourceDate) => {
    e.dataTransfer.setData('order', JSON.stringify(order));
    e.dataTransfer.setData('sourceDate', sourceDate);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetDate) => {
    e.preventDefault();
    const order = JSON.parse(e.dataTransfer.getData('order'));
    const sourceDate = e.dataTransfer.getData('sourceDate');
    handleOrderMove(order, sourceDate, formatDate(targetDate));
  };

  // Обработчик изменения статуса
  const handleCheckboxChange = async (order, isChecked) => {
    try {
      setIsUpdating(true);
      const updateData = createUpdateObject('status', isChecked ? 'Выдан' : 'Готов');
      
      if (isChecked) {
        Object.assign(updateData, createUpdateObject('deliveryDate', formatDate(new Date())));
      }

      await updateOrderData(order._id, updateData);
      
      if (onDataUpdate) {
        await onDataUpdate();
      }
    } catch (error) {
      console.error('Error updating order status:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  // Обработчики модального окна
  const handleModalConfirm = async () => {
    console.log('Modal confirmed - START');
    if (pendingMove) {
      const { order, sourceDate, targetDate } = pendingMove;
      await executeOrderMove(order, sourceDate, targetDate, true);
    }
    setIsModalOpen(false);
    setPendingMove(null);
    console.log('Modal confirmed - END');
  };

  const handleModalClose = async () => {
    console.log('Modal closed - START');
    if (pendingMove) {
      const { order, sourceDate, targetDate } = pendingMove;
      await executeOrderMove(order, sourceDate, targetDate, false);
    }
    setIsModalOpen(false);
    setPendingMove(null);
    console.log('Modal closed - END');
  };

  // Расчет общей площади
  const getTotalArea = (orders) => {
    if (!orders || !Array.isArray(orders)) return '0.00';
    const total = orders.reduce((sum, order) => {
      const area = parseFloat(order.area?.replace(',', '.') || 0);
      return sum + area;
    }, 0);
    return total.toFixed(2);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Загрузка данных...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">Ошибка: {error}</div>
      </div>
    );
  }

  return (
    <div className="kanban-container">
      {/* Панель управления */}
      <div className="flex items-center justify-between mb-4 p-4 bg-white rounded-lg shadow">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handleZoomOut}
              disabled={columnsCount >= MAX_COLUMNS}
              className="px-3 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300"
            >
              -
            </button>
            <span className="text-sm">{columnsCount} колонок</span>
            <button
              onClick={handleZoomIn}
              disabled={columnsCount <= MIN_COLUMNS}
              className="px-3 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300"
            >
              +
            </button>
          </div>
          
          <button
            onClick={() => setCardView(prev => prev === 'default' ? 'compact' : 'default')}
            className="px-3 py-1 bg-gray-500 text-white rounded"
          >
            {cardView === 'default' ? 'Компактный вид' : 'Полный вид'}
          </button>
        </div>
        
        {isUpdating && (
          <div className="text-sm text-gray-500">Обновление...</div>
        )}
      </div>

      {/* Канбан доска */}
      <div className={`grid gap-2 grid-cols-${columnsCount}`}>
        {days.map((day) => {
          const formattedDate = formatDate(day);
          const dayOrders = ordersMap[formattedDate] || [];
          const allCompleted = dayOrders.length > 0 && 
            dayOrders.every(order => order.status?.toLowerCase() === 'выдан');

          return (
            <div
              key={formattedDate}
              className="bg-gray-50 p-3 rounded-lg shadow-md min-h-[400px] relative"
              onDrop={(e) => handleDrop(e, day)}
              onDragOver={handleDragOver}
            >
              {/* Прогресс-бар */}
              {allCompleted && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-green-500 rounded-t-lg"></div>
              )}
              
              {/* Заголовок колонки */}
              <div className="mb-3 text-center">
                <div className="font-bold">{getDayName(day)}</div>
                <div className="text-sm text-gray-600">{formattedDate}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {getTotalArea(dayOrders)} м²
                </div>
              </div>

              {/* Карточки заказов */}
              <div className="space-y-2">
                {dayOrders.map((order) => (
                  <div
                    key={order.orderNumber}
                    draggable="true"
                    onDragStart={(e) => handleDragStart(e, order, formattedDate)}
                    className={`p-2 bg-white rounded cursor-move transition-all hover:shadow-lg ${
                      order.status?.toLowerCase() === 'готов' ? 'border-2 border-green-500' : 'border border-gray-200'
                    } ${order.status?.toLowerCase() === 'выдан' ? 'bg-green-50' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={order.status?.toLowerCase() === 'выдан'}
                        onChange={(e) => handleCheckboxChange(order, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1"
                      />
                      
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm">
                            №{order.orderNumber}
                          </span>
                          <div className="flex items-center gap-1">
                            {order.payment?.toLowerCase() === 'оплачен' && (
                              <span className="text-green-600" title="Оплачен">💵</span>
                            )}
                            {order.cadFiles?.toLowerCase() === 'отрисован' && (
                              <span className="text-blue-600" title="CAD готов">📐</span>
                            )}
                            {order.status?.toLowerCase() === 'выдан' && (
                              <span className="text-green-600" title="Выдан">✅</span>
                            )}
                          </div>
                        </div>
                        
                        {cardView === 'default' ? (
                          <>
                            <div className="text-xs text-gray-600 mt-1">
                              {order.customerName}
                            </div>
                            <div className="text-xs mt-1">
                              {order.millingType} - {parseFloat(order.area.replace(',', '.')).toFixed(2)} м²
                            </div>
                            {order.notes && (
                              <div className="text-xs text-gray-500 mt-1">
                                {order.notes}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-xs mt-1">
                            {order.millingType ? order.millingType.charAt(0).toUpperCase() : ''} - 
                            {parseFloat(order.area.replace(',', '.')).toFixed(2)} м²
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Модальное окно подтверждения */}
      {isModalOpen && (
        <ConfirmationModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onConfirm={handleModalConfirm}
          message="Заказ уже выдан. Обновить дату выдачи на новую дату?"
        />
      )}
    </div>
  );
}

// Компонент модального окна
function ConfirmationModal({ isOpen, onClose, onConfirm, message }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">Подтверждение</h3>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
          >
            Нет, оставить прежнюю дату
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Да, обновить
          </button>
        </div>
      </div>
    </div>
  );
}