import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { HotTable } from '@handsontable/react';
import { useAuth0 } from '@auth0/auth0-react';

// Импорт стилей Handsontable
import 'handsontable/dist/handsontable.full.min.css';

const DataTable = forwardRef(({ onOrdersChange }, ref) => {
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
  const [tableHeight, setTableHeight] = useState(500); // Добавляем состояние для высоты таблицы
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false); // Индикатор несохраненных изменений
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const { getAccessTokenSilently } = useAuth0();

  // Константы
  const WRITE_DEBOUNCE = 500; // 0.5 сек дебаунс для записей
  const FALLBACK_POLL_INTERVAL = 5000; // Fallback polling каждые 5 сек

  // Эффект для вызова onOrdersChange при изменении data
  useEffect(() => {
    if (typeof onOrdersChange === 'function') {
      onOrdersChange(data);
    }
  }, [data, onOrdersChange]); // Зависимости: data и onOrdersChange (теперь onOrdersChange стабилен)

  // Эффект для обновления размеров таблицы и попытки коррекции высоты wtHolder
  useEffect(() => {
    if (hotTableRef.current && hotTableRef.current.hotInstance) {
      const timer = setTimeout(() => {
        const hotInstance = hotTableRef.current?.hotInstance;
        if (hotInstance && hotInstance.rootElement) {
          // Вычисляем высоту на основе данных, а не контейнера
          const rowHeight = 23; // Примерная высота строки в Handsontable
          const headerHeight = 25; // Высота заголовка
          const calculatedHeight = Math.max(400, (data.length * rowHeight) + headerHeight + 50); // Минимум 400px
          
          setTableHeight(calculatedHeight);
          
          // Диагностика
          const wtHolder = hotInstance.rootElement.querySelector('.ht_master .wtHolder');
          if (wtHolder) {
            console.log('[DEBUG] .wtHolder:', {
              offsetHeight: wtHolder.offsetHeight,
              clientHeight: wtHolder.clientHeight,
              scrollHeight: wtHolder.scrollHeight,
              styleHeight: wtHolder.style.height,
              overflowY: window.getComputedStyle(wtHolder)['overflow-y'],
              calculatedHeight: calculatedHeight,
              dataLength: data.length,
            });
          }
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [data, loading]);

  // Обработчик изменения размера окна для пересчета высоты таблицы
  useEffect(() => {
    const handleResize = () => {
      if (hotTableRef.current && hotTableRef.current.hotInstance) {
        const hotInstance = hotTableRef.current.hotInstance;
        if (hotInstance && hotInstance.rootElement) {
          // Пересчитываем высоту на основе данных
          const rowHeight = 23;
          const headerHeight = 25;
          const calculatedHeight = Math.max(400, (data.length * rowHeight) + headerHeight + 50);
          
          setTableHeight(calculatedHeight);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [data]);

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
      
      if (!response.ok) {
        // Обработка rate limiting
        if (response.status === 429) {
          console.warn('Rate limit hit, pausing polling for 5 minutes');
          stopPolling();
          setTimeout(() => {
            startPolling();
          }, 300000);
          throw new Error('Rate limit exceeded');
        }
        throw new Error('Failed to fetch data');
      }
      
      const rows = await response.json();
      
      // Проверяем изменения данных
      const newDataHash = JSON.stringify(rows);
      if (lastModified !== newDataHash) {
        // Если есть несохраненные изменения, не затираем их
        if (pendingChanges.current.length > 0) {
          console.log('Skipping data update - pending changes exist:', pendingChanges.current);
          return;
        }
        
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
      stopSSE();
      stopPolling();
      // Очищаем таймер записей
      if (writeTimeoutRef.current) {
        clearTimeout(writeTimeoutRef.current);
      }
      // Принудительно сохраняем pending изменения
      if (pendingChanges.current.length > 0) {
        flushPendingChanges().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- выполняем инициализацию только один раз при монтировании
  }, []);

  // Обработка потери/возврата фокуса окна
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // При потере фокуса - останавливаем соединения
        stopSSE();
        stopPolling();
      } else {
        // При возврате фокуса - обновляем данные и возобновляем соединения
        loadData(false);
        
        // Всегда перезапускаем polling
        startPolling();
        
        if (pushEnabled) {
          connectToSSE();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- обработчик зависит от рефов и вспомогательных функций, которые намеренно не мемоизируются
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
    if (pendingChanges.current.length === 0) return true;
    
    const changesToFlush = [...pendingChanges.current]; // Копируем изменения для обработки
    pendingChanges.current = []; // Очищаем очередь
    
    console.log('Flushing changes:', changesToFlush);
    console.log('Current data state:', data.length, 'rows');

    try {
      for (const change of changesToFlush) {
        const { rowIndex, rowId, data: changeData } = change;
        
        console.log('Processing change:', { rowIndex, rowId, changeData });
        
        // Находим актуальные данные строки по ID
        const currentRowData = data.find(row => row._id === rowId);
        
        if (!currentRowData) {
          console.warn('Could not find row data for change:', change);
          console.warn('Available row IDs:', data.map(row => row._id).slice(0, 10), '...');
          continue;
        }

        // Создаем payload для API - убираем _id из корня
        const { _id, ...rowDataWithoutId } = currentRowData;
        const updatePayload = { 
          ...rowDataWithoutId, 
          ...changeData
          // Убираем rowId из body - будем передавать в URL
        };
        
        console.log('Sending update to API:', {
          rowId: rowId,
          payload: updatePayload,
          originalRowData: currentRowData
        });
        
        const response = await makeAPIRequest(`/api/sheet?rowId=${rowId}`, {
          method: 'PUT',
          body: JSON.stringify(updatePayload)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('API Error details:', {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
            sentPayload: updatePayload,
            rowId: rowId
          });
          throw new Error(`Failed to update row ${rowId}: ${response.status} ${errorText}`);
        }
        
        // Обновляем локальные данные после успешного API вызова
        setData(currentData => {
          return currentData.map(row => 
            row._id === rowId ? { ...row, ...changeData } : row
          );
        });
        
        console.log(`Row ${rowId} updated successfully locally and on server.`);
      }
      
      console.log(`Batch of ${changesToFlush.length} changes processed successfully.`);
      
      // Сбрасываем индикатор несохраненных изменений если очередь пуста
      if (pendingChanges.current.length === 0) {
        setHasUnsavedChanges(false);
      }

      return true;
    } catch (err) {
      console.error('Error in batch update:', err);
      // При ошибке возвращаем изменения обратно в очередь для повторной попытки
      pendingChanges.current = [...changesToFlush, ...pendingChanges.current];
      
      // Показываем ошибку пользователю
      setError(`Ошибка сохранения: ${err.message}. Попробуйте еще раз.`);
      
      // Перезагружаем данные, чтобы восстановить консистентность
      setTimeout(() => {
        loadData(false);
      }, 2000);

      throw err;
    }
  };

  // Обработчик изменения данных с дебаунсингом
  const handleAfterChange = async (changes, source) => {
    if (source === 'loadData' || source === 'UndoRedo.undo' || source === 'UndoRedo.redo') {
      return;
    }

    if (changes) {
      console.log('handleAfterChange called with:', { changes, source, dataLength: data.length });
      
      for (const [row, prop, oldValue, newValue] of changes) {
        if (oldValue !== newValue && data[row]) {
          // Получаем ID строки из данных
          const rowId = data[row]._id;
          
          console.log('Change details:', {
            rowIndex: row,
            rowData: data[row],
            rowId: rowId,
            property: prop,
            oldValue: oldValue,
            newValue: newValue
          });
          
          if (!rowId) {
            console.warn('Row ID not found for row index:', row, 'Row data:', data[row]);
            console.warn('Data structure sample:', data.slice(0, 3));
            continue;
          }

          // Добавляем изменение в очередь с ID строки
          pendingChanges.current.push({
            rowIndex: row,
            rowId: rowId,
            data: { [prop]: newValue }
          });
          
          // Устанавливаем индикатор несохраненных изменений
          setHasUnsavedChanges(true);
          
          console.log('Change queued:', { rowIndex: row, rowId, prop, oldValue, newValue });
          
          // Сбрасываем предыдущий таймер
          if (writeTimeoutRef.current) {
            clearTimeout(writeTimeoutRef.current);
          }
          
          // Устанавливаем новый таймер
          writeTimeoutRef.current = setTimeout(() => {
            flushPendingChanges();
          }, WRITE_DEBOUNCE);
        }
      }
    }
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
      const hot = hotTableRef.current.hotInstance;
      hot.alter('remove_row', index, amount);
    }
  };

  // Обработчик удаления строки
  const handleAfterRemoveRow = async (index, amount) => {
    try {
      const rowsToDelete = data.slice(index, index + amount);
      
      for (const row of rowsToDelete) {
        if (row._id) {
          const response = await makeAPIRequest(`/api/sheet?rowId=${row._id}`, {
            method: 'DELETE'
          });
          
          if (!response.ok) {
            throw new Error('Failed to delete row');
          }
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
        reconnectTimeoutRef.current = null;
      }
      
      // Создаем новое SSE соединение с токеном в query параметре
      const sseUrl = `/api/webhook/drive-changes?token=${encodeURIComponent(token)}`;
      console.log('SSE: Connecting to:', sseUrl);
      
      const eventSource = new EventSource(sseUrl);
      
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
          
          switch (data.type) {
            case 'connected':
              console.log('SSE: Connection established, client ID:', data.clientId);
              break;
              
            case 'sheet-changed':
              console.log('SSE: Sheet changed notification, refreshing data...');
              setIsPolling(true);
              loadData(false).finally(() => setIsPolling(false));
              break;
              
            case 'ping':
              console.log('SSE: Ping received, connection alive');
              break;
              
            default:
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
        if (eventSource.readyState === EventSource.CLOSED || reconnectAttemptsRef.current >= 5) {
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
      
      eventSourceRef.current = eventSource;
      
    } catch (error) {
      console.error('SSE: Error setting up connection:', error);
      setConnectionStatus('error');
      
      // Exponential backoff for setup errors too
      reconnectAttemptsRef.current++;
      if (reconnectAttemptsRef.current >= 5) {
        console.log('SSE: Too many setup failures, disabling push notifications');
        setPushEnabled(false);
        return;
      }
      
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
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    reconnectAttemptsRef.current = 0;
  };

  // API для родительского компонента
  useImperativeHandle(ref, () => ({
    updateOrderFields: (orderId, fieldsToUpdate, options = {}) => {
      console.log(`DataTable: updateOrderFields called for orderId: ${orderId}`, fieldsToUpdate);
      const rowIndex = data.findIndex(row => row._id === orderId);
      if (rowIndex === -1) {
        console.error(`Order with ID ${orderId} not found in DataTable.`);
        return Promise.reject(new Error(`Order with ID ${orderId} not found`));
      }

      // Добавляем изменение в очередь, указывая и rowIndex, и rowId для надежности
      pendingChanges.current.push({
        rowIndex: rowIndex,
        rowId: orderId, // Передаем ID для более надежного поиска в flushPendingChanges
        data: fieldsToUpdate
      });
      
      // Устанавливаем индикатор несохраненных изменений
      setHasUnsavedChanges(true);
      
      // Сбрасываем предыдущий таймер, если он был
      if (writeTimeoutRef.current) {
        clearTimeout(writeTimeoutRef.current);
      }
      
      if (options.immediate) {
        writeTimeoutRef.current = null;
        return flushPendingChanges();
      }

      // Устанавливаем новый таймер для пакетного сохранения изменений
      writeTimeoutRef.current = setTimeout(() => {
        writeTimeoutRef.current = null;
        flushPendingChanges().catch(() => {});
      }, WRITE_DEBOUNCE);

      return Promise.resolve();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- flushPendingChanges relies on refs for the latest queue and stays stable across renders
  }), [data]);

  if (loading) {
    return <div className="loading">Загрузка данных...</div>;
  }

  if (error) {
    return <div className="error">Ошибка: {error}</div>;
  }

  // Дополнительная проверка данных
  if (!data || !Array.isArray(data)) {
    return <div className="loading">Подготовка данных...</div>;
  }

  const columns = data.length > 0 ? Object.keys(data[0]).filter(key => key !== '_id') : [];
  console.log('Data length:', data.length);
  
  // Если нет колонок, показываем сообщение
  if (columns.length === 0) {
    return (
      <div className="table-container">
        <div className="status-bar">
          <div className="status-indicator">
            <span className="status-dot error"></span>
          </div>
          <button 
            onClick={() => loadData(true)}
            disabled={isPolling}
            className="refresh-button"
            title="Загрузить данные"
          >
            🔄 Загрузить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="table-container">
      {/* Статус индикатор */}
      <div className="status-bar">
        <div className="status-indicator">
          <span className={`status-dot ${
            isPolling ? 'polling' : 
            (connectionStatus === 'connected' && pushEnabled) || !error ? 'success' : 'error'
          }`}></span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {hasUnsavedChanges && (
            <div className="unsaved-indicator" title="Есть несохраненные изменения">
              💾 Сохранение...
            </div>
          )}
          <button 
            onClick={() => loadData(false)}
            disabled={isPolling}
            className="refresh-button"
            title="Обновить данные"
          >
            🔄 Обновить
          </button>
          <div className="last-update">
            {lastUpdateTime ? 
              `Последнее обновление: ${lastUpdateTime.toLocaleTimeString()}` : 
              'Ожидание данных...'
            }
          </div>
        </div>
      </div>
      
      <div className="table-wrapper">
        {data.length > 0 ? (
          <HotTable
            ref={hotTableRef}
            data={data}
            columns={columns.map(col => ({ data: col, title: col }))}
            colHeaders={columns}
            rowHeaders={true}
            width="100%"
            height={tableHeight}
            licenseKey="non-commercial-and-evaluation"
            contextMenu={true}
            manualRowResize={true}
            manualColumnResize={true}
            afterChange={handleAfterChange}
            afterCreateRow={handleAfterCreateRow}
            afterRemoveRow={handleAfterRemoveRow}
            stretchH="all"
            renderAllRows={true}
            viewportRowRenderingOffset={50}
            viewportColumnRenderingOffset={5}
            preventOverflow="horizontal"
          />
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            Таблица пуста. Данные загружаются...
          </div>
        )}
      </div>
    </div>
  );
});

DataTable.displayName = 'DataTable';

export default DataTable;
