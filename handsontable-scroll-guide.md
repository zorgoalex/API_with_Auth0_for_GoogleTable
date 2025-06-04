# Handsontable: Верстка таблиц и вертикальный скролл

## Обзор

Handsontable - это популярный JavaScript-компонент таблиц данных, который предоставляет хорошо знакомый интерфейс электронных таблиц для веб-приложений. Этот документ содержит ключевую информацию о верстке таблиц и корректной реализации вертикального скролла.

## Базовая настройка контейнера

### Обязательные CSS-правила для контейнера

Для корректной работы скролла в Handsontable необходимо правильно настроить контейнер:

```css
.handsontable-container {
  width: 500px;
  height: 400px;
  overflow: hidden; /* Обязательно! */
}
```

**Важно**: Handsontable ищет ближайший элемент с `overflow: auto` или `overflow: hidden` для использования его как прокручиваемого контейнера. Если такой элемент не найден, будет использоваться окно браузера.

### JavaScript конфигурация размеров

Размеры можно задать непосредственно в конфигурации:

```javascript
const hot = new Handsontable(container, {
  width: 500,
  height: 400,
  // или строковые значения
  width: '100%',
  height: '75vh'
});
```

При указании размеров в конфигурации, `overflow: hidden` добавляется автоматически.

## Виртуализация для производительности

### Виртуализация строк

Виртуализация строк включена по умолчанию и позволяет обрабатывать сотни тысяч записей без замедления браузера:

```javascript
const hot = new Handsontable(container, {
  // Отключить виртуализацию (не рекомендуется для больших данных)
  renderAllRows: false, // по умолчанию
  
  // Настройка количества строк вне области просмотра
  viewportRowRenderingOffset: 100
});
```

### Виртуализация столбцов

Аналогично работает виртуализация столбцов:

```javascript
const hot = new Handsontable(container, {
  renderAllColumns: false, // по умолчанию
  viewportColumnRenderingOffset: 3
});
```

## Конфигурация скролла

### Основные настройки

```javascript
const hot = new Handsontable(container, {
  data: data,
  height: 300,
  colHeaders: true,
  rowHeaders: true,
  
  // Автоматический вертикальный скролл
  scrollV: 'auto',
  
  // Растяжение столбцов
  stretchH: 'all' // или 'last', 'none', 'hybrid'
});
```

### Типы растяжения столбцов (stretchH)

- `'none'` - без растяжения
- `'last'` - растягивает только последний столбец
- `'all'` - растягивает все столбцы равномерно  
- `'hybrid'` - (по умолчанию) адаптивное поведение

## Решение распространенных проблем

### Проблема исчезающего скроллбара

**Проблема**: Вертикальный скроллбар исчезает после прокрутки страницы.

**Решение**: Обновление настроек таблицы:

```javascript
myGrid.updateSettings({
  scrollV: 'auto',
  stretchH: 'all'
});
```

### Проблема с высотой 100%

**Проблема**: Скролл не работает при установке высоты контейнера в 100%.

**Решение**: Динамическое вычисление высоты:

```javascript
const container = $('#example').parent();
$('#example').height(container.height());
```

### Ограничение горизонтального скролла

Для разрешения только вертикального скролла:

```css
.handsontable-container {
  overflow-x: hidden;
  overflow-y: auto;
}
```

## Оптимизация производительности

### Факторы, влияющие на производительность скролла

1. **Количество ячеек** - произведение строк на столбцы
2. **Количество и сложность пользовательских рендереров**
3. **Количество активных опций в конфигурации** 
4. **Производительность устройства и браузера**

### Настройки для улучшения производительности

```javascript
const hot = new Handsontable(container, {
  // Фиксированные размеры столбцов
  colWidths: [50, 150, 45],
  
  // Отключение автоматического размера
  autoRowSize: false,
  autoColumnSize: false,
  
  // Уменьшение смещения вьюпорта
  viewportRowRenderingOffset: 10,
  viewportColumnRenderingOffset: 3
});
```

## Стилизация скроллбаров

### Webkit браузеры (Chrome, Safari)

```css
#handsontable-container ::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

#handsontable-container ::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 5px;
}

#handsontable-container:hover ::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.5);
}
```

### CSS переменные тем

В новых версиях Handsontable доступны CSS переменные для настройки скроллбаров:

```css
:root {
  --ht-scrollbar-border-radius: 8px;
  --ht-scrollbar-track-color: #f7f7f9;
  --ht-scrollbar-thumb-color: #999999;
}
```

## Лучшие практики

### Настройка контейнера

1. **Всегда устанавливайте `overflow: hidden`** на контейнере
2. **Определяйте фиксированные размеры** для предсказуемого поведения
3. **Используйте относительные единицы** для адаптивности

### Обработка больших данных

1. **Оставляйте виртуализацию включенной** для наборов данных >1000 строк
2. **Настраивайте смещения вьюпорта** только при необходимости
3. **Используйте фиксированные размеры столбцов** для лучшей производительности

### CSS для скролла

```css
.handsontable-wrapper {
  width: 100%;
  max-width: 1200px;
  height: 400px;
  overflow: hidden;
  border: 1px solid #ccc;
  border-radius: 4px;
}

/* Убираем фокус-аутлайн при необходимости */
.handsontable-wrapper .handsontable {
  outline: none;
}
```

## Известные ограничения

### Виртуализация

- Поиск браузера работает только для видимой части таблицы
- Скринридеры могут неправильно объявлять общее количество строк/столбцов

### Совместимость

- IE имеет ограниченную способность обрабатывать большие объемы данных
- Разное поведение скролла в macOS и Windows

## Пример полной конфигурации

```javascript
const container = document.getElementById('handsontable-container');

const hot = new Handsontable(container, {
  data: largeDataSet,
  height: 400,
  width: '100%',
  
  // Заголовки
  colHeaders: true,
  rowHeaders: true,
  
  // Скролл и растяжение
  scrollV: 'auto',
  stretchH: 'hybrid',
  
  // Виртуализация (настройки по умолчанию)
  renderAllRows: false,
  renderAllColumns: false,
  viewportRowRenderingOffset: 100,
  viewportColumnRenderingOffset: 3,
  
  // Производительность
  autoRowSize: false,
  autoColumnSize: false,
  colWidths: function(index) {
    return [100, 200, 150, 120][index] || 100;
  }
});
```

## Заключение

Правильная настройка скролла в Handsontable требует внимания к настройкам контейнера, использования виртуализации для производительности и понимания ограничений различных браузеров. Следование приведенным выше рекомендациям поможет создать эффективное и пользовательски-дружелюбное табличное решение.