import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import OrderContextMenu from './OrderContextMenu';

const MS_IN_DAY = 86400000;
const EXCEL_EPOCH_OFFSET = 25569; // 1899-12-30

const normalizeText = (value = '') =>
  String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

const normalizeColumnName = (name = '') => normalizeText(name).toLowerCase();

function coerceToDate(dateInput) {
  if (dateInput instanceof Date) {
    return new Date(dateInput.getTime());
  }

  if (typeof dateInput === 'number' && Number.isFinite(dateInput)) {
    if (dateInput > 100000000000) {
      return new Date(dateInput);
    }

    if (dateInput > 60 && dateInput < 6000000) {
      const ms = Math.round((dateInput - EXCEL_EPOCH_OFFSET) * MS_IN_DAY);
      return new Date(ms);
    }
  }

  if (typeof dateInput === 'string') {
    const sanitized = normalizeText(dateInput);
    if (!sanitized) return null;

    const dateMatch = sanitized.match(/^(\d{2}\.\d{2}\.\d{4})/);
    if (dateMatch) {
      const [day, month, year] = dateMatch[1].split('.');
      const parsed = new Date(Number(year), Number(month) - 1, Number(day));
      if (!isNaN(parsed)) return parsed;
      return null;
    }

    const numericValue = Number(sanitized);
    if (!Number.isNaN(numericValue)) {
      return coerceToDate(numericValue);
    }

    const parsed = new Date(sanitized);
    if (!isNaN(parsed)) return parsed;
  }

  return null;
}

function formatDateUniversal(dateInput) {
  if (dateInput === undefined || dateInput === null || dateInput === '') return '';
  if (typeof dateInput === 'string' && dateInput.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
    return dateInput;
  }

  const coerced = coerceToDate(dateInput);
  if (!coerced || isNaN(coerced.getTime())) {
    return typeof dateInput === 'string' ? normalizeText(dateInput) : '';
  }

  const day = String(coerced.getDate()).padStart(2, '0');
  const month = String(coerced.getMonth() + 1).padStart(2, '0');
  const year = coerced.getFullYear();
  return `${day}.${month}.${year}`;
}

const NORMALIZED_PLANNED_DATE_KEY = normalizeColumnName('Планируемая дата выдачи');

const WEEKDAYS = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
function getDayName(date) {
  const d = new Date(date);
  return WEEKDAYS[d.getDay()];
}

function generateDays(centerDate, range = 3) {
  let days = [];
  const today = new Date(centerDate);
  today.setHours(0, 0, 0, 0);
  for (let offset = -range; offset <= range; offset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    if (d.getDay() !== 0) days.push(new Date(d));
  }
  return days;
}

function groupOrdersByDate(orders) {
  if (!Array.isArray(orders)) {
    return {};
  }
  const map = {};
  for (const order of orders) {
    const key = formatDateUniversal(getPlannedDateValue(order));
    if (!map[key]) map[key] = [];
    map[key].push(order);
  }
  return map;
}

function resolvePlannedDateColumn(order) {
  if (!order || typeof order !== 'object') {
    return 'Планируемая дата выдачи';
  }

  const matchedKey = Object.keys(order).find(
    (key) => normalizeColumnName(key) === NORMALIZED_PLANNED_DATE_KEY
  );

  return matchedKey || 'Планируемая дата выдачи';
}

function getPlannedDateValue(order) {
  if (!order) return '';
  const column = resolvePlannedDateColumn(order);
  return order[column];
}

function getStatusColor(status) {
  if (!status) return 'var(--color-background)';
  const s = String(status).toLowerCase();
  if (s === 'выдан') return '#eafbe7'; // очень светло-зеленый фон
  return 'var(--color-background)';
}

const getTotalArea = (orders) =>
  orders.reduce((sum, o) => sum + (parseFloat(String(o["Площадь заказа"]).replace(',', '.')) || 0), 0);

function capitalizeFirst(str) {
  if (!str) return '';
  return str[0].toUpperCase() + str.slice(1).toLowerCase();
}

// Статусы производственного процесса (в порядке технологического процесса)
const PRODUCTION_STAGES = [
  { key: 'Закуп пленки', abbr: 'З', tooltip: 'Закуп пленки' },
  { key: 'Распил', abbr: 'Р', tooltip: 'Распил' },
  { key: 'Шлифовка', abbr: 'Ш', tooltip: 'Шлифовка' },
  { key: 'Пленка', abbr: 'П', tooltip: 'Пленка' },
  { key: 'Упаковка', abbr: 'У', tooltip: 'Упаковка' }
];

// Определение цвета и стиля индикатора статуса
// backgroundColor - цвет фона карточки, чтобы скрыть неактивные индикаторы
function getProductionStageStyle(status, backgroundColor = '#ffffff') {
  if (!status || status === '-') {
    return { color: backgroundColor, fontWeight: 600 }; // Цвет = цвет фона (невидимый)
  }
  const statusLower = String(status).toLowerCase().trim();
  if (statusLower === 'готов') {
    return { color: '#ff6f00', fontWeight: 700 }; // Оранжевый + жирный - готов
  }
  return { color: backgroundColor, fontWeight: 600 }; // Дефолт - невидимый
}

export default function KanbanBoard({ orders = [], days = [], onOrderStatusUpdate, onOrderMove }) {
  const { getAccessTokenSilently } = useAuth0();
  const [containerWidth, setContainerWidth] = useState(1200);
  const [draggedOrder, setDraggedOrder] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [optimisticOrders, setOptimisticOrders] = useState([]); // Локальная копия заказов для оптимистичных обновлений
  const [pendingMoves, setPendingMoves] = useState(new Set()); // Отслеживание заказов в процессе перемещения
  const [notification, setNotification] = useState(null); // Уведомления об ошибках
  const [contextMenu, setContextMenu] = useState({ isOpen: false, position: { x: 0, y: 0 }, order: null });
  const [availableStatuses, setAvailableStatuses] = useState({}); // Доступные статусы из Google Sheets
  const containerRef = useRef(null);
  const columnRefs = useRef({});
  
  // Используем оптимистичные заказы, если они есть, иначе исходные
  const currentOrders = optimisticOrders.length > 0 ? optimisticOrders : orders;
  const ordersMap = groupOrdersByDate(currentOrders);

  // Загрузка доступных статусов при монтировании
  useEffect(() => {
    const fetchStatuses = async () => {
      try {
        const token = await getAccessTokenSilently();
        const response = await fetch('/api/sheet/statuses', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setAvailableStatuses(data);
          console.log('Loaded statuses:', data);
        } else {
          console.error('Failed to load statuses:', response.status);
          // Fallback на жестко закодированные статусы
          setAvailableStatuses({
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
          });
        }
      } catch (error) {
        console.error('Error fetching statuses:', error);
        // Fallback на жестко закодированные статусы
        setAvailableStatuses({
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
        });
      }
    };

    fetchStatuses();
  }, [getAccessTokenSilently]);

  // Синхронизируем оптимистичные заказы с реальными
  useEffect(() => {
    if (orders.length > 0) {
      setOptimisticOrders(prevOptimistic => {
        // Первая загрузка - просто устанавливаем все заказы
        if (prevOptimistic.length === 0) {
          return orders;
        }

        // Если есть pending операции - игнорируем обновления полностью
        if (pendingMoves.size > 0) {
          return prevOptimistic; // Возвращаем текущие оптимистичные данные без изменений
        }

        // Нет pending операций - безопасно обновляем все
        return orders;
      });
    }
  }, [orders]);

  // Функция для показа уведомлений
  const showNotification = (message, type = 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000); // Автоматически скрываем через 4 секунды
  };

  // Константы для адаптивного дизайна
  const DESKTOP_COLUMN_WIDTH = 260;
  const MOBILE_MIN_COLUMN_WIDTH = 126;
  const MOBILE_MAX_COLUMN_WIDTH = 144;
  const COLUMN_GAP = 16;
  const CONTAINER_PADDING = 32; // padding слева и справа

  // Детекция мобильных устройств
  const isMobile = containerWidth <= 768;

  // Отслеживаем размер контейнера
  useEffect(() => {
    // Принудительно устанавливаем начальную ширину
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setContainerWidth(rect.width || 1200);
    }

    const resizeObserver = new ResizeObserver(entries => {
      if (entries[0]) {
        const width = entries[0].contentRect.width;
        setContainerWidth(width);
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  // Автоматическое вычисление размеров колонок и их количества
  const { columnWidth, actualColumnsPerRow } = useMemo(() => {
    const availableWidth = containerWidth - CONTAINER_PADDING;
    
    if (isMobile) {
      // Для мобильных устройств
      if (availableWidth <= 320) {
        // Очень узкие экраны - 2 колонки минимальной ширины
        const cols = 2;
        const width = Math.max(MOBILE_MIN_COLUMN_WIDTH, 
          (availableWidth - (cols - 1) * COLUMN_GAP) / cols);
        return { columnWidth: width, actualColumnsPerRow: cols };
      } else {
        // Более широкие мобильные экраны - автоматический расчет
        let cols = Math.floor((availableWidth + COLUMN_GAP) / (MOBILE_MIN_COLUMN_WIDTH + COLUMN_GAP));
        cols = Math.max(2, Math.min(cols, 3)); // от 2 до 3 колонок на мобильных
        const width = Math.min(MOBILE_MAX_COLUMN_WIDTH, 
          (availableWidth - (cols - 1) * COLUMN_GAP) / cols);
        return { columnWidth: width, actualColumnsPerRow: cols };
      }
    } else {
      // Для десктопа и планшетов - используем фиксированную ширину
      const cols = Math.max(1, Math.floor((availableWidth + COLUMN_GAP) / (DESKTOP_COLUMN_WIDTH + COLUMN_GAP)));
      return { columnWidth: DESKTOP_COLUMN_WIDTH, actualColumnsPerRow: cols };
    }
  }, [containerWidth, isMobile]);

  // Группируем дни по рядам
  const dayRows = useMemo(() => {
    if (!days.length || actualColumnsPerRow === 0) return [];
    
    const rows = [];
    for (let i = 0; i < days.length; i += actualColumnsPerRow) {
      rows.push(days.slice(i, i + actualColumnsPerRow));
    }
    return rows;
  }, [days, actualColumnsPerRow]);

  const handleCheckboxChange = (order, isChecked) => {
    if (!onOrderStatusUpdate) return;
    const newStatus = isChecked ? 'Выдан' : '-';
    const fieldsToUpdate = { "Статус": newStatus };
    onOrderStatusUpdate(order._id, fieldsToUpdate);
  };

  // Drag and Drop handlers
  const handleDragStart = (e, order, sourceDate) => {
    console.log('Drag start:', order, sourceDate);
    setDraggedOrder({ order, sourceDate });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // Required for some browsers
    
    // Add visual feedback
    e.target.classList.add('dragging');
    document.body.classList.add('dragging-cursor');
  };

  const handleDragEnd = (e) => {
    console.log('Drag end');
    setDraggedOrder(null);
    setDragOverColumn(null);
    
    // Remove visual feedback
    e.target.classList.remove('dragging');
    document.body.classList.remove('dragging-cursor');
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e, targetDate) => {
    e.preventDefault();
    setDragOverColumn(targetDate);
  };

  const handleDragLeave = (e) => {
    // Only clear if we're leaving the column entirely
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = async (e, targetDate) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (!draggedOrder || !onOrderMove) {
      console.log('No dragged order or onOrderMove handler');
      return;
    }

    const { order, sourceDate } = draggedOrder;
    const formattedTargetDate = formatDateUniversal(targetDate);
    const plannedDateColumn = resolvePlannedDateColumn(order);

    if (sourceDate === formattedTargetDate) {
      console.log('Same date, no move needed');
      return;
    }

    console.log('Moving order optimistically:', {
      orderNumber: order["Номер заказа"],
      from: sourceDate,
      to: formattedTargetDate
    });

    const orderId = order._id || order["Номер заказа"];

    // Оптимистичное обновление - сразу перемещаем карточку
    setOptimisticOrders(prevOrders => {
      return prevOrders.map(o => {
        if ((o._id && o._id === order._id) || o["Номер заказа"] === order["Номер заказа"]) {
          return {
            ...o,
            [plannedDateColumn]: formattedTargetDate
          };
        }
        return o;
      });
    });

    // Помечаем заказ как находящийся в процессе обновления (кратковременно)
    setPendingMoves(prev => new Set([...prev, orderId]));

    // Убираем спиннер через короткое время (визуальная обратная связь)
    setTimeout(() => {
      setPendingMoves(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }, 500); // 0.5 секунды

    // Вызываем реальное обновление в источнике БЕЗ ожидания (fire-and-forget)
    onOrderMove(order, sourceDate, formattedTargetDate, plannedDateColumn)
      .then(() => {
        console.log('Order move completed successfully');
      })
      .catch((error) => {
        console.error('Error moving order:', error);

        // Различаем таймауты и реальные ошибки
        const isTimeout = error.message.includes('timeout') || error.message.includes('Update timeout');

        if (isTimeout) {
          // Таймаут - возможно операция все еще выполняется, НЕ откатываем
          showNotification(`Таймаут обновления заказа ${order["Номер заказа"]}. Проверьте результат в таблице.`, 'warning');
        } else {
          // Реальная ошибка - откатываем изменения
          setOptimisticOrders(prevOrders => {
            return prevOrders.map(o => {
              if ((o._id && o._id === order._id) || o["Номер заказа"] === order["Номер заказа"]) {
                return {
                  ...o,
                  [plannedDateColumn]: sourceDate // Возвращаем исходную дату
                };
              }
              return o;
            });
          });

          showNotification(`Ошибка перемещения заказа ${order["Номер заказа"]}: ${error.message}`, 'error');
          console.warn('Карточка возвращена на исходное место из-за ошибки API');
        }
      });
  };

  // Обработчик открытия контекстного меню (ПКМ на desktop)
  const handleContextMenu = (e, order) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      order: order
    });
  };

  // Обработчик двойного тапа (мобильные устройства)
  const [lastTap, setLastTap] = useState(0);
  const handleDoubleTap = (e, order) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300; // 300мс для двойного тапа

    if (now - lastTap < DOUBLE_TAP_DELAY) {
      e.preventDefault();
      e.stopPropagation();

      // Открываем меню по центру экрана для мобильных
      setContextMenu({
        isOpen: true,
        position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        order: order
      });
    }

    setLastTap(now);
  };

  // Закрытие контекстного меню
  const handleCloseContextMenu = () => {
    setContextMenu({ isOpen: false, position: { x: 0, y: 0 }, order: null });
  };

  // Обработчик изменения статуса из контекстного меню
  const handleStatusChange = useCallback((property, newStatus) => {
    console.log('handleStatusChange called:', { property, newStatus, currentOrder: contextMenu.order });

    if (!onOrderStatusUpdate) {
      console.error('onOrderStatusUpdate is not provided');
      return;
    }

    // Сохраняем ссылку на заказ ДО закрытия меню
    const orderToUpdate = contextMenu.order;

    if (!orderToUpdate) {
      console.error('No order available for status update');
      return;
    }

    const fieldsToUpdate = { [property]: newStatus };
    console.log('Calling onOrderStatusUpdate with:', {
      orderId: orderToUpdate._id,
      fieldsToUpdate
    });

    // Вызываем обновление с сохраненной ссылкой на заказ
    onOrderStatusUpdate(orderToUpdate._id, fieldsToUpdate);
  }, [contextMenu.order, onOrderStatusUpdate]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#fdfdfe',
        padding: 16,
        overflow: 'hidden',
        position: 'relative',
      }}
      className="kanban-board-container"
    >
      {/* Уведомления */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 1000,
            background: notification.type === 'error' ? '#ff4444' : 
                       notification.type === 'warning' ? '#ff9800' : '#44aa44',
            color: 'white',
            padding: '12px 16px',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            maxWidth: '300px',
            fontSize: 14,
            fontWeight: 500,
            animation: 'slideIn 0.3s ease-out'
          }}
          onClick={() => setNotification(null)}
        >
          {notification.message}
        </div>
      )}


      {/* Многорядная сетка дней */}
      <div
        style={{
          overflowX: 'auto',
          overflowY: 'auto',
          width: '100%',
          flexGrow: 1,
          minHeight: 0,
        }}
        className="kanban-rows-scroller"
      >
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          width: 'fit-content',
          minWidth: 'max-content',
        }}>
          {dayRows.map((row, rowIndex) => (
            <div
              key={rowIndex}
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${row.length}, ${columnWidth}px)`,
                gridTemplateRows: '1fr',
                gap: COLUMN_GAP,
                alignItems: 'stretch',
                justifyContent: 'flex-start',
                paddingBottom: rowIndex < dayRows.length - 1 ? 8 : 0,
                borderBottom: rowIndex < dayRows.length - 1 ? '5px solid #e0e0e0' : 'none',
              }}
            >
              {row.map((day, colIndex) => {
                const key = formatDateUniversal(day);
                const dayOrders = ordersMap[key] || [];
                const allCompleted = dayOrders.length > 0 && dayOrders.every(order => 
                  String(order["Статус"] ?? '').toLowerCase() === 'выдан'
                );
                
                const isDragOver = dragOverColumn === key;
                
                return (
                  <div
                    key={key}
                    ref={el => columnRefs.current[key] = el}
                    className={`kanban-column ${isDragOver ? 'drag-over' : ''}`}
                    onDragOver={handleDragOver}
                    onDragEnter={(e) => handleDragEnter(e, key)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, day)}
                    style={{
                      background: allCompleted ? '#f8fcf8' : '#fcfcfc',
                      borderRadius: isMobile ? 8 : 10,
                      boxShadow: 'var(--shadow-md)',
                      padding: isMobile ? 8 : 12,
                      minHeight: isMobile ? 100 : 120,
                      border: allCompleted ? '2px solid #4caf50' : '1px solid #bfc3c9',
                      display: 'flex',
                      flexDirection: 'column',
                      fontSize: isMobile ? 12 : 14,
                      position: 'relative',
                    }}
                  >
                    {/* Заголовок дня */}
                    <div style={{ 
                      marginBottom: isMobile ? 6 : 8, 
                      fontWeight: 500, 
                      fontSize: isMobile ? 13 : 16,
                      lineHeight: isMobile ? 1.2 : 1.5,
                      display: 'flex',
                      flexDirection: isMobile ? 'column' : 'row',
                      alignItems: isMobile ? 'flex-start' : 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: isMobile ? 2 : 8
                    }}>
                      <div>
                        <span style={{ 
                          fontWeight: 700, 
                          color: allCompleted ? '#2e7d32' : '#000' 
                        }}>
                          {capitalizeFirst(getDayName(day))}
                        </span>
                        <span style={{ 
                          marginLeft: 4, 
                          color: allCompleted ? '#2e7d32' : '#000',
                          fontSize: isMobile ? 11 : 'inherit',
                          fontWeight: 'normal'
                        }}>
                          ({key})
                        </span>
                      </div>
                      {dayOrders.length > 0 && (
                        <div style={{ fontSize: isMobile ? 12 : 16 }}>
                          <span style={{ 
                            color: allCompleted ? '#1b5e20' : '#e65100', 
                            fontWeight: 700
                          }}>
                            {getTotalArea(dayOrders).toFixed(2)} кв.м.
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Список заказов */}
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: 8,
                      flexGrow: 1,
                    }}>
                      {dayOrders.map(order => {
                        const isIssued = String(order["Статус"] ?? '').toLowerCase() === 'выдан';
                        const isReady = String(order["Статус"] ?? '').toLowerCase() === 'готов';
                        const orderId = order._id || order["Номер заказа"];
                        const isPending = pendingMoves.has(orderId);
                        const plannedDateDisplay = getPlannedDateValue(order);
                        
                        return (
                          <div
                            key={order._id || order["Номер заказа"] || Math.random()}
                            className={`kanban-card ${isPending ? 'pending-update' : ''}`}
                            draggable={!isPending}
                            onDragStart={(e) => handleDragStart(e, order, key)}
                            onDragEnd={handleDragEnd}
                            onContextMenu={(e) => handleContextMenu(e, order)}
                            onTouchStart={(e) => handleDoubleTap(e, order)}
                            style={{
                              border: isReady ? '2px solid #4caf50' : '1px solid #c0c0c0',
                              borderRadius: isMobile ? 5 : 7,
                              background: (() => {
                                if (isPending) return '#f5f5f5'; // Серый фон для pending карточек
                                if (String(order["Номер заказа"] || '').startsWith('К')) {
                                  return isIssued ? '#f5f0e6' : '#faf7f0';
                                }
                                return isIssued ? '#f8f9fa' : '#ffffff';
                              })(),
                              color: 'var(--color-text)',
                              boxShadow: 'var(--shadow-xs)',
                              padding: `${isMobile ? 10 : 16}px ${isMobile ? 6 : 10}px`,
                              fontSize: isMobile ? 11 : 14,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: isMobile ? 4 : 5,
                              position: 'relative',
                              cursor: isPending ? 'not-allowed' : 'grab',
                              opacity: isPending ? 0.7 : 1,
                            }}
                          >
                            {/* Индикатор загрузки для pending карточек */}
                            {isPending && (
                              <div style={{
                                position: 'absolute',
                                top: 2,
                                right: 2,
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                border: '2px solid #ccc',
                                borderTop: '2px solid #2196f3',
                                animation: 'spin 1s linear infinite',
                                zIndex: 10
                              }} />
                            )}
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: 4, 
                              marginBottom: 2,
                              flexWrap: 'wrap',
                              justifyContent: 'space-between'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                {/* Чекбокс */}
                                <input
                                  type="checkbox"
                                  checked={isIssued}
                                  onChange={(e) => handleCheckboxChange(order, e.target.checked)}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    width: isMobile ? 12 : 10,
                                    height: isMobile ? 12 : 10,
                                    marginRight: isMobile ? 6 : 8,
                                    cursor: 'pointer',
                                    accentColor: '#1976d2'
                                  }}
                                  title={isIssued ? "Снять отметку о выдаче (статус изменится на '-')" : "Отметить как выданный"}
                                />
                                
                                {/* Номер заказа */}
                                <span style={{ 
                                  fontWeight: 700, 
                                  color: String(order["Номер заказа"] || '').startsWith('К') ? '#8B4513' : '#1976d2', 
                                  fontSize: isMobile ? 15 : 20,
                                  lineHeight: 1
                                }}>
                                  {order["Номер заказа"] || ''}
                                  {order["Номер заказа присадки"] && (
                                    <span style={{ 
                                      color: '#d32f2f', 
                                      fontWeight: 700,
                                      fontSize: isMobile ? 15 : 20
                                    }}>
                                      -{order["Номер заказа присадки"]}
                                    </span>
                                  )}
                                </span>

                                {/* Отрисован */}
                                {(() => {
                                  const ot = String(order["Отрисован"] ?? '').toLowerCase();
                                  return (ot.includes('отрис') || ot.includes('cad')) && (
                                    <span style={{ 
                                      color: '#1976d2', 
                                      fontWeight: 700, 
                                      fontSize: 22, 
                                      marginLeft: 4, 
                                      lineHeight: 1 
                                    }}>
                                      О
                                    </span>
                                  );
                                })()}


                              </div>

                                                            {/* Материалы и CAD файлы */}
                              <div style={{ 
                                display: 'flex', 
                                flexDirection: 'column', 
                                alignItems: 'flex-end',
                                gap: 2,
                                marginTop: -6
                              }}>
                                {/* Материалы */}
                                {order["Материал"] && String(order["Материал"]).trim() !== "16мм" && (
                                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {String(order["Материал"]).split(',').map((mat, idx, arr) => {
                                       const m = mat.trim().toLowerCase();
                                       let bg = '#e0e0e0';
                                       if (m.includes('18')) bg = '#fff3cd';
                                       else if (m.includes('16')) bg = '#ffeaa7';
                                       else if (m.includes('10')) bg = '#90caf9';
                                       else if (m.includes('8')) bg = '#c8e6c9';
                                       else if (m.includes('лдсп')) bg = '#ce93d8';
                                      return (
                                         <span key={idx} style={{
                                           background: bg,
                                           color: '#8b0000',
                                           fontStyle: 'italic',
                                           fontWeight: 300,
                                           fontSize: 13,
                                           padding: '1px 7px',
                                           borderRadius: 6
                                         }}>
                                           {mat.trim()}
                                         </span>
                                      );
                                    })}
                                  </div>
                                )}
                                
                                {/* CAD файлы - контурный карандашик */}
                                {(() => {
                                  const cadFiles = String(order["CAD файлы"] ?? '').toLowerCase();
                                  return cadFiles.includes('отрисован') && (
                                    <span style={{ 
                                      color: 'transparent',
                                      WebkitTextStroke: '1px #5e72e4',
                                      textStroke: '1px #5e72e4',
                                      fontSize: 22, 
                                      lineHeight: 1,
                                      fontWeight: 400,
                                      transform: 'scaleX(-1) scaleY(1.15) rotate(5deg)',
                                      display: 'inline-block'
                                    }}>
                                      ✎
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Детали заказа */}
                            <div style={{ 
                              fontSize: isMobile ? 12 : 13, 
                              marginBottom: 2,
                              lineHeight: 1.2,
                              color: '#000'
                            }}>
                              {order["Фрезеровка"] ? `. ${order["Фрезеровка"]}` : ''}
                              {order["Площадь заказа"] ? ` – ${String(order["Площадь заказа"]).replace(',', '.')} кв.м.` : ''}
                            </div>
                            
                            {/* Дополнительная информация */}
                            <div style={{
                              fontSize: isMobile ? 9 : 12,
                              color: '#888',
                              lineHeight: 1.2
                            }}>
                              {plannedDateDisplay ? `${plannedDateDisplay} • ` : ''}
                              {order["Клиент"] || ''}
                              {order["Оплата"] && (
                                <>
                                  {' • '}
                                  <span style={{
                                    color: String(order["Оплата"]).toLowerCase().includes('не оплачен') ? '#d32f2f' : 'inherit',
                                    fontStyle: String(order["Оплата"]).toLowerCase().includes('не оплачен') ? 'italic' : 'normal',
                                    fontWeight: String(order["Оплата"]).toLowerCase().includes('не оплачен') ? 500 : 'normal'
                                  }}>
                                    {order["Оплата"]}
                                  </span>
                                </>
                              )}
                            </div>

                            {/* Индикаторы статусов производства */}
                            {(() => {
                              // Проверяем, все ли 5 статусов в "Готов"
                              const allReady = PRODUCTION_STAGES.every(stage => {
                                const status = order[stage.key] || '-';
                                return String(status).toLowerCase().trim() === 'готов';
                              });

                              // Определяем цвет фона карточки для скрытия неактивных индикаторов
                              const cardBackground = (() => {
                                if (isPending) return '#f5f5f5';
                                if (String(order["Номер заказа"] || '').startsWith('К')) {
                                  return isIssued ? '#f5f0e6' : '#faf7f0';
                                }
                                return isIssued ? '#f8f9fa' : '#ffffff';
                              })();

                              return (
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  marginTop: isMobile ? 4 : 6,
                                  paddingTop: isMobile ? 4 : 6,
                                  borderTop: allReady ? 'none' : '1px solid #e0e0e0',
                                  justifyContent: 'space-around',
                                  width: 'calc(100% + 12px)',
                                  marginLeft: '-6px',
                                  marginRight: '-6px',
                                  background: allReady ? '#ffd9bf' : 'transparent', // Очень светло-оранжевый
                                  borderRadius: allReady ? (isMobile ? 4 : 5) : 0,
                                  padding: allReady ? `${isMobile ? 5 : 6}px ${isMobile ? 8 : 10}px` : `${isMobile ? 4 : 6}px 0 0 0`
                                }}>
                                  {PRODUCTION_STAGES.map(stage => {
                                    const status = order[stage.key] || '-';
                                    const style = allReady
                                      ? { color: '#e0a882', fontWeight: 700 } // Чуть темнее полоски
                                      : getProductionStageStyle(status, cardBackground);
                                    return (
                                      <span
                                        key={stage.key}
                                        title={`${stage.tooltip}: ${status}`}
                                        style={{
                                          fontSize: isMobile ? 10 : 12,
                                          fontWeight: style.fontWeight,
                                          color: style.color,
                                          lineHeight: 1,
                                          cursor: 'default',
                                          userSelect: 'none'
                                        }}
                                      >
                                        {stage.abbr}
                                      </span>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Контекстное меню для редактирования статусов заказа */}
      <OrderContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        order={contextMenu.order}
        statuses={availableStatuses}
        onClose={handleCloseContextMenu}
        onStatusChange={handleStatusChange}
        isMobile={isMobile}
      />
    </div>
  );
}
