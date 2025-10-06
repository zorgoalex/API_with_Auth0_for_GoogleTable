import React, { useState, useEffect, useRef } from 'react';

// Порядок отображения свойств в меню
const PROPERTY_ORDER = [
  'Фрезеровка',
  'Оплата',
  'Статус',
  'CAD файлы',
  'Материал',
  'Закуп пленки',
  'Распил',
  'Шлифовка',
  'Пленка',
  'Упаковка',
  'Выдан'
];

// Маппинг отображаемых имен на имена колонок в таблице
const PROPERTY_COLUMN_MAP = {
  // Если отображаемое имя отличается от названия колонки в таблице
};

/**
 * Компонент контекстного меню для карточки заказа
 * @param {boolean} isOpen - Открыто ли меню
 * @param {object} position - Позиция меню { x, y }
 * @param {object} order - Заказ, для которого открыто меню
 * @param {object} statuses - Доступные статусы для каждого свойства
 * @param {function} onClose - Callback для закрытия меню
 * @param {function} onStatusChange - Callback для изменения статуса: (property, newStatus)
 * @param {boolean} isMobile - Мобильное устройство или нет
 */
export default function OrderContextMenu({
  isOpen,
  position = { x: 0, y: 0 },
  order,
  statuses = {},
  onClose,
  onStatusChange,
  isMobile = false
}) {
  const [activeSubmenu, setActiveSubmenu] = useState(null);
  const [submenuPosition, setSubmenuPosition] = useState({ x: 0, y: 0 });
  const [isSubmenuPinned, setIsSubmenuPinned] = useState(false); // Зафиксировано ли подменю кликом
  const menuRef = useRef(null);
  const submenuRef = useRef(null);

  // Закрытие меню при клике вне его
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        (!submenuRef.current || !submenuRef.current.contains(e.target))
      ) {
        onClose();
      }
    };

    // Небольшая задержка, чтобы не закрыть меню сразу после открытия
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Закрытие меню при нажатии Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (activeSubmenu) {
          setActiveSubmenu(null);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, activeSubmenu, onClose]);

  // Проверяем, выходит ли меню за пределы экрана
  useEffect(() => {
    if (!isOpen || !menuRef.current || isMobile) return;

    const rect = menuRef.current.getBoundingClientRect();
    const menuEl = menuRef.current;

    // Корректируем позицию, если меню выходит за правую границу
    if (rect.right > window.innerWidth) {
      menuEl.style.left = `${window.innerWidth - rect.width - 10}px`;
    }

    // Корректируем позицию, если меню выходит за нижнюю границу
    if (rect.bottom > window.innerHeight) {
      menuEl.style.top = `${window.innerHeight - rect.height - 10}px`;
    }
  }, [isOpen, isMobile]);

  // Ранний выход, если меню закрыто (ПОСЛЕ всех хуков!)
  if (!isOpen || !order) return null;

  // Фильтруем свойства, для которых есть статусы
  const availableProperties = PROPERTY_ORDER.filter(prop => {
    const columnName = PROPERTY_COLUMN_MAP[prop] || prop;
    return statuses[columnName] && statuses[columnName].length > 0;
  });

  const handlePropertyHover = (property, event) => {
    if (isMobile || isSubmenuPinned) return; // На мобильных hover не работает, если подменю зафиксировано - не меняем

    const rect = event.currentTarget.getBoundingClientRect();
    setActiveSubmenu(property);
    setSubmenuPosition({
      x: rect.right + 2, // Уменьшили зазор с 5px до 2px
      y: rect.top
    });
  };

  const handlePropertyMouseLeave = () => {
    if (isMobile || isSubmenuPinned) return; // Не скрываем, если зафиксировано
    // Небольшая задержка перед скрытием, чтобы успеть навести на подменю
    setTimeout(() => {
      if (!isSubmenuPinned && !submenuRef.current?.matches(':hover')) {
        setActiveSubmenu(null);
      }
    }, 100);
  };

  const handlePropertyClick = (property, event) => {
    event.stopPropagation();

    if (isMobile) {
      // Мобильная логика
      if (activeSubmenu === property) {
        setActiveSubmenu(null);
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      setActiveSubmenu(property);

      // Проверяем, сколько места есть снизу
      const spaceBelow = window.innerHeight - rect.bottom;
      const estimatedSubmenuHeight = 300; // примерная высота подменю

      // Если места снизу мало, показываем подменю сверху от элемента
      if (spaceBelow < estimatedSubmenuHeight) {
        setSubmenuPosition({
          x: position.x,
          y: Math.max(10, rect.top - estimatedSubmenuHeight - 10) // 10px отступ от верха экрана
        });
      } else {
        setSubmenuPosition({
          x: position.x,
          y: rect.bottom + 5
        });
      }
    } else {
      // Desktop логика: клик фиксирует подменю
      if (activeSubmenu === property && isSubmenuPinned) {
        // Повторный клик - скрываем
        setActiveSubmenu(null);
        setIsSubmenuPinned(false);
      } else {
        // Первый клик - фиксируем
        const rect = event.currentTarget.getBoundingClientRect();
        setActiveSubmenu(property);
        setIsSubmenuPinned(true);
        setSubmenuPosition({
          x: rect.right + 2,
          y: rect.top
        });
      }
    }
  };

  const handleStatusClick = (property, status) => {
    const columnName = PROPERTY_COLUMN_MAP[property] || property;
    console.log('OrderContextMenu: handleStatusClick called', { property, columnName, status, order });

    setIsSubmenuPinned(false); // Сбрасываем фиксацию
    onClose(); // Закрываем меню сразу

    // Вызываем callback после закрытия (order еще доступен из props)
    onStatusChange(columnName, status);
  };

  // Позиционирование меню с учетом границ экрана
  const menuStyle = {
    position: 'fixed',
    left: isMobile ? '50%' : position.x,
    top: isMobile ? '50%' : position.y,
    transform: isMobile ? 'translate(-50%, -50%)' : 'none',
    zIndex: 10000,
  };

  return (
    <>
      {/* Основное меню */}
      <div
        ref={menuRef}
        style={menuStyle}
        className="order-context-menu"
      >
        <div style={{
          background: 'white',
          borderRadius: isMobile ? 12 : 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          minWidth: isMobile ? 280 : 220,
          maxWidth: isMobile ? 320 : 280,
          overflow: 'hidden',
          border: '1px solid #d0d0d0'
        }}>
          {/* Заголовок */}
          <div style={{
            padding: isMobile ? '14px 16px' : '10px 12px',
            borderBottom: '1px solid #e0e0e0',
            fontWeight: 600,
            fontSize: isMobile ? 16 : 14,
            background: '#f8f9fa',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>Заказ {order['Номер заказа']}</span>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 20,
                cursor: 'pointer',
                color: '#666',
                padding: 0,
                lineHeight: 1,
                width: 24,
                height: 24
              }}
            >
              ×
            </button>
          </div>

          {/* Список свойств */}
          <div style={{
            maxHeight: isMobile ? '60vh' : '400px',
            overflowY: 'auto'
          }}>
            {availableProperties.map((property) => {
              const columnName = PROPERTY_COLUMN_MAP[property] || property;
              const currentValue = order[columnName] || '-';
              const isActive = activeSubmenu === property;

              return (
                <div
                  key={property}
                  onMouseEnter={(e) => handlePropertyHover(property, e)}
                  onMouseLeave={handlePropertyMouseLeave}
                  onClick={(e) => handlePropertyClick(property, e)}
                  style={{
                    padding: isMobile ? '14px 16px' : '10px 12px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #f0f0f0',
                    background: isActive ? '#f0f7ff' : 'white',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: isMobile ? 15 : 14,
                    transition: 'background 0.15s'
                  }}
                  onMouseOver={(e) => {
                    if (!isActive) e.currentTarget.style.background = '#f8f9fa';
                  }}
                  onMouseOut={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'white';
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontWeight: 500, color: '#424242' }}>{property}</div>
                    <div style={{
                      fontSize: isMobile ? 13 : 12,
                      color: '#757575',
                      fontStyle: currentValue === '-' ? 'italic' : 'normal'
                    }}>
                      {currentValue}
                    </div>
                  </div>
                  <span style={{
                    color: '#999',
                    fontSize: isMobile ? 18 : 16,
                    marginLeft: 8
                  }}>
                    ›
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Подменю со статусами */}
      {activeSubmenu && (
        <div
          ref={submenuRef}
          onMouseEnter={() => {
            // Когда наводим на подменю, не скрываем его
            if (!isMobile) {
              setActiveSubmenu(activeSubmenu);
            }
          }}
          onMouseLeave={() => {
            // Когда уходим с подменю, скрываем его (если не зафиксировано)
            if (!isMobile && !isSubmenuPinned) {
              setActiveSubmenu(null);
            }
          }}
          style={{
            position: 'fixed',
            left: submenuPosition.x,
            top: submenuPosition.y,
            zIndex: 10001,
          }}
          className="order-context-submenu"
        >
          <div style={{
            background: 'white',
            borderRadius: isMobile ? 12 : 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            minWidth: isMobile ? 200 : 160,
            maxWidth: isMobile ? 280 : 220,
            overflow: 'hidden',
            border: '1px solid #d0d0d0'
          }}>
            {/* Заголовок подменю (только для мобильных) */}
            {isMobile && (
              <div style={{
                padding: '12px 14px',
                borderBottom: '1px solid #e0e0e0',
                fontWeight: 600,
                fontSize: 14,
                background: '#f8f9fa',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>{activeSubmenu}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveSubmenu(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 20,
                    cursor: 'pointer',
                    color: '#666',
                    padding: 0,
                    lineHeight: 1
                  }}
                >
                  ×
                </button>
              </div>
            )}

            {/* Список статусов */}
            <div style={{
              maxHeight: isMobile ? '50vh' : '300px',
              overflowY: 'auto'
            }}>
              {(statuses[PROPERTY_COLUMN_MAP[activeSubmenu] || activeSubmenu] || []).map((status) => {
                const columnName = PROPERTY_COLUMN_MAP[activeSubmenu] || activeSubmenu;
                const currentValue = order[columnName] || '-';
                const isSelected = currentValue === status;

                return (
                  <div
                    key={status}
                    onClick={() => handleStatusClick(activeSubmenu, status)}
                    style={{
                      padding: isMobile ? '12px 14px' : '9px 12px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f5f5f5',
                      background: isSelected ? '#e3f2fd' : 'white',
                      fontSize: isMobile ? 14 : 13,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'background 0.15s'
                    }}
                    onMouseOver={(e) => {
                      if (!isSelected) e.currentTarget.style.background = '#f8f9fa';
                    }}
                    onMouseOut={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'white';
                    }}
                  >
                    <span style={{ color: '#1976d2', fontWeight: 500 }}>{status}</span>
                    {isSelected && (
                      <span style={{
                        color: '#1976d2',
                        fontWeight: 'bold',
                        fontSize: isMobile ? 16 : 14
                      }}>
                        ✓
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
