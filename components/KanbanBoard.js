import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';

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

const statusConfig = [
  {
    key: 'Фрезеровка',
    label: 'Фрезеровка',
    statuses: ['Модерн', 'Фрезеровка', 'Черновой', 'Выборка', 'Краска']
  },
  {
    key: 'Оплата',
    label: 'Оплата',
    statuses: ['не оплачен', 'в долг', 'частично', 'оплачен', 'за счет фирмы']
  },
  {
    key: 'Статус',
    label: 'Статус',
    statuses: ['Готов', 'Выдан', 'Распилен', '-']
  },
  {
    key: 'CAD файлы',
    label: 'CAD файлы',
    statuses: ['Отрисован', '-']
  },
  {
    key: 'Материал',
    label: 'Материал',
    statuses: ['16мм', '18мм', '8мм', '10мм', 'ЛДСП']
  },
  {
    key: 'Закуп пленки',
    label: 'Закуп пленки',
    statuses: ['Готов', '-']
  },
  {
    key: 'Распил',
    label: 'Распил',
    statuses: ['Готов', '-']
  },
  {
    key: 'Шлифовка',
    label: 'Шлифовка',
    statuses: ['Готов', '-']
  },
  {
    key: 'Пленка',
    label: 'Пленка',
    statuses: ['Готов', '-']
  },
  {
    key: 'Упаковка',
    label: 'Упаковка',
    statuses: ['Готов', '-']
  },
  {
    key: 'Выдан',
    label: 'Выдан',
    statuses: ['Готов', '-']
  }
];
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

export default function KanbanBoard({ orders = [], days = [], onOrderStatusUpdate, onOrderMove }) {
  const [containerWidth, setContainerWidth] = useState(1200);
  const [draggedOrder, setDraggedOrder] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [optimisticOrders, setOptimisticOrders] = useState([]); // Локальная копия заказов для оптимистичных обновлений
  const [pendingMoves, setPendingMoves] = useState(new Set()); // Отслеживание заказов в процессе перемещения
  const [notification, setNotification] = useState(null); // Уведомления об ошибках
  const [contextMenuState, setContextMenuState] = useState({ open: false });
  const containerRef = useRef(null);
  const columnRefs = useRef({});
  const longPressTimerRef = useRef(null);
  const lastPointerDownRef = useRef({});
  const activeContextOrderId = contextMenuState.order?._id;
  const notificationTimerRef = useRef(null);
  const contextMenuRef = useRef(null);

  // Используем оптимистичные заказы, если они есть, иначе исходные
  const currentOrders = optimisticOrders.length > 0 ? optimisticOrders : orders;
  const ordersMap = groupOrdersByDate(currentOrders);

  const derivedStatusOptions = useMemo(() => {
    const uniqueValues = new Map();
    statusConfig.forEach(({ key }) => {
      uniqueValues.set(key, new Set());
    });

    currentOrders.forEach(order => {
      statusConfig.forEach(({ key }) => {
        const value = order[key];
        if (value && uniqueValues.has(key)) {
          uniqueValues.get(key).add(String(value));
        }
      });
    });

    return statusConfig.map(cfg => {
      const discovered = Array.from(uniqueValues.get(cfg.key) || [])
        .filter(value => value && !cfg.statuses.includes(value));
      return {
        ...cfg,
        options: [...cfg.statuses, ...discovered]
      };
    });
  }, [currentOrders]);

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
  }, [orders, pendingMoves]);

  // Функция для показа уведомлений
  const showNotification = useCallback((message, type = 'error') => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
    setNotification({ message, type });
    notificationTimerRef.current = setTimeout(() => {
      setNotification(null);
      notificationTimerRef.current = null;
    }, 4000);
  }, []);

  // Константы для адаптивного дизайна
  const DESKTOP_COLUMN_WIDTH = 260;
  const MOBILE_MIN_COLUMN_WIDTH = 126;
  const MOBILE_MAX_COLUMN_WIDTH = 144;
  const COLUMN_GAP = 16;
  const CONTAINER_PADDING = 32; // padding слева и справа

  // Детекция мобильных устройств
  const isMobile = containerWidth <= 768;

  const closeContextMenu = useCallback(() => {
    setContextMenuState({ open: false });
  }, []);

  const updateOrderOptimistically = useCallback((orderId, key, value) => {
    setOptimisticOrders(prev => {
      const base = prev && prev.length > 0 ? prev : orders;
      return base.map(item => (
        item._id === orderId ? { ...item, [key]: value } : item
      ));
    });
  }, [orders]);

  const handleStatusChange = useCallback(async (order, key, value, options = {}) => {
    if (!order || !key || !onOrderStatusUpdate) {
      return;
    }

    const previousValue = order[key];
    const currentValue = String(previousValue ?? '').toLowerCase();
    const nextValue = String(value ?? '').toLowerCase();
    if (currentValue === nextValue) {
      if (options.closeAfter) {
        closeContextMenu();
      }
      return;
    }

    updateOrderOptimistically(order._id, key, value);

    setContextMenuState(prev => {
      if (!prev.open || !prev.order || prev.order._id !== order._id) {
        return prev;
      }
      return {
        ...prev,
        pendingField: key,
        order: {
          ...prev.order,
          [key]: value
        }
      };
    });

    try {
      const updatePromise = onOrderStatusUpdate(order._id, { [key]: value }, { immediate: true });
      if (updatePromise && typeof updatePromise.then === 'function') {
        await updatePromise;
      }

      if (options.closeAfter) {
        closeContextMenu();
      }
    } catch (error) {
      updateOrderOptimistically(order._id, key, previousValue);

      setContextMenuState(prev => {
        if (!prev.open || !prev.order || prev.order._id !== order._id) {
          return prev;
        }
        return {
          ...prev,
          order: {
            ...prev.order,
            [key]: previousValue
          }
        };
      });

      const label = options.label || key;
      showNotification(`Не удалось обновить «${label}»: ${error.message || error}`, 'error');
    } finally {
      setContextMenuState(prev => {
        if (!prev.open) {
          return prev;
        }
        return {
          ...prev,
          pendingField: null
        };
      });
    }
  }, [closeContextMenu, onOrderStatusUpdate, showNotification, updateOrderOptimistically]);

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

  useEffect(() => cancelLongPress, [cancelLongPress]);

  // Закрытие меню по глобальным событиям
  useEffect(() => {
    if (!contextMenuState.open) return;

    const handleGlobalClick = (event) => {
      const menuElement = document.querySelector('.context-menu');
      const mobileSheet = document.querySelector('.context-menu-sheet');
      if (menuElement && menuElement.contains(event.target)) {
        return;
      }
      if (mobileSheet && mobileSheet.contains(event.target)) {
        return;
      }
      closeContextMenu();
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };

    const handleScroll = () => {
      closeContextMenu();
    };

    document.addEventListener('click', handleGlobalClick, true);
    document.addEventListener('keydown', handleEscape);
    const scroller = containerRef.current?.querySelector('.kanban-rows-scroller');
    scroller?.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.removeEventListener('click', handleGlobalClick, true);
      document.removeEventListener('keydown', handleEscape);
      scroller?.removeEventListener('scroll', handleScroll);
    };
  }, [contextMenuState.open, closeContextMenu]);

  useEffect(() => {
    if (!contextMenuState.open || !activeContextOrderId) return;
    const freshOrder = currentOrders.find(item => item._id === activeContextOrderId);
    if (!freshOrder) return;

    setContextMenuState(prev => {
      if (!prev.open || !prev.order || prev.order._id !== freshOrder._id) {
        return prev;
      }
      return {
        ...prev,
        order: freshOrder
      };
    });
  }, [contextMenuState.open, activeContextOrderId, currentOrders]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (contextMenuState.open && !contextMenuState.isMobileMenu) {
      window.requestAnimationFrame(() => {
        const menuNode = contextMenuRef.current;
        if (!menuNode) {
          return;
        }
        const firstButton = menuNode.querySelector('button.context-menu-option:not([disabled])');
        const target = firstButton || menuNode;
        target.focus({ preventScroll: true });
      });
    }
  }, [contextMenuState.open, contextMenuState.isMobileMenu, contextMenuState.order]);

  useEffect(() => () => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
      notificationTimerRef.current = null;
    }
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

  const menuOrderNumber = contextMenuState.order?.["Номер заказа"];
  const menuTitle = menuOrderNumber || 'Заказ';
  const menuTitleId = contextMenuState.order ? `context-menu-title-${contextMenuState.order._id}` : 'context-menu-title';
  const sheetTitleId = contextMenuState.order ? `context-menu-sheet-title-${contextMenuState.order._id}` : 'context-menu-sheet-title';
  const isMenuBusy = Boolean(contextMenuState.pendingField);

  const handleCheckboxChange = (order, isChecked) => {
    if (!onOrderStatusUpdate) return;
    const newStatus = isChecked ? 'Выдан' : '-';
    const fieldsToUpdate = { "Статус": newStatus };
    onOrderStatusUpdate(order._id, fieldsToUpdate);
  };

  const openDesktopContextMenu = useCallback((order, position) => {
    if (!order) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const approxWidth = 320;
    const approxHeight = 380;
    const offset = 8;

    let clickX = position.clientX;
    let clickY = position.clientY;

    if (clickX + approxWidth + offset > viewportWidth) {
      clickX = Math.max(offset, viewportWidth - approxWidth - offset);
    }
    if (clickY + approxHeight + offset > viewportHeight) {
      clickY = Math.max(offset, viewportHeight - approxHeight - offset);
    }

    setContextMenuState({
      open: true,
      x: clickX,
      y: clickY,
      order,
      isMobileMenu: false,
      pendingField: null
    });
  }, []);

  const handleContextMenu = (event, order, isPendingMove) => {
    if (isPendingMove || !onOrderStatusUpdate || isMobile) {
      return;
    }
    event.preventDefault();
    cancelLongPress();

    openDesktopContextMenu(order, { clientX: event.clientX, clientY: event.clientY });
  };

  const startLongPress = (event, order, isPendingMove) => {
    if (!isMobile || isPendingMove) return;
    if (event.pointerType && event.pointerType !== 'touch') return;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    lastPointerDownRef.current = {
      id: order._id,
      pointerId: event.pointerId ?? 'touch',
      x: event.clientX,
      y: event.clientY
    };
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        setContextMenuState({
          open: true,
          order,
          isMobileMenu: true,
          pendingField: null
        });
      }, 400);
  };

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    lastPointerDownRef.current = {};
  }, []);

  const handlePointerUp = () => {
    cancelLongPress();
  };

  const handlePointerMove = (event) => {
    const info = lastPointerDownRef.current;
    if (!info.pointerId) return;
    const currentX = event.clientX ?? info.x;
    const currentY = event.clientY ?? info.y;
    const delta = Math.abs(currentX - info.x) + Math.abs(currentY - info.y);
    if (delta > 10) {
      cancelLongPress();
    }
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

  const handleCardKeyDown = (event, order, isPendingMove) => {
    if (isPendingMove || !onOrderStatusUpdate || isMobile) {
      return;
    }

    if (
      event.key === 'ContextMenu' ||
      (event.shiftKey && event.key === 'F10') ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      openDesktopContextMenu(order, {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      });
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
            "Планируемая дата выдачи": formattedTargetDate
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
    onOrderMove(order, sourceDate, formattedTargetDate)
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
                  "Планируемая дата выдачи": sourceDate // Возвращаем исходную дату
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
          role="status"
          aria-live="polite"
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
                        
                        return (
                          <div
                            key={order._id || order["Номер заказа"] || Math.random()}
                            className={`kanban-card ${isPending ? 'pending-update' : ''}`}
                            draggable={!isPending}
                            onDragStart={(e) => handleDragStart(e, order, key)}
                            onDragEnd={handleDragEnd}
                            onContextMenu={(e) => handleContextMenu(e, order, isPending)}
                            onPointerDown={(e) => startLongPress(e, order, isPending)}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={cancelLongPress}
                            onPointerMove={handlePointerMove}
                            onKeyDown={(e) => handleCardKeyDown(e, order, isPending)}
                            tabIndex={isPending ? -1 : 0}
                            aria-disabled={isPending}
                            aria-haspopup={!isMobile ? 'menu' : undefined}
                            aria-label={`Заказ ${order["Номер заказа"] || ''}. Открыть меню статусов`}
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
                              {order["Планируемая дата выдачи"] ? `${order["Планируемая дата выдачи"]} • ` : ''}
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
      {contextMenuState.open && contextMenuState.order && (
        isMobile ? (
          createPortal(
            <div className="context-menu-backdrop" role="presentation" onClick={closeContextMenu}>
              <div
                className="context-menu-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby={sheetTitleId}
                aria-busy={isMenuBusy}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="context-menu-sheet__header">
                  <div>
                    <strong id={sheetTitleId}>Настройки заказа</strong>
                    <div className="context-menu-sheet__subtitle">
                      {menuTitle}
                    </div>
                  </div>
                  <button className="context-menu__close" onClick={closeContextMenu} aria-label="Закрыть меню">
                    ✕
                  </button>
                </div>
                {isMenuBusy && (
                  <div className="context-menu__hint" role="status" aria-live="polite">
                    Сохранение...
                  </div>
                )}
                <div className="context-menu-sheet__content">
                  {derivedStatusOptions.map(section => {
                    const optionsId = contextMenuState.order
                      ? `context-menu-options-${contextMenuState.order._id}-${section.key}`
                      : `context-menu-options-${section.key}`;
                    return (
                      <details key={section.key} className="context-menu-accordion" defaultOpen>
                        <summary aria-controls={optionsId}>{section.label}</summary>
                        <div
                          className="context-menu-accordion__options"
                          id={optionsId}
                          role="radiogroup"
                          aria-label={`Статусы для ${section.label}`}
                        >
                          {section.options.map(option => {
                            const isActive = String(contextMenuState.order[section.key] ?? '').toLowerCase() === String(option).toLowerCase();
                            return (
                              <button
                                key={option}
                                type="button"
                                className={`context-menu-option ${isActive ? 'active' : ''}`}
                                onClick={() => handleStatusChange(contextMenuState.order, section.key, option, { label: section.label })}
                                disabled={isMenuBusy}
                                role="radio"
                                aria-checked={isActive}
                                aria-disabled={isMenuBusy}
                              >
                                {option}
                              </button>
                            );
                          })}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body
          )
        ) : (
          createPortal(
            <div
              className="context-menu"
              ref={contextMenuRef}
              tabIndex={-1}
              role="menu"
              aria-labelledby={menuTitleId}
              aria-busy={isMenuBusy}
              style={{
                top: contextMenuState.y,
                left: contextMenuState.x
              }}
            >
              <div className="context-menu__title" id={menuTitleId}>
                {menuTitle}
              </div>
              {isMenuBusy && (
                <div className="context-menu__hint" role="status" aria-live="polite">
                  Сохранение...
                </div>
              )}
              {derivedStatusOptions.map(section => {
                const optionsId = contextMenuState.order
                  ? `context-menu-options-${contextMenuState.order._id}-${section.key}`
                  : `context-menu-options-${section.key}`;
                return (
                  <div key={section.key} className="context-menu__item" role="presentation">
                    <div className="context-menu__item-label">{section.label}</div>
                    <div className="context-menu__submenu" role="group" aria-label={`Статусы для ${section.label}`} id={optionsId}>
                      {section.options.map(option => {
                        const isActive = String(contextMenuState.order[section.key] ?? '').toLowerCase() === String(option).toLowerCase();
                        return (
                          <button
                            key={option}
                            type="button"
                            className={`context-menu-option ${isActive ? 'active' : ''}`}
                            onClick={() => handleStatusChange(contextMenuState.order, section.key, option, { closeAfter: true, label: section.label })}
                            disabled={isMenuBusy}
                            role="menuitemradio"
                            aria-checked={isActive}
                            aria-disabled={isMenuBusy}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>,
            document.body
          )
        )
      )}
    </div>
  );
}
