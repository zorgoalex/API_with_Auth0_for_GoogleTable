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
          console.log('Refreshing Handsontable dimensions...');
          
          // Находим родительский контейнер таблицы (.table-wrapper)
          const tableWrapper = hotInstance.rootElement.closest('.table-wrapper');
          if (tableWrapper) {
            // Получаем реальную высоту контейнера в пикселях
            const containerHeight = tableWrapper.clientHeight;
            console.log('Table wrapper height:', containerHeight, 'px');
            
            // Обновляем состояние высоты таблицы
            setTableHeight(containerHeight);
            
            // Пробуем обновить размеры через Handsontable API
            try {
              hotInstance.updateSettings({
                height: containerHeight,
                width: '100%'
              });
              console.log('Updated Handsontable settings with height:', containerHeight);
            } catch (error) {
              console.error('Error updating Handsontable settings:', error);
            }
            
            // Дополнительно устанавливаем высоту напрямую
            const wtHolder = hotInstance.rootElement.querySelector('.ht_master .wtHolder');
            if (wtHolder) {
              console.log('Found .wtHolder, current styles:');
              console.log('- offsetHeight:', wtHolder.offsetHeight);
              console.log('- clientHeight:', wtHolder.clientHeight);
              console.log('- scrollHeight:', wtHolder.scrollHeight);
              console.log('- style.height:', wtHolder.style.height);
              
              // Устанавливаем фиксированную высоту в пикселях
              wtHolder.style.setProperty('height', `${containerHeight}px`, 'important');
              wtHolder.style.setProperty('overflow', 'auto', 'important');
              wtHolder.style.setProperty('max-height', `${containerHeight}px`, 'important');
              
              console.log(`Set .wtHolder height to ${containerHeight}px`);
              
              // Принудительно перерендериваем Handsontable
              hotInstance.render();
              hotInstance.refreshDimensions();
              
              // Добавляем обработчик скролла для тестирования
              const scrollHandler = (e) => {
                console.log('wtHolder scroll event:', e.target.scrollTop);
              };
              wtHolder.removeEventListener('scroll', scrollHandler); // Удаляем предыдущий если есть
              wtHolder.addEventListener('scroll', scrollHandler);
              
              // Проверяем результат после небольшой задержки
              setTimeout(() => {
                console.log('After render - .wtHolder styles:');
                console.log('- offsetHeight:', wtHolder.offsetHeight);
                console.log('- clientHeight:', wtHolder.clientHeight);
                console.log('- scrollHeight:', wtHolder.scrollHeight);
                console.log('- style.height:', wtHolder.style.height);
                console.log('- computed overflow-y:', window.getComputedStyle(wtHolder)['overflow-y']);
                console.log('- computed overflow-x:', window.getComputedStyle(wtHolder)['overflow-x']);
                
                if (wtHolder.scrollHeight > wtHolder.clientHeight) {
                  console.log('✅ .wtHolder now has scrollable content!');
                  
                  // Тестируем программный скролл
                  setTimeout(() => {
                    console.log('Testing programmatic scroll...');
                    wtHolder.scrollTop = 100;
                    setTimeout(() => {
                      console.log('After programmatic scroll, scrollTop:', wtHolder.scrollTop);
                    }, 100);
                  }, 500);
                  
                } else {
                  console.log('❌ wtHolder still not scrollable. Trying alternative approach...');
                  
                  // Альтернативный подход - устанавливаем фиксированную высоту строк
                  try {
                    const rowCount = data.length;
                    const visibleRows = Math.floor(containerHeight / 23); // Примерная высота строки
                    console.log(`Total rows: ${rowCount}, visible rows: ${visibleRows}`);
                    
                    if (rowCount > visibleRows) {
                      hotInstance.updateSettings({
                        height: containerHeight,
                        renderAllRows: false,
                        viewportRowRenderingOffset: 10
                      });
                      console.log('Applied virtualization settings');
                    }
                  } catch (err) {
                    console.error('Error applying virtualization:', err);
                  }
                }
              }, 100);
              
            } else {
              console.warn('.wtHolder not found');
            }
          } else {
            console.warn('.table-wrapper not found');
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
          const tableWrapper = hotInstance.rootElement.closest('.table-wrapper');
          if (tableWrapper) {
            const containerHeight = tableWrapper.clientHeight;
            
            // Обновляем состояние высоты
            setTableHeight(containerHeight);
            
            // Обновляем через API
            try {
              hotInstance.updateSettings({
                height: containerHeight,
                width: '100%'
              });
            } catch (error) {
              console.error('Error updating Handsontable settings on resize:', error);
            }
            
            // Дополнительно устанавливаем напрямую
            const wtHolder = hotInstance.rootElement.querySelector('.ht_master .wtHolder');
            if (wtHolder) {
              wtHolder.style.setProperty('height', `${containerHeight}px`, 'important');
              wtHolder.style.setProperty('max-height', `${containerHeight}px`, 'important');
              hotInstance.render();
              hotInstance.refreshDimensions();
              console.log(`Resized .wtHolder height to ${containerHeight}px`);
            }
          }
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
        flushPendingChanges();
      }
    };
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
    
    const changesToFlush = [...pendingChanges.current]; // Копируем изменения для обработки
    pendingChanges.current = []; // Очищаем очередь
    
    console.log('Flushing changes:', changesToFlush);

    try {
      // Группируем изменения по строкам - уже не нужно, если каждое изменение - отдельный объект для строки
      // Вместо этого, итерируемся по каждому изменению в очереди
      for (const change of changesToFlush) {
        const { rowIndex, data: changeData, rowId } = change; // rowId добавлен для прямого обновления
        
        let currentRowData = data.find(row => row._id === rowId); // Находим актуальные данные строки по ID
        if (!currentRowData && rowIndex !== undefined && data[rowIndex]?._id === rowId) {
           // Фоллбэк на случай, если ID есть, но строка еще не найдена по нему в текущем `data`,
           // но rowIndex и rowId совпадают с тем, что в `data`
           currentRowData = data[rowIndex];
        }

        if (currentRowData) {
          const updatePayload = { ...currentRowData, ...changeData, rowId: currentRowData._id };
          
          console.log('Sending update to API:', updatePayload);
          const response = await makeAPIRequest('/api/sheet', {
            method: 'PUT',
            body: JSON.stringify(updatePayload)
          });
          
          if (!response.ok) {
            console.error('Failed to update row:', updatePayload, 'Response:', response);
            // Важно: если ошибка, изменения могут быть потеряны или нужно их вернуть в очередь
            // Пока что просто логируем и позволяем loadData() ниже исправить несоответствия
            throw new Error(`Failed to update row ${currentRowData._id}`);
          }
          
          // Обновляем локальные данные ОПТИМИСТИЧНО или после ответа сервера
          setData(currentData => {
            const newData = currentData.map(row => 
              row._id === currentRowData._id ? { ...row, ...changeData } : row
            );
            return newData;
          });
          console.log(`Row ${currentRowData._id} updated successfully locally and on server.`);
        } else {
          console.warn('Could not find row data for change:', change, 'Current data state:', data);
        }
      }
      
      console.log(`Batch of ${changesToFlush.length} changes processed.`);
    } catch (err) {
      console.error('Error in batch update:', err);
      // При ошибке перезагружаем данные, чтобы восстановить консистентность
      loadData(false); 
    }
  };

  // Обработчик изменения данных с дебаунсингом
  const handleAfterChange = async (changes, source) => {
    if (source === 'loadData' || source === 'UndoRedo.undo' || source === 'UndoRedo.redo') {
      return;
    }

    if (changes) {
      for (const [row, prop, oldValue, newValue] of changes) {
        if (oldValue !== newValue) {
          // Добавляем изменение в очередь
          pendingChanges.current.push({
            rowIndex: row,
            data: { [prop]: newValue }
          });
          
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
    updateOrderFields: (orderId, fieldsToUpdate) => {
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
      
      // Сбрасываем предыдущий таймер, если он был
      if (writeTimeoutRef.current) {
        clearTimeout(writeTimeoutRef.current);
      }
      
      // Устанавливаем новый таймер или вызываем немедленно, если нужно
      // Для одиночных обновлений статуса можно сделать задержку меньше или убрать
      // Но для консистентности с пакетными правками из таблицы, оставим дебаунс
      writeTimeoutRef.current = setTimeout(() => {
        flushPendingChanges();
      }, WRITE_DEBOUNCE); // Используем существующий дебаунс
      
      return Promise.resolve();
    }
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
            renderAllRows={false}
            viewportRowRenderingOffset={10}
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

export default DataTable;