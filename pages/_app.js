import { Auth0Provider } from '@auth0/auth0-react';
import 'handsontable/dist/handsontable.full.min.css';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  return (
    <Auth0Provider
      domain={process.env.AUTH0_ISSUER_BASE_URL?.replace('https://', '')}
      clientId={process.env.AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: typeof window !== 'undefined' ? window.location.origin : '',
        audience: process.env.AUTH0_AUDIENCE,
        scope: 'openid profile email'
      }}
    >
      <Component {...pageProps} />
    </Auth0Provider>
  );
} 