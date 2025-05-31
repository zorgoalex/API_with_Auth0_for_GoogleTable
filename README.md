# Google Таблица с Auth0

Веб-приложение для работы с Google Sheets через Auth0 авторизацию и Handsontable интерфейс.

## Настройка

### 1. Google Service Account

1. Создайте проект в [Google Cloud Console](https://console.cloud.google.com/)
2. Включите Google Sheets API и Google Drive API
3. Создайте сервисный аккаунт и сгенерируйте JSON ключ
4. Поделитесь вашей Google таблицей с email сервисного аккаунта (права "Редактор")
5. Скопируйте ID таблицы из URL

### 2. Auth0

1. Зарегистрируйтесь в [Auth0](https://auth0.com/)
2. Создайте приложение типа "Single Page Application"
3. В настройках добавьте:
   - Allowed Callback URLs: `http://localhost:3000` (и ваш продакшн домен)
   - Allowed Logout URLs: `http://localhost:3000` (и ваш продакшн домен)
   - Allowed Web Origins: `http://localhost:3000` (и ваш продакшн домен)

### 3. Переменные окружения

Создайте файл `.env.local`:

```bash
# Auth0
AUTH0_SECRET=your-secret-32-characters-minimum
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret

# Google Sheets
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour-private-key-here\n-----END PRIVATE KEY-----"
GOOGLE_SHEET_ID=your-google-sheet-id
```

## Установка и запуск

```bash
# Установка зависимостей
npm install

# Запуск в режиме разработки
npm run dev

# Сборка для продакшна
npm run build
npm start
```

## Деплой на Vercel

1. Загрузите проект на GitHub
2. Подключите репозиторий к Vercel
3. Добавьте переменные окружения в настройках Vercel
4. Обновите AUTH0_BASE_URL на ваш продакшн домен

## Функционал

- Авторизация через Auth0
- Просмотр и редактирование Google таблицы
- Добавление и удаление строк
- Изменения синхронизируются с Google Sheets в реальном времени

## Структура проекта

```
├── components/
│   └── DataTable.js     # Компонент Handsontable
├── lib/
│   ├── auth.js          # Утилиты Auth0
│   └── google-sheets.js # Работа с Google Sheets
├── pages/
│   ├── api/
│   │   └── sheet.js     # API endpoint
│   ├── _app.js          # Главный компонент с Auth0Provider
│   └── index.js         # Главная страница
├── styles/
│   └── globals.css      # Глобальные стили
├── .env.example         # Пример переменных окружения
├── next.config.js       # Конфигурация Next.js
└── package.json         # Зависимости
``` 