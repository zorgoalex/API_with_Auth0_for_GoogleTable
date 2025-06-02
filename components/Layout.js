import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import dynamic from 'next/dynamic';

// Динамический импорт DataTable
const DataTable = dynamic(() => import('./DataTable'), {
  ssr: false,
  loading: () => <div>Загрузка таблицы...</div>
});

// Динамический импорт KanbanView
const KanbanView = dynamic(() => import('./KanbanView'), {
  ssr: false,
  loading: () => <div>Загрузка канбан-доски...</div>
});

export default function Layout({ isAuthenticated, user }) {
  const { logout } = useAuth0();
  const [currentView, setCurrentView] = useState('table');
  const [sidebarOpen, setSidebarOpen] = useState(false); // для мобильных
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // для десктопа
  const [sharedData, setSharedData] = useState(null); // Общие данные для видов
  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedError, setSharedError] = useState(null);

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
  }, [sidebarOpen]);

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

  // Callback для обновления данных из дочерних компонентов
  const handleDataUpdate = (data, loading, error) => {
    setSharedData(data);
    setSharedLoading(loading);
    setSharedError(error);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Сайдбар */}
      <aside className={`sidebar bg-gray-800 text-white transition-all duration-300 z-20 ${
        sidebarOpen ? 'fixed inset-y-0 left-0 w-64' : ''
      } ${
        sidebarCollapsed ? 'w-16' : 'w-64'
      } ${
        !sidebarOpen && window.innerWidth <= 768 ? 'hidden' : ''
      } md:relative md:block`}>
        <div className="p-4">
          <h2 className={`text-xl font-semibold mb-6 ${sidebarCollapsed ? 'hidden' : ''}`}>
            Меню
          </h2>
          <nav className="space-y-2">
            <button
              className={`w-full text-left p-3 rounded hover:bg-gray-700 flex items-center ${
                currentView === 'table' ? 'bg-gray-700' : ''
              }`}
              onClick={() => switchView('table')}
            >
              <span className="material-icons mr-3">table_chart</span>
              <span className={sidebarCollapsed ? 'hidden' : ''}>Таблица</span>
            </button>
            
            <button
              className={`w-full text-left p-3 rounded hover:bg-gray-700 flex items-center ${
                currentView === 'kanban' ? 'bg-gray-700' : ''
              }`}
              onClick={() => switchView('kanban')}
            >
              <span className="material-icons mr-3">view_kanban</span>
              <span className={sidebarCollapsed ? 'hidden' : ''}>Канбан</span>
            </button>
            
            <button
              className={`w-full text-left p-3 rounded hover:bg-gray-700 flex items-center ${
                currentView === 'projects' ? 'bg-gray-700' : ''
              }`}
              onClick={() => switchView('projects')}
            >
              <span className="material-icons mr-3">folder</span>
              <span className={sidebarCollapsed ? 'hidden' : ''}>Проекты</span>
            </button>
            
            <button
              className={`w-full text-left p-3 rounded hover:bg-gray-700 flex items-center ${
                currentView === 'analytics' ? 'bg-gray-700' : ''
              }`}
              onClick={() => switchView('analytics')}
            >
              <span className="material-icons mr-3">analytics</span>
              <span className={sidebarCollapsed ? 'hidden' : ''}>Аналитика</span>
            </button>
            
            <button
              className={`w-full text-left p-3 rounded hover:bg-gray-700 flex items-center ${
                currentView === 'settings' ? 'bg-gray-700' : ''
              }`}
              onClick={() => switchView('settings')}
            >
              <span className="material-icons mr-3">settings</span>
              <span className={sidebarCollapsed ? 'hidden' : ''}>Настройки</span>
            </button>
          </nav>
        </div>
      </aside>

      {/* Основной контент */}
      <main className="flex-1 overflow-hidden">
        {/* Хедер */}
        <header className="bg-white shadow-md p-4 flex justify-between items-center">
          <div className="flex items-center">
            <button
              className="hamburger md:mr-4 p-2 rounded hover:bg-gray-200"
              onClick={toggleSidebar}
            >
              <span className="material-icons">menu</span>
            </button>
            <h1 className="text-xl font-semibold">
              {currentView === 'table' && 'Таблица данных'}
              {currentView === 'kanban' && 'Канбан-доска'}
              {currentView === 'projects' && 'Проекты'}
              {currentView === 'analytics' && 'Аналитика'}
              {currentView === 'settings' && 'Настройки'}
            </h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <button
              className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
              onClick={() => logout({
                returnTo: window.location.origin
              })}
            >
              Выйти
            </button>
          </div>
        </header>

        {/* Контент */}
        <div className="p-6 overflow-auto h-full">
          {/* Вид таблицы */}
          {currentView === 'table' && (
            <DataTable 
              onDataUpdate={handleDataUpdate}
              sharedData={sharedData}
              sharedLoading={sharedLoading}
              sharedError={sharedError}
            />
          )}
          
          {/* Вид канбан */}
          {currentView === 'kanban' && (
            <KanbanView 
              data={sharedData}
              loading={sharedLoading}
              error={sharedError}
              onDataUpdate={() => {
                // Триггерим обновление данных через DataTable
                if (window.refreshDataTable) {
                  window.refreshDataTable();
                }
              }}
            />
          )}
          
          {/* Вид проектов */}
          {currentView === 'projects' && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-2xl font-semibold mb-4">Проекты</h2>
              <p className="text-gray-600">Раздел в разработке...</p>
            </div>
          )}
          
          {/* Вид аналитики */}
          {currentView === 'analytics' && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-2xl font-semibold mb-4">Аналитика</h2>
              <p className="text-gray-600">Раздел в разработке...</p>
            </div>
          )}
          
          {/* Вид настроек */}
          {currentView === 'settings' && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-2xl font-semibold mb-4">Настройки</h2>
              <p className="text-gray-600">Раздел в разработке...</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}