import { Auth0Provider } from '@auth0/auth0-react';
import Head from 'next/head';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Auth0Provider
        domain={process.env.AUTH0_ISSUER_BASE_URL?.replace('https://', '')}
        clientId={process.env.AUTH0_CLIENT_ID}
        authorizationParams={{
          redirect_uri: typeof window !== 'undefined' ? window.location.origin : '',
          audience: `https://${process.env.AUTH0_ISSUER_BASE_URL?.replace('https://', '')}/api/v2/`,
          scope: 'openid profile email'
        }}
      >
        <Component {...pageProps} />
      </Auth0Provider>
    </>
  );
} 