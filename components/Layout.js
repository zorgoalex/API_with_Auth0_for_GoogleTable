import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useAuth0 } from '@auth0/auth0-react';
// import dynamic from 'next/dynamic'; // <--- Комментируем динамический импорт
import DataTable from './DataTable';    // <--- Добавляем статический импорт
import KanbanBoard from './KanbanBoard';
// import React from 'react'; // <--- УДАЛЯЕМ ЭТОТ ЛИШНИЙ ИМПОРТ

// Динамический импорт DataTable
/* // <--- Комментируем блок dynamic
const DataTable = dynamic(() => import('./DataTable'), {
  ssr: false
});
*/

// Функция для генерации дней на основе заказов (как в next-5.md)
function initializeDays(orders = []) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Начинаем за 5 дней до сегодня
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 5);
  
  // Находим максимальную планируемую дату из заказов
  let maxPlannedDate = new Date(today);
  
  if (orders.length > 0) {
    maxPlannedDate = orders.reduce((maxDate, order) => {
      const plannedDateStr = order["Планируемая дата выдачи"];
      if (!plannedDateStr) return maxDate;
      
      // Парсим дату в формате DD.MM.YYYY
      const [day, month, year] = plannedDateStr.split('.');
      if (day && month && year) {
        const plannedDate = new Date(year, month - 1, day);
        plannedDate.setHours(0, 0, 0, 0);
        return plannedDate > maxDate ? plannedDate : maxDate;
      }
      return maxDate;
    }, new Date(today));
  }
  
  // Конечная дата: максимальная планируемая дата + 1 день
  let endDate = new Date(maxPlannedDate);
  endDate.setDate(maxPlannedDate.getDate() + 1);
  
  // Если конечная дата - воскресенье, сдвигаем до понедельника
  while (endDate.getDay() === 0) {
    endDate.setDate(endDate.getDate() + 1);
  }
  
  // Генерируем массив дней, пропуская воскресенья
  const days = [];
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    if (currentDate.getDay() !== 0) { // Пропускаем воскресенья (0)
      days.push(new Date(currentDate));
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return days;
}

export default function Layout({ isAuthenticated, user }) {
  const { logout } = useAuth0();
  const [currentView, setCurrentView] = useState('kanban');
  const [sidebarOpen, setSidebarOpen] = useState(false); // для мобильных
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true); // для десктопа - по умолчанию свернут
  const [generatedDays, setGeneratedDays] = useState([]);
  const [allOrders, setAllOrders] = useState([]); // <--- Новое состояние для заказов
  const dataTableRef = useRef(null); // <--- Ref для DataTable

  useEffect(() => {
    // Начальная генерация дней при монтировании компонента
    setGeneratedDays(initializeDays([])); 
  }, []);

  // Пересчитываем дни при изменении заказов
  useEffect(() => {
    if (allOrders.length > 0) {
      const newDays = initializeDays(allOrders);
      setGeneratedDays(newDays);
    }
  }, [allOrders]);

  // Функция для обновления заказов из DataTable - теперь мемоизирована
  const handleOrdersUpdate = useCallback((updatedOrders) => {
    if (Array.isArray(updatedOrders)) {
      // console.log('Layout: Updating allOrders', updatedOrders);
      setAllOrders(updatedOrders);
    }
  }, []); // Массив зависимостей пуст, т.к. setAllOrders стабилен

  // Функция для обновления статуса заказа через DataTable - также мемоизируем, если она использует состояния Layout
  // В данном случае она использует dataTableRef, который стабилен, и не использует состояния Layout, которые меняются
  // Но для хорошей практики, если бы она зависела от чего-то из Layout, мы бы добавили это в зависимости.
  const handleOrderStatusUpdate = useCallback(async (orderId, fieldsToUpdate, options = {}) => {
    console.log('handleOrderStatusUpdate called for orderId:', orderId, 'Fields:', fieldsToUpdate);
    console.log('dataTableRef.current in handleOrderStatusUpdate:', dataTableRef.current);
    if (dataTableRef.current && typeof dataTableRef.current.updateOrderFields === 'function') {
      try {
        await dataTableRef.current.updateOrderFields(orderId, fieldsToUpdate, options);
        console.log(`Order ${orderId} status update triggered with fields:`, fieldsToUpdate);
      } catch (error) {
        console.error('Error triggering order status update:', error);
        throw error;
      }
    } else {
      console.warn('DataTable ref or updateOrderFields method not available.');
      throw new Error('DataTable not available for status update');
    }
  }, []); // dataTableRef стабилен, поэтому массив зависимостей пуст

  // Функция для перемещения заказа между датами
  const handleOrderMove = useCallback(async (order, sourceDateStr, targetDateStr) => {
    console.log('handleOrderMove called:', order, sourceDateStr, targetDateStr);
    
    if (dataTableRef.current && typeof dataTableRef.current.updateOrderFields === 'function') {
      try {
        // Обновляем планируемую дату выдачи заказа с таймаутом
        const fieldsToUpdate = { 
          "Планируемая дата выдачи": targetDateStr 
        };
        
        // Добавляем таймаут в 20 секунд
        const updatePromise = dataTableRef.current.updateOrderFields(order._id, fieldsToUpdate, { immediate: true });
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Update timeout')), 20000)
        );
        
        await Promise.race([updatePromise, timeoutPromise]);
        console.log(`Order ${order["Номер заказа"]} moved from ${sourceDateStr} to ${targetDateStr}`);
      } catch (error) {
        console.error('Error moving order:', error);
        throw error; // Перебрасываем ошибку для обработки в KanbanBoard
      }
    } else {
      console.warn('DataTable ref or updateOrderFields method not available.');
      throw new Error('DataTable not available for order move');
    }
  }, []); // dataTableRef стабилен, поэтому массив зависимостей пуст

  // Обработка изменения размера окна
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setSidebarOpen(false); // закрываем мобильный сайдбар
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Закрытие сайдбара при клике вне его (только для мобильных)
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (window.innerWidth <= 768 && !e.target.closest('.sidebar') && !e.target.closest('.hamburger')) {
        setSidebarOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);
  
  const switchView = (viewType) => {
    setCurrentView(viewType);
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  };

  const toggleSidebar = () => {
    if (window.innerWidth <= 768) {
      // На мобильных - открываем/закрываем
      setSidebarOpen(!sidebarOpen);
    } else {
      // На десктопе - сворачиваем/разворачиваем
      setSidebarCollapsed(!sidebarCollapsed);
    }
  };

  const titles = {
    'table': 'Таблица',
    'kanban': 'Канбан',
    'settings': 'Проекты'
  };

  return (
    <div className="app-container">
      {/* Сайдбар */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar__header">
          <div className="logo">
            <span className="material-icons">table_view</span>
            <span className="logo-text">Google Table Hub</span>
          </div>
        </div>
        <nav className="sidebar__nav">
          <button 
            className={`nav-item ${currentView === 'table' ? 'active' : ''}`}
            onClick={() => switchView('table')}
          >
            <span className="material-icons">table_rows</span>
            <span className="nav-text">Таблица</span>
          </button>
          <button 
            className={`nav-item ${currentView === 'kanban' ? 'active' : ''}`}
            onClick={() => switchView('kanban')}
          >
            <span className="material-icons">view_kanban</span>
            <span className="nav-text">Канбан</span>
          </button>
          <button 
            className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => switchView('settings')}
          >
            <span className="material-icons">settings</span>
            <span className="nav-text">Проекты</span>
          </button>
        </nav>
      </aside>

      {/* Основной контент */}
      <main className="main-content">
        {/* Хедер */}
        <header className="header">
          <button className="hamburger" onClick={toggleSidebar}>
            <span className="material-icons">menu</span>
          </button>
          <h1 className="header__title">
            {titles[currentView] || 'Google Table Hub'}
          </h1>
          <div className="header__actions">
            {isAuthenticated && user && (
              <>
                <div className="user-info">
                  <span className="user-name">{user.name || user.email}</span>
                  {user.picture && (
                    <Image
                      src={user.picture}
                      alt={user.name || user.email || 'User avatar'}
                      className="user-avatar"
                      width={32}
                      height={32}
                      unoptimized
                    />
                  )}
                </div>
                <button
                  className="logout-button"
                  onClick={() => logout({
                    logoutParams: {
                      returnTo: window.location.origin
                    }
                  })}
                  title="Выйти из системы"
                >
                  <span className="material-icons">logout</span>
                </button>
              </>
            )}
          </div>
        </header>

        {/* Контент */}
        <div className="content">
          {/* Вид таблицы */}
          <div className={`view ${currentView === 'table' ? 'active' : ''}`}>
            {isAuthenticated ? (
              <DataTable 
                ref={dataTableRef}
                onOrdersChange={handleOrdersUpdate} 
              />
            ) : (
              <div className="auth-placeholder">
                <div className="auth-message">
                  <span className="material-icons">lock</span>
                  <h3>Требуется авторизация</h3>
                  <p>Для доступа к таблице необходимо войти в систему</p>
                </div>
              </div>
            )}
          </div>

          {/* Вид Канбан */}
          <div className={`view ${currentView === 'kanban' ? 'active' : ''}`}>
            {isAuthenticated ? (
              <KanbanBoard 
                days={generatedDays} 
                orders={allOrders} 
                onOrderStatusUpdate={handleOrderStatusUpdate}
                onOrderMove={handleOrderMove}
              />
            ) : (
              <div className="analytics-placeholder">
                <div className="placeholder-content">
                  <span className="material-icons">view_kanban</span>
                  <h3>Канбан</h3>
                  <p>Для доступа к канбан-доске необходимо войти в систему</p>
                </div>
              </div>
            )}
          </div>

          {/* Вид настроек */}
          <div className={`view ${currentView === 'settings' ? 'active' : ''}`}>
            <div className="settings-placeholder">
              <div className="placeholder-content">
                <span className="material-icons">settings</span>
                <h3>Проекты</h3>
                <p>Здесь будут карточки проектов</p>
              </div>
            </div>
          </div>
        </div>

        {/* Подвал */}
        <footer className="footer">
          <div className="footer__content">
            <div className="footer__text">
              Google Table Hub © 2024
            </div>
            <div className="footer__version">
              v1.0.0
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
