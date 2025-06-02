import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="ru">
      <Head>
        {/* Google Search Console verification */}
        <meta name="google-site-verification" content="PZey3Epku-MzPhMwYbglNejvRJYEMrjyxbFXFM2T2VQ" />
        
        {/* Material Icons */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons" />
        
        {/* Дополнительные meta теги */}
        <meta name="description" content="Google Таблица с Auth0 авторизацией и real-time обновлениями" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
} 