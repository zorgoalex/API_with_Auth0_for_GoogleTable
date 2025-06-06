import { useState, useEffect, useRef, useCallback } from 'react';
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

// Эту функцию можно вынести в утилиты, если она будет использоваться еще где-то
function generateDays(centerDateInput, range = 3) {
  let days = [];
  // Убедимся, что centerDateInput валидна, иначе используем текущую дату
  const centerDate = centerDateInput instanceof Date && !isNaN(centerDateInput) ? centerDateInput : new Date();
  centerDate.setHours(0, 0, 0, 0);

  for (let offset = -range; offset <= range; offset++) {
    const d = new Date(centerDate);
    d.setDate(centerDate.getDate() + offset);
    // Пропускаем воскресенья, если это правило все еще актуально
    // if (d.getDay() !== 0) { 
    //   days.push(new Date(d));
    // }
    // Пока что будем добавлять все дни, включая ВС, для простоты. 
    // Если нужно исключать ВС, раскомментируйте проверку выше.
    days.push(new Date(d));
  }
  return days;
}

export default function Layout({ isAuthenticated, user }) {
  const { logout } = useAuth0();
  const [currentView, setCurrentView] = useState('table');
  const [sidebarOpen, setSidebarOpen] = useState(false); // для мобильных
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true); // для десктопа - по умолчанию свернут
  const [generatedDays, setGeneratedDays] = useState([]);
  const [allOrders, setAllOrders] = useState([]); // <--- Новое состояние для заказов
  const dataTableRef = useRef(null); // <--- Ref для DataTable

  useEffect(() => {
    // Генерируем дни один раз при монтировании компонента
    // Можно использовать любую дату как центральную, например, new Date() для текущей
    setGeneratedDays(generateDays(new Date(), 3)); 
  }, []);

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
  const handleOrderStatusUpdate = useCallback(async (orderId, fieldsToUpdate) => {
    console.log('handleOrderStatusUpdate called for orderId:', orderId, 'Fields:', fieldsToUpdate);
    console.log('dataTableRef.current in handleOrderStatusUpdate:', dataTableRef.current);
    if (dataTableRef.current && typeof dataTableRef.current.updateOrderFields === 'function') {
      try {
        await dataTableRef.current.updateOrderFields(orderId, fieldsToUpdate);
        console.log(`Order ${orderId} status update triggered with fields:`, fieldsToUpdate);
      } catch (error) {
        console.error('Error triggering order status update:', error);
      }
    } else {
      console.warn('DataTable ref or updateOrderFields method not available.');
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
                    <img 
                      src={user.picture} 
                      alt="User" 
                      className="user-avatar"
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
