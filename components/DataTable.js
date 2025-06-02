// Импорт стилей Handsontable
import 'handsontable/dist/handsontable.full.min.css';
import Handsontable from 'handsontable';
import { HotTable } from '@handsontable/react';
import { registerAllModules } from 'handsontable/registry';
import { useEffect, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import dynamic from 'next/dynamic';

// Регистрация всех модулей Handsontable
registerAllModules();

export default function DataTable({ onDataUpdate, sharedData, sharedLoading, sharedError }) {
  const hotTableRef = useRef(null);
  const writeTimeoutRef = useRef(null);
  const pendingChanges = useRef([]);
  const eventSourceRef = useRef(null); // Только для SSE EventSource
  const pollingIntervalRef = useRef(null); // Только для polling interval
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastModified, setLastModified] = useState(null);
  const [lastUpdateTime, setLastUpdateTime] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const { getAccessTokenSilently } = useAuth0();

  // Константы
  const WRITE_DEBOUNCE = 500; // 0.5 сек дебаунс для записей
  const FALLBACK_POLL_INTERVAL = 5000; // Fallback polling каждые 5 сек

  // Экспортируем функцию обновления данных глобально для доступа из других компонентов
  useEffect(() => {
    window.refreshDataTable = () => loadData(false);
    return () => {
      delete window.refreshDataTable;
    };
  }, []);

  // Обновляем родительский компонент при изменении данных
  useEffect(() => {
    if (onDataUpdate) {
      onDataUpdate(data, loading, error);
    }
  }, [data, loading, error, onDataUpdate]);

  // Загрузка данных
  const loadData = async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      if (!showLoader) setIsPolling(true);

      const token = await getAccessTokenSilently();
      
      const response = await fetch('/api/sheet', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 429) {
        // Обработка rate limiting
        console.warn('Rate limit hit, pausing polling for 5 minutes');
        stopPolling();
        setTimeout(() => {
          startPolling();
        }, 5 * 60 * 1000); // 5 минут
        throw new Error('Rate limit exceeded');
      }

      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }

      const rows = await response.json();
      
      // Проверяем изменения данных
      const newDataHash = JSON.stringify(rows);
      if (newDataHash !== lastModified) {
        setData(rows);
        setLastModified(newDataHash);
        setLastUpdateTime(new Date());
        console.log('Data updated from Google Sheets');
      }

      setError(null); // Сбрасываем ошибку при успешном запросе
    } catch (err) {
      console.error('Error loading data:', err);
      if (showLoader) setError(err.message);
    } finally {
      if (showLoader) setLoading(false);
      if (!showLoader) setIsPolling(false);
    }
  };

  // Запуск polling
  const startPolling = () => {
    // Останавливаем предыдущий интервал если есть
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Запускаем новый интервал
    pollingIntervalRef.current = setInterval(() => {
      loadData(false); // Без показа loader'а для фонового обновления
    }, FALLBACK_POLL_INTERVAL);

    console.log(`Polling started with ${FALLBACK_POLL_INTERVAL / 1000}s interval (${60 / (FALLBACK_POLL_INTERVAL / 1000)} requests/min)`);
  };

  // Остановка polling
  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      console.log('Polling stopped');
    }
  };

  useEffect(() => {
    // Первоначальная загрузка данных
    loadData(true).then(async () => {
      // Всегда запускаем polling каждые 5 сек
      startPolling();

      // Дополнительно пытаемся настроить push уведомления для мгновенных обновлений
      const pushSetup = await setupPushNotifications();
      if (pushSetup) {
        // Если push уведомления настроены, подключаемся к SSE для мгновенных обновлений
        await connectToSSE();
      }
    });

    // Cleanup при размонтировании
    return () => {
      stopPolling();
      stopSSE();
      
      // Очищаем таймер записей
      if (writeTimeoutRef.current) {
        clearTimeout(writeTimeoutRef.current);
      }
      
      // Принудительно сохраняем pending изменения
      if (pendingChanges.current.length > 0) {
        flushPendingChanges();
      }
    };
  }, []);

  // Обработка потери/возврата фокуса окна
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // При потере фокуса - останавливаем соединения
        stopPolling();
        stopSSE();
      } else {
        // При возврате фокуса - обновляем данные и возобновляем соединения
        loadData(false);
        
        // Всегда перезапускаем polling
        startPolling();
        
        // Пытаемся восстановить SSE если push включен
        if (pushEnabled) {
          connectToSSE();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pushEnabled]);

  // API запросы
  const makeAPIRequest = async (url, options = {}) => {
    const token = await getAccessTokenSilently();
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
      }
    });
  };

  // Дебаунсинг записей (batch операции)
  const flushPendingChanges = async () => {
    if (pendingChanges.current.length === 0) return;

    const changes = [...pendingChanges.current];
    pendingChanges.current = [];

    try {
      // Группируем изменения по строкам
      const groupedChanges = changes.reduce((acc, change) => {
        const rowIndex = change.rowIndex;
        const columnName = data.length > 0 ? Object.keys(data[0])[change.column] : null;
        
        if (!columnName || columnName === '_id') return acc;
        
        if (!acc[rowIndex]) {
          acc[rowIndex] = { rowIndex, data: {} };
        }
        
        const changeData = { [columnName]: change.value };
        Object.assign(acc[rowIndex].data, changeData);
        
        return acc;
      }, {});

      // Batch update всех изменений
      for (const { rowIndex, data: changeData } of Object.values(groupedChanges)) {
        const rowId = data[rowIndex]._id;
        
        const response = await makeAPIRequest(`/api/sheet?rowId=${rowId}`, {
          method: 'PUT',
          body: JSON.stringify(updateData)
        });

        if (!response.ok) {
          throw new Error('Failed to update batch');
        }
      }

      // Обновляем локальные данные
      const newData = [...data];
      Object.values(groupedChanges).forEach(({ rowIndex, data: changeData }) => {
        newData[rowIndex] = { ...newData[rowIndex], ...changeData };
      });
      setData(newData);
      
      console.log(`Batch updated ${Object.keys(groupedChanges).length} rows`);
    } catch (err) {
      console.error('Error in batch update:', err);
      // При ошибке перезагружаем данные
      loadData(false);
    }
  };

  // Обработчик изменения данных с дебаунсингом
  const handleAfterChange = async (changes, source) => {
    if (!changes || source === 'loadData') return;

    changes.forEach(([row, column, oldValue, newValue]) => {
      if (oldValue !== newValue) {
        // Добавляем изменение в очередь
        pendingChanges.current.push({
          rowIndex: row,
          column,
          value: newValue,
          timestamp: Date.now()
        });
      }
    });

    // Сбрасываем предыдущий таймер
    if (writeTimeoutRef.current) {
      clearTimeout(writeTimeoutRef.current);
    }

    // Устанавливаем новый таймер
    writeTimeoutRef.current = setTimeout(() => {
      flushPendingChanges();
    }, WRITE_DEBOUNCE);
  };

  // Обработчик создания новой строки
  const handleAfterCreateRow = async (index, amount) => {
    try {
      // Создаем пустую строку с базовыми данными
      const emptyRowData = {};
      if (data.length > 0) {
        Object.keys(data[0]).forEach(key => {
          if (key !== '_id') {
            emptyRowData[key] = '';
          }
        });
      }

      const response = await makeAPIRequest('/api/sheet', {
        method: 'POST',
        body: JSON.stringify(emptyRowData)
      });

      if (!response.ok) {
        throw new Error('Failed to create row');
      }

      const newRow = await response.json();
      
      // Обновляем данные
      const newData = [...data];
      newData.splice(index, 0, newRow);
      setData(newData);
      
    } catch (err) {
      console.error('Error creating row:', err);
      // Удаляем созданную строку при ошибке
      const hot = hotTableRef.current?.hotInstance;
      if (hot) {
        hot.alter('remove_row', index, amount);
      }
    }
  };

  // Обработчик удаления строки
  const handleAfterRemoveRow = async (index, amount) => {
    try {
      const rowsToDelete = data.slice(index, index + amount);
      
      for (const row of rowsToDelete) {
        const response = await makeAPIRequest(`/api/sheet?rowId=${row._id}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          throw new Error('Failed to delete row');
        }
      }

      // Обновляем локальные данные
      const newData = [...data];
      newData.splice(index, amount);
      setData(newData);
      
    } catch (err) {
      console.error('Error deleting row:', err);
      // Перезагружаем данные при ошибке
      loadData();
    }
  };

  // Настройка push уведомлений
  const setupPushNotifications = async () => {
    try {
      const token = await getAccessTokenSilently();
      const response = await fetch('/api/setup-push', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Push notifications enabled:', data);
        setPushEnabled(true);
        return true;
      } else {
        console.warn('Failed to setup push notifications, falling back to polling');
        return false;
      }
    } catch (error) {
      console.error('Error setting up push notifications:', error);
      return false;
    }
  };

  // Подключение к SSE
  const connectToSSE = async () => {
    try {
      console.log('SSE: Getting access token...');
      const token = await getAccessTokenSilently();

      // Закрываем предыдущее соединение
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // Очищаем pending reconnect
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      // Создаем новое SSE соединение с токеном в query параметре
      const sseUrl = `/api/webhook/drive-changes?token=${encodeURIComponent(token)}`;
      console.log('SSE: Connecting to:', sseUrl);
      
      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('SSE: Connection opened successfully');
        setConnectionStatus('connected');
        setError(null);
        reconnectAttemptsRef.current = 0; // Reset on successful connection
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('SSE: Message received:', data);
          
          if (data.type === 'connected') {
            console.log('SSE: Connection established, client ID:', data.clientId);
          } else if (data.type === 'sheet-changed') {
            console.log('SSE: Sheet changed notification, refreshing data...');
            setIsPolling(true);
            loadData(false).finally(() => setIsPolling(false));
          } else if (data.type === 'ping') {
            console.log('SSE: Ping received, connection alive');
          } else {
            console.log('SSE: Unknown message type:', data.type);
          }
        } catch (error) {
          console.error('SSE: Error parsing message:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE: Connection error:', error);
        console.log('SSE: ReadyState:', eventSource.readyState);
        
        setConnectionStatus('error');
        
        // Если соединение закрыто или слишком много попыток подключения
        if (eventSource.readyState === EventSource.CLOSED || reconnectAttemptsRef.current > 10) {
          console.log('SSE: Connection permanently closed or too many attempts, disabling push notifications');
          setPushEnabled(false);
          return;
        }

        // Exponential backoff для reconnect
        reconnectAttemptsRef.current++;
        const backoffDelay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000); // Max 30s
        
        console.log(`SSE: Attempting to reconnect in ${backoffDelay}ms (attempt ${reconnectAttemptsRef.current})`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (pushEnabled) { // Only reconnect if still in push mode
            connectToSSE();
          }
        }, backoffDelay);
      };

    } catch (error) {
      console.error('SSE: Error setting up connection:', error);
      setConnectionStatus('error');
      
      // Exponential backoff for setup errors too
      if (reconnectAttemptsRef.current > 5) {
        console.log('SSE: Too many setup failures, disabling push notifications');
        setPushEnabled(false);
        return;
      }
      
      reconnectAttemptsRef.current++;
      const backoffDelay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
      console.log(`SSE: Retrying setup in ${backoffDelay}ms`);
      
      reconnectTimeoutRef.current = setTimeout(() => {
        if (pushEnabled) {
          connectToSSE();
        }
      }, backoffDelay);
    }
  };

  // Остановка SSE
  const stopSSE = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setConnectionStatus('disconnected');
      console.log('SSE disconnected');
    }
  };

  // Дополнительная проверка данных
  if (!data || !Array.isArray(data)) {
    return <div>Нет данных для отображения</div>;
  }

  const columns = data.length > 0 ? Object.keys(data[0]).filter(key => key !== '_id') : [];

  // Если нет колонок, показываем сообщение
  if (columns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <p>Таблица пуста</p>
        <button 
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={() => loadData(true)}
        >
          Обновить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Статус индикатор */}
      <div className="flex items-center justify-between bg-white p-4 rounded shadow">
        <div className="flex items-center space-x-4">
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center"
            onClick={() => loadData(false)}
            disabled={isPolling}
          >
            <span className="material-icons mr-2">refresh</span>
            {isPolling ? 'Обновление...' : 'Обновить'}
          </button>
          
          <div className="text-sm text-gray-600">
            {lastUpdateTime ? 
              `Последнее обновление: ${lastUpdateTime.toLocaleTimeString()}` : 
              'Не обновлялось'
            }
          </div>
          
          {pushEnabled && (
            <div className="flex items-center">
              <div className={`w-2 h-2 rounded-full mr-2 ${
                connectionStatus === 'connected' ? 'bg-green-500' : 
                connectionStatus === 'error' ? 'bg-red-500' : 
                'bg-gray-500'
              }`} />
              <span className="text-sm text-gray-600">
                Push: {connectionStatus === 'connected' ? 'Подключен' : 
                       connectionStatus === 'error' ? 'Ошибка' : 
                       'Отключен'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Таблица */}
      <div className="bg-white rounded shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Загрузка данных...</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-red-500">Ошибка: {error}</div>
          </div>
        ) : (
          <HotTable
            ref={hotTableRef}
            data={data}
            columns={columns.map(col => ({ data: col, title: col }))}
            stretchH="all"
            autoWrapRow={true}
            autoWrapCol={true}
            height="auto"
            licenseKey="non-commercial-and-evaluation"
            colHeaders={true}
            rowHeaders={true}
            manualRowResize={true}
            manualColumnResize={true}
            contextMenu={true}
            filters={true}
            dropdownMenu={true}
            afterChange={handleAfterChange}
            afterCreateRow={handleAfterCreateRow}
            afterRemoveRow={handleAfterRemoveRow}
          />
        )}
      </div>
    </div>
  );
}