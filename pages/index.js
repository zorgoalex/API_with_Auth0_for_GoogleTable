import { useAuth0 } from '@auth0/auth0-react';
import dynamic from 'next/dynamic';

// Динамический импорт для избежания проблем с SSR
const DataTable = dynamic(() => import('../components/DataTable'), {
  ssr: false
});

export default function Home() {
  const { 
    isLoading, 
    isAuthenticated, 
    loginWithRedirect, 
    logout, 
    user 
  } = useAuth0();

  if (isLoading) {
    return (
      <div className="container">
        <div className="loading">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="header">
        <h1 className="title">
          {isAuthenticated ? `Привет, ${user?.name || user?.email}!` : 'Google Таблица'}
        </h1>
        
        <div>
          {isAuthenticated ? (
            <button
              className="auth-button logout-button"
              onClick={() => logout({
                logoutParams: {
                  returnTo: window.location.origin
                }
              })}
            >
              Выйти
            </button>
          ) : (
            <button
              className="auth-button"
              onClick={() => loginWithRedirect()}
            >
              Войти
            </button>
          )}
        </div>
      </header>

      {isAuthenticated ? (
        <DataTable />
      ) : (
        <div className="table-container">
          <div className="loading">
            Для доступа к таблице необходимо войти в систему
          </div>
        </div>
      )}
    </div>
  );
} 