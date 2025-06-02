import { useAuth0 } from '@auth0/auth0-react';
import Layout from '../components/Layout';

export default function Home() {
  const { 
    isLoading, 
    isAuthenticated, 
    loginWithRedirect, 
    user 
  } = useAuth0();

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner">
          <span className="material-icons">hourglass_empty</span>
          <h3>Загрузка...</h3>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-screen">
        <div className="auth-container">
          <div className="auth-header">
            <span className="material-icons">table_view</span>
            <h1>Google Table Hub</h1>
          </div>
          <div className="auth-content">
            <h2>Добро пожаловать!</h2>
            <p>Для доступа к Google таблице необходимо войти в систему</p>
            <button
              className="auth-button primary"
              onClick={() => loginWithRedirect()}
            >
              <span className="material-icons">login</span>
              Войти
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <Layout isAuthenticated={isAuthenticated} user={user} />;
} 