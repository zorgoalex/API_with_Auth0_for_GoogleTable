# Настройка push‑уведомлений Google Drive API



## Настройка push‑уведомлений Drive API (`changes.watch`)

> Цель: получать события о любых изменениях файла/диска без постоянного опроса и не тратить квоту.

### 1. Включите нужные API

* **Google Drive API** (если не включён).
* **Cloud Pub/Sub API** — только если будете использовать канал типа `pubsub`.

### 2. Выберите тип канала

| Тип канала                                        | Когда использовать                                           | Что настроить в Console                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `web_hook` (прямая POST‑запросы на ваш HTTPS URL) | Есть собственный бекенд с HTTPS‑доменом                      | • Проверить домен в **Domain verification**  <br>• Добавить домен в **OAuth consent → Authorized domains**            |
| `pubsub` (Drive пишет в тему Cloud Pub/Sub)       | Хотите «serverless» очередь или нет публичного веб‑эндпойнта | • Включить **Cloud Pub/Sub** <br>• Создать тему <br>• Выдать сервис‑аккаунту Drive роль **Pub/Sub Publisher** на тему |

### 3А. Настройка `web_hook`‑канала

1. **Проверка домена** → API & Services → **Domain verification**. Добавьте домен и подтвердите через Search Console.
2. **OAuth consent screen** → добавьте этот домен в **Authorized domains**.
3. Убедитесь, что URL‑приёмник (например `https://example.com/drive/notify`) отдаёт `200 OK`.
4. Пример тела запроса `files.watch` / `changes.watch`:

   ```json
   {
     "type": "web_hook",
     "address": "https://example.com/drive/notify",
     "id": "a-unique-uuid",
     "token": "any-csrf-token"
   }
   ```

### 3Б. Настройка `pubsub`‑канала

1. **Pub/Sub → Create Topic**: `drive-changes`.
2. **IAM & Admin** → найдите сервис‑аккаунт:
   `service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com`
   и дайте ему роль **Pub/Sub Publisher** **на уровне темы** (или проекта).
3. В вызове `changes.watch` укажите:

   ```json
   {
     "type": "pubsub",
     "topicName": "projects/PROJECT_ID/topics/drive-changes"
   }
   ```

### 4. Полезные заметки

* Уведомления приходят батчами не чаще \~1 раза в минуту.
* Токен/ID из channel возвращаются обратно в заголовках → можно проверить подлинность.
* Минимальные OAuth‑scopes: `drive.readonly` (только чтение) или `drive` (чтение+запись).

**Итого:** включите Drive API, затем *либо* проверьте/добавьте домен (для `web_hook`), *либо* создайте Pub/Sub‑тему и назначьте роль (для `pubsub`). После этого `changes.watch` будет слать push‑уведомления, не расходуя квоту проекта.
