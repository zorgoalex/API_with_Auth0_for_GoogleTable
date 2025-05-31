import { useRef, useEffect, useState } from 'react';
import { HotTable } from '@handsontable/react';
import { useAuth0 } from '@auth0/auth0-react';

export default function DataTable() {
  const hotTableRef = useRef(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { getAccessTokenSilently } = useAuth0();

  // Загрузка данных
  const loadData = async () => {
    try {
      setLoading(true);
      const token = await getAccessTokenSilently();
      
      const response = await fetch('/api/sheet', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }
      
      const rows = await response.json();
      setData(rows);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

  // Обработчик изменения данных
  const handleAfterChange = async (changes, source) => {
    if (source === 'loadData' || source === 'UndoRedo.undo' || source === 'UndoRedo.redo') {
      return;
    }

    if (changes) {
      for (const [row, prop, oldValue, newValue] of changes) {
        if (oldValue !== newValue) {
          const rowData = data[row];
          if (rowData && rowData._id) {
            try {
              const updateData = { ...rowData, [prop]: newValue, rowId: rowData._id };
              
              const response = await makeAPIRequest('/api/sheet', {
                method: 'PUT',
                body: JSON.stringify(updateData)
              });
              
              if (!response.ok) {
                throw new Error('Failed to update cell');
              }
              
              // Обновляем локальные данные
              const newData = [...data];
              newData[row] = { ...newData[row], [prop]: newValue };
              setData(newData);
            } catch (err) {
              console.error('Error updating cell:', err);
              // Возвращаем старое значение при ошибке
              const hot = hotTableRef.current.hotInstance;
              hot.setDataAtCell(row, hot.propToCol(prop), oldValue);
            }
          }
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

  if (loading) {
    return <div className="loading">Загрузка данных...</div>;
  }

  if (error) {
    return <div className="error">Ошибка: {error}</div>;
  }

  const columns = data.length > 0 ? Object.keys(data[0]).filter(key => key !== '_id') : [];

  return (
    <div className="table-container">
      <HotTable
        ref={hotTableRef}
        data={data}
        columns={columns.map(col => ({ data: col, title: col }))}
        colHeaders={columns}
        rowHeaders={true}
        width="100%"
        height="500"
        licenseKey="non-commercial-and-evaluation"
        contextMenu={true}
        manualRowResize={true}
        manualColumnResize={true}
        afterChange={handleAfterChange}
        afterCreateRow={handleAfterCreateRow}
        afterRemoveRow={handleAfterRemoveRow}
        stretchH="all"
      />
    </div>
  );
} 