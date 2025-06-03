import React, { useEffect, useState } from 'react';

// Хелпер для форматирования даты в DD.MM.YYYY
function formatDate(date) {
  if (typeof date === 'string') return date;
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

// Хелпер — сокращенное название дня недели (русский)
const WEEKDAYS = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
function getDayName(date) {
  const d = new Date(date);
  return WEEKDAYS[d.getDay()];
}

// Генерация дат: 3 дня назад — сегодня — 3 дня вперёд, без воскресений
function generateDays(centerDate, range = 3) {
  let days = [];
  const today = new Date(centerDate);
  today.setHours(0, 0, 0, 0);
  for (let offset = -range; offset <= range; offset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    if (d.getDay() !== 0) days.push(new Date(d)); // без воскресений
  }
  return days;
}

// Группировка заказов по plannedDate ("DD.MM.YYYY")
function groupOrdersByDate(orders) {
  const map = {};
  for (const order of orders) {
    const key = formatDate(order.plannedDate);
    if (!map[key]) map[key] = [];
    map[key].push(order);
  }
  return map;
}

export default function KanbanBoard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [days, setDays] = useState([]);

  useEffect(() => {
    // Загружаем данные с API
    async function fetchOrders() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/sheet');
        if (!res.ok) throw new Error('Ошибка загрузки данных');
        const data = await res.json();
        setOrders(data);
        // days: от 3 назад до 3 вперёд
        setDays(generateDays(new Date(), 3));
      } catch (e) {
        setError(e.message);
      }
      setLoading(false);
    }
    fetchOrders();
  }, []);

  const ordersMap = groupOrdersByDate(orders);

  return (
    <div style={{ width: '100%', overflowX: 'auto', padding: 16 }}>
      <h2 style={{ marginBottom: 24, fontWeight: 600 }}>Канбан-доска заказов</h2>
      {loading ? (
        <div>Загрузка…</div>
      ) : error ? (
        <div style={{ color: 'var(--color-error)', marginBottom: 16 }}>{error}</div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${days.length}, minmax(220px, 1fr))`,
          gap: 16
        }}>
          {days.map((day) => {
            const key = formatDate(day);
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
                  border: '1px solid var(--color-border)'
                }}
              >
                <div style={{ marginBottom: 8, fontWeight: 500 }}>
                  <span>{getDayName(day)}</span>
                  <span style={{ marginLeft: 6, color: 'var(--color-text-secondary)' }}>{key}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dayOrders.length === 0 ? (
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Нет заказов</div>
                  ) : dayOrders.map(order => (
                    <div
                      key={order._id || order.orderNumber || Math.random()}
                      style={{
                        border: '1px solid var(--color-card-border)',
                        borderRadius: 7,
                        background: order.status?.toLowerCase() === 'выдан' ? 'var(--color-success)' : 'var(--color-background)',
                        color: 'var(--color-text)',
                        boxShadow: 'var(--shadow-xs)',
                        padding: 10,
                        fontSize: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>Заказ №{order.orderNumber}</div>
                      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{order.customerName || order.name || '-'}</div>
                      <div>Площадь: {order.area ? String(order.area).replace(',', '.') : '?'} м²</div>
                      <div style={{ fontSize: 13 }}>
                        Статус: {order.status || '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
