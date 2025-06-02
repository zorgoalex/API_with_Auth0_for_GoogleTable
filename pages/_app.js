import '../styles/globals.css';
import '../styles/kanban.css';
import { UserProvider } from '@auth0/nextjs-auth0/client';

export default function App({ Component, pageProps }) {
  return (
    <UserProvider
      domain={process.env.AUTH0_ISSUER_BASE_URL?.replace('https://', '')}
      clientId={process.env.AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: typeof window !== 'undefined' ? window.location.origin : process.env.AUTH0_BASE_URL,
        audience: `https://${process.env.AUTH0_ISSUER_BASE_URL?.replace('https://', '')}/api/v2/`,
        scope: 'openid profile email offline_access'
      }}
      cacheLocation="localstorage"
      useRefreshTokens={true}
    >
      <Component {...pageProps} />
    </UserProvider>
  );
}