import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

function formatDateUniversal(dateInput) {
  if (!dateInput) return '';
  if (typeof dateInput === 'string' && dateInput.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
    return dateInput;
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

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
    const key = formatDateUniversal(order["Планируемая дата выдачи"]);
    if (!map[key]) map[key] = [];
    map[key].push(order);
  }
  return map;
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

export default function KanbanBoard({ orders = [], days = [], onOrderStatusUpdate }) {
  const [containerWidth, setContainerWidth] = useState(1200); // Начальное значение
  const [columnsCount, setColumnsCount] = useState(4); // Уменьшаем начальное значение
  const containerRef = useRef(null);
  const columnRefs = useRef({});
  
  const ordersMap = groupOrdersByDate(orders);

  // Константы для масштабирования
  const MAX_COLUMNS = 7;
  const MIN_COLUMNS = 1;
  const COLUMN_WIDTH = 260;
  const COLUMN_GAP = 16;

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
        console.log('Container width updated:', width);
        setContainerWidth(width);
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  // Вычисляем количество колонок на основе ширины контейнера
  const maxColumnsPerRow = Math.max(1, Math.floor((containerWidth - 32) / (COLUMN_WIDTH + COLUMN_GAP))); // Учитываем padding
  const actualColumnsPerRow = Math.min(maxColumnsPerRow, columnsCount);
  
  console.log('Debug info:', {
    containerWidth,
    maxColumnsPerRow,
    columnsCount,
    actualColumnsPerRow,
    daysLength: days.length
  });

  // Группируем дни по рядам
  const dayRows = useMemo(() => {
    if (!days.length || actualColumnsPerRow === 0) return [];
    
    const rows = [];
    for (let i = 0; i < days.length; i += actualColumnsPerRow) {
      rows.push(days.slice(i, i + actualColumnsPerRow));
    }
    console.log('Day rows:', rows.map(row => row.length));
    return rows;
  }, [days, actualColumnsPerRow]);



  const handleZoomOut = () => {
    setColumnsCount(prev => Math.min(prev + 1, MAX_COLUMNS));
  };

  const handleZoomIn = () => {
    setColumnsCount(prev => Math.max(prev - 1, MIN_COLUMNS));
  };

  const handleCheckboxChange = (order, isChecked) => {
    if (!onOrderStatusUpdate) return;
    const newStatus = isChecked ? 'Выдан' : '-';
    const fieldsToUpdate = { "Статус": newStatus };
    onOrderStatusUpdate(order._id, fieldsToUpdate);
  };

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
      }}
      className="kanban-board-container"
    >
      {/* Панель управления масштабом */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
        padding: '8px 12px',
        background: 'var(--color-surface)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-sm)',
      }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)' }}>
          Масштаб:
        </span>
        <button
          onClick={handleZoomIn}
          disabled={columnsCount <= MIN_COLUMNS}
          style={{
            padding: '4px 8px',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            background: columnsCount <= MIN_COLUMNS ? '#f5f5f5' : 'var(--color-surface)',
            cursor: columnsCount <= MIN_COLUMNS ? 'not-allowed' : 'pointer',
            fontSize: 12,
          }}
        >
          +
        </button>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {actualColumnsPerRow} из {days.length} ({dayRows.length} рядов)
        </span>
        <button
          onClick={handleZoomOut}
          disabled={columnsCount >= MAX_COLUMNS}
          style={{
            padding: '4px 8px',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            background: columnsCount >= MAX_COLUMNS ? '#f5f5f5' : 'var(--color-surface)',
            cursor: columnsCount >= MAX_COLUMNS ? 'not-allowed' : 'pointer',
            fontSize: 12,
          }}
        >
          −
        </button>
      </div>

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
                gridTemplateColumns: `repeat(${row.length}, ${COLUMN_WIDTH}px)`,
                gap: COLUMN_GAP,
                alignItems: 'start',
              }}
            >
              {row.map((day, colIndex) => {
                const key = formatDateUniversal(day);
                const dayOrders = ordersMap[key] || [];
                const allCompleted = dayOrders.length > 0 && dayOrders.every(order => 
                  String(order["Статус"] ?? '').toLowerCase() === 'выдан'
                );
                
                return (
                  <div
                    key={key}
                    ref={el => columnRefs.current[key] = el}
                    style={{
                      background: allCompleted ? '#e8f5e8' : 'var(--color-surface)',
                      borderRadius: 10,
                      boxShadow: 'var(--shadow-md)',
                      padding: 12,
                      minHeight: 120,
                      height: 'fit-content',
                      border: allCompleted ? '2px solid #4caf50' : '1px solid #bfc3c9',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {/* Заголовок дня */}
                    <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 16 }}>
                      <span style={{ 
                        fontWeight: 700, 
                        color: allCompleted ? '#2e7d32' : '#000' 
                      }}>
                        {capitalizeFirst(getDayName(day))}
                      </span>
                      <span style={{ 
                        marginLeft: 4, 
                        color: allCompleted ? '#2e7d32' : '#000' 
                      }}>
                        ({key})
                      </span>
                      {dayOrders.length > 0 && (
                        <>
                          <span style={{ 
                            margin: '0 6px', 
                            color: allCompleted ? '#2e7d32' : '#000' 
                          }}>—</span>
                          <span style={{ 
                            color: allCompleted ? '#2e7d32' : '#b36b00', 
                            fontWeight: 700, 
                            fontSize: 16 
                          }}>
                            {getTotalArea(dayOrders).toFixed(2)} кв.м.
                          </span>
                        </>
                      )}
                    </div>

                    {/* Список заказов */}
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: 8,
                      flexGrow: 1,
                    }}>
                      {dayOrders.length === 0 ? (
                        <div style={{ 
                          color: 'var(--color-text-secondary)', 
                          fontSize: 13,
                          textAlign: 'center',
                          padding: '20px 0',
                        }}>
                          Нет заказов
                        </div>
                      ) : dayOrders.map(order => {
                        const isIssued = String(order["Статус"] ?? '').toLowerCase() === 'выдан';
                        const isReady = String(order["Статус"] ?? '').toLowerCase() === 'готов';
                        
                        return (
                          <div
                            key={order._id || order["Номер заказа"] || Math.random()}
                            style={{
                              border: isReady ? '2px solid #4caf50' : '1px solid var(--color-card-border)',
                              borderRadius: 7,
                              background: getStatusColor(order["Статус"]),
                              color: 'var(--color-text)',
                              boxShadow: 'var(--shadow-xs)',
                              padding: 10,
                              fontSize: 14,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4,
                              position: 'relative',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: 4, 
                              marginBottom: 2,
                              flexWrap: 'wrap',
                            }}>
                              {/* Чекбокс */}
                              <input
                                type="checkbox"
                                checked={isIssued}
                                onChange={(e) => handleCheckboxChange(order, e.target.checked)}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  width: 10,
                                  height: 10,
                                  marginRight: 8,
                                  cursor: 'pointer',
                                  accentColor: '#1976d2'
                                }}
                                title={isIssued ? "Снять отметку о выдаче (статус изменится на '-')" : "Отметить как выданный"}
                              />
                              
                              {/* Номер заказа */}
                              <span style={{ 
                                fontWeight: 700, 
                                color: '#1976d2', 
                                fontSize: 18 
                              }}>
                                {order["Номер заказа"] || ''}
                              </span>

                              {/* Материалы */}
                              {order["Материал"] && String(order["Материал"]).split(',').map((mat, idx, arr) => {
                                const m = mat.trim().toLowerCase();
                                let bg = '#f5f5f5';
                                if (m.includes('18')) bg = '#fff3e0';
                                else if (m.includes('10')) bg = '#e3f2fd';
                                else if (m.includes('лдсп')) bg = '#f3e6ff';
                                return (
                                  <span key={idx} style={{
                                    background: bg,
                                    color: '#b23c17',
                                    fontStyle: 'italic',
                                    fontWeight: 400,
                                    fontSize: 11,
                                    padding: '1px 7px',
                                    borderRadius: 6,
                                    marginRight: idx !== arr.length - 1 ? 4 : 0
                                  }}>
                                    {mat.trim()}
                                  </span>
                                );
                              })}

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

                            {/* Детали заказа */}
                            <div style={{ fontSize: 11, marginBottom: 2 }}>
                              {order["Фрезеровка"] ? `. ${order["Фрезеровка"]}` : ''}
                              {order["Площадь заказа"] ? ` – ${String(order["Площадь заказа"]).replace(',', '.')} кв.м.` : ''}
                            </div>
                            
                            {/* Дополнительная информация */}
                            <div style={{ fontSize: 12, color: '#888' }}>
                              {order["Планируемая дата выдачи"] ? `${order["Планируемая дата выдачи"]} • ` : ''}
                              {order["Клиент"] || ''}
                              {order["Оплата"] ? ` • ${order["Оплата"]}` : ''}
                            </div>
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
    </div>
  );
}
