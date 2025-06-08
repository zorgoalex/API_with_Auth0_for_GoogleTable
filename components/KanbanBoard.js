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
  const [containerWidth, setContainerWidth] = useState(1200);
  const containerRef = useRef(null);
  const columnRefs = useRef({});
  
  const ordersMap = groupOrdersByDate(orders);

  // Константы для адаптивного дизайна
  const DESKTOP_COLUMN_WIDTH = 260;
  const MOBILE_MIN_COLUMN_WIDTH = 140;
  const MOBILE_MAX_COLUMN_WIDTH = 160;
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
                
                return (
                  <div
                    key={key}
                    ref={el => columnRefs.current[key] = el}
                    style={{
                      background: allCompleted ? '#e8f5e8' : 'var(--color-surface)',
                      borderRadius: isMobile ? 8 : 10,
                      boxShadow: 'var(--shadow-md)',
                      padding: isMobile ? 8 : 12,
                      minHeight: isMobile ? 100 : 120,
                      border: allCompleted ? '2px solid #4caf50' : '1px solid #bfc3c9',
                      display: 'flex',
                      flexDirection: 'column',
                      fontSize: isMobile ? 12 : 14,
                    }}
                  >
                    {/* Заголовок дня */}
                    <div style={{ 
                      marginBottom: isMobile ? 6 : 8, 
                      fontWeight: 500, 
                      fontSize: isMobile ? 13 : 16,
                      lineHeight: isMobile ? 1.2 : 1.5,
                    }}>
                      <div style={{ marginBottom: isMobile ? 2 : 0 }}>
                        <span style={{ 
                          fontWeight: 700, 
                          color: allCompleted ? '#2e7d32' : '#000' 
                        }}>
                          {capitalizeFirst(getDayName(day))}
                        </span>
                        <span style={{ 
                          marginLeft: 4, 
                          color: allCompleted ? '#2e7d32' : '#000',
                          fontSize: isMobile ? 11 : 'inherit'
                        }}>
                          ({key})
                        </span>
                      </div>
                      {dayOrders.length > 0 && (
                        <div style={{ fontSize: isMobile ? 12 : 16 }}>
                          <span style={{ 
                            color: allCompleted ? '#2e7d32' : '#b36b00', 
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
                        
                        return (
                          <div
                            key={order._id || order["Номер заказа"] || Math.random()}
                            style={{
                              border: isReady ? '2px solid #4caf50' : '1px solid var(--color-card-border)',
                              borderRadius: isMobile ? 5 : 7,
                              background: getStatusColor(order["Статус"]),
                              color: 'var(--color-text)',
                              boxShadow: 'var(--shadow-xs)',
                              padding: isMobile ? 6 : 10,
                              fontSize: isMobile ? 11 : 14,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: isMobile ? 3 : 4,
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
                                color: '#1976d2', 
                                fontSize: isMobile ? 14 : 18,
                                lineHeight: 1
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
                            <div style={{ 
                              fontSize: isMobile ? 10 : 11, 
                              marginBottom: 2,
                              lineHeight: 1.2
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
