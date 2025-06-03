import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import dynamic from 'next/dynamic';
import KanbanBoard from './KanbanBoard'; // <--- добавили импорт

// Динамический импорт DataTable
const DataTable = dynamic(() => import('./DataTable'), {
  ssr: false
});

export default function Layout({ isAuthenticated, user }) {
  const { logout } = useAuth0();
  const [currentView, setCurrentView] = useState('table');
  const [sidebarOpen, setSidebarOpen] = useState(false); // для мобильных
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // для десктопа

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
              <DataTable />
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
              <KanbanBoard />
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
      </main>
    </div>
  );
}
