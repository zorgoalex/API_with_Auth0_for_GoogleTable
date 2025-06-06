import React, { useEffect, useState } from 'react';
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
  const ordersMap = groupOrdersByDate(orders);

  const handleCheckboxChange = (order, isChecked) => {
    if (!onOrderStatusUpdate) return;
    const newStatus = isChecked ? 'Выдан' : '-';
    const fieldsToUpdate = { "Статус": newStatus };
    onOrderStatusUpdate(order._id, fieldsToUpdate);
  };

  return (
    <div
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
      <div
        style={{
          overflowX: 'auto',
          overflowY: 'auto',
          width: '100%',
          flexGrow: 1,
          minHeight: 0,
        }}
        className="kanban-columns-scroller"
      >
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${days.length}, 260px)`,
          gap: 16,
          minWidth: days.length * 260 + (days.length - 1) * 16
        }}>
          {days.map((day) => {
            const key = formatDateUniversal(day);
            const dayOrders = ordersMap[key] || [];
            return (
              <div
                key={key}
                style={{
                  background: 'var(--color-surface)',
                  borderRadius: 10,
                  boxShadow: 'var(--shadow-md)',
                  padding: 12,
                  minHeight: 120,
                  border: '1px solid #bfc3c9'
                }}
              >
                <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 16 }}>
                  <span style={{ fontWeight: 700, color: '#000' }}>{capitalizeFirst(getDayName(day))}</span>
                  <span style={{ marginLeft: 4, color: '#000' }}>({key})</span>
                  {dayOrders.length > 0 && (
                    <>
                      <span style={{ margin: '0 6px', color: '#000' }}>—</span>
                      <span style={{ color: '#b36b00', fontWeight: 700, fontSize: 16 }}>
                        {getTotalArea(dayOrders).toFixed(2)} кв.м.
                      </span>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dayOrders.length === 0 ? (
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Нет заказов</div>
                  ) : dayOrders.map(order => {
                    const isIssued = String(order["Статус"] ?? '').toLowerCase() === 'выдан';
                    return (
                      <div
                        key={order._id || order["Номер заказа"] || Math.random()}
                        style={{
                          border: String(order["Статус"] ?? '').toLowerCase() === 'готов'
                            ? '2px solid #4caf50'
                            : '1px solid var(--color-card-border)',
                          borderRadius: 7,
                          background: getStatusColor(order["Статус"]),
                          color: 'var(--color-text)',
                          boxShadow: 'var(--shadow-xs)',
                          padding: 10,
                          fontSize: 14,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          position: 'relative'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          {/* Чекбокс */}
                          <input
                            type="checkbox"
                            checked={isIssued}
                            onChange={(e) => handleCheckboxChange(order, e.target.checked)}
                            onClick={(e) => e.stopPropagation()} // Чтобы клик по чекбоксу не влиял на другие события карточки
                            style={{
                              width: 10,
                              height: 10,
                              marginRight: 8,
                              cursor: 'pointer',
                              accentColor: '#1976d2' // Цвет галочки
                            }}
                            title={isIssued ? "Снять отметку о выдаче (статус изменится на '-')" : "Отметить как выданный"}
                          />
                          <span style={{ fontWeight: 700, color: '#1976d2', fontSize: 18 }}>
                            {order["Номер заказа"] || ''}
                          </span>
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
                              }}>{mat.trim()}</span>
                            );
                          })}
                          {(() => {
                            const ot = String(order["Отрисован"] ?? '').toLowerCase();
                            return (ot.includes('отрис') || ot.includes('cad')) && (
                              <span style={{ color: '#1976d2', fontWeight: 700, fontSize: 22, marginLeft: 4, lineHeight: 1 }}>О</span>
                            );
                          })()}
                        </div>
                        <div style={{ fontSize: 11, marginBottom: 2 }}>
                          {order["Фрезеровка"] ? `. ${order["Фрезеровка"]}` : ''}
                          {order["Площадь заказа"] ? ` – ${String(order["Площадь заказа"]).replace(',', '.')} кв.м.` : ''}
                        </div>
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
      </div>
    </div>
  );
}
