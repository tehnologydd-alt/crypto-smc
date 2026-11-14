# APEX 9 — зашифрованное резервное копирование и перенос на другой Android

## Цель

Сохранить исследования APEX без своего платного облачного сервера и без необходимости подключать API стороннего сервиса. Пользователь в системном выборе файлов Android выбирает **Google Drive либо любое установленное облачное хранилище**. Это одноразовая операция по кнопке, **не автоматическая синхронизация в реальном времени**.

## Что входит

Все существующие Room-таблицы SQLite версии 5:
- research_observations: рыночные данные, стаканы, наблюдения китов, новости и прочие источники (в пределах локально сохранённой истории)
- market_candles: закрытые исторические свечи
- research_forecasts: оригинальные прогнозы M15/H1/H4 и опубликованные W-снимки
- research_forecast_stages: события TP/SL и их реальная хронология
- research_forecast_results: результаты проверки
- research_shadow_candidates: исследовательские кандидаты

В DataStore: избранное, выбранный актив, пользовательские отметки, режимы отображения и уведомлений. Отдельно переносится локальный набор ★ отмеченных прогнозов (не рекалькулируется из текущей выборки).

Не экспортируются: пароли API и ключи из Android Keystore, системные разрешения, сессионные WebSocket, временный WebView-кеш, одноразовые токены входа и локальные пути других приложений. Их нужно подключать заново на новом телефоне.

## Защита
- AES-256-GCM, случайные соль и IV, 220 000 итераций PBKDF2-HMAC-SHA256. Пароль нужен при переносе, в базе APEX он **не хранится**.
- ZIP формируется сразу через поток шифрования. **Незашифрованный экспорт не пишется на диск.**
- Импорт расшифровывается во внутренний временный файл, проверяет подлинность AES-GCM и точную структуру ZIP, таблицы, все счётчики записей и ожидаемые типы.
- Импорт выполняется одним SQLite transaction с INSERT OR IGNORE — старые и новые записи сохраняются, конфликтующие первичные ключи не перезаписываются. Данные существующего телефона **не очищаются**.
- Настройки избранного и ★ объединяются, не более 10 избранных и 300 отметок. Фоновая синхронизация и оповещения на новом телефоне **отключаются** до повторного согласия.
- Результат экспорта означает, что запись в выбранный Android DocumentProvider закончена. **Это не доказательство, что Google Drive уже завершил сетевую загрузку**: убедитесь, что файл доступен на другом устройстве.
- При краше во время восстановления возможно наличие временного **расшифрованного** ZIP в приватном cacheDir приложения; после штатной операции он удаляется. Доступ к приватному каталогу ограничен Android.

## Перенос

1. На старом телефоне открыть APEX → Настройки → Резервное копирование в облако.
2. Придумать отдельную парольную фразу от 12 символов и сохранить её в надёжном месте.
3. Нажать **«Сохранить архив в облако»**, выбрать Google Drive, папку и имя файла `APEX-Research-....apexbackup`.
4. Дождаться появления и завершения синхронизации файла в облаке. **Не удаляйте APEX со старого телефона до проверки резервной копии.**
5. На новом телефоне установить совместимый APEX с этим модулем. Войти в тот же облачный аккаунт через приложение облачного провайдера.
6. Настройки → ввести прежнюю парольную фразу → **«Восстановить архив»** → выбрать файл.
7. APEX проверит архив, объединит данные с новой Room и перезагрузит интерфейс. Проверить избранное, старые сценарии и их статистику. Повторно разрешить фон и уведомления при необходимости.

## Ограничения

- Копирование **ручное**. Новые данные, накопленные после последнего архива, нельзя восстановить из старого архива.
- Копии ограничены доступной памятью, возможностями Android DocumentProvider и ограничением архивов APEX. Не заменяют независимую проверку успешной загрузки файла.
- Стандартный системный Android Auto Backup может помочь с малыми объёмами, но имеет облачную квоту **25 МБ** и не гарантирует полного переноса накапливаемого Room-архива. Основной надёжный путь для больших историй здесь — отдельный шифрованный файл.
- Не следует хранить пароль рядом с самим архивом.
- Это перенос сохранённых исследовательских наблюдений, а не перенос биржевых аккаунтов или выполнение ордеров.

## Проверки

Node CI: `node --test apex9-preview/test-portable-cloud-backup.mjs`.
Android CI: Kotlin/Room/Capacitor Activity callbacks, полная сборка APK.
Нужно дополнительно испытать на двух физических телефонах, с настоящим Google Drive, включая неверный пароль, отмену системного выбора, полный архив, импорт поверх частично заполненной базы и нехватку места.


## Research archive capacity (2026-11-14)

The Android validator and WebView archive now accept up to 400 research transcripts and 2,400,000 UTF-8 bytes (previously 200 and 1,800,000). Transcript format v1 and portable manifest schemas 5/6 remain unchanged. New APKs read existing backups; older APKs may reject expanded backups above the older limits. Local WebView quota may be lower in practice, depending on other stored data. A failed append or capacity limit preserves the previously saved research archive; no silent eviction. Export a backup before reaching the limit. Actual on-device capacity and restore must still be verified on Android.


## Research feedback portability

Schema 7 adds optional validated feedback metadata to the encrypted AI archive. New exports include the review journal, up to 100 records and 180,000 UTF-8 bytes. Schemas 5 and 6 remain readable. Old APKs reject schema 7. Incoming reviews are merged by task/time without replacing conflicting records or evicting history. The Room merge and WebView writes are separate; a failure is reported and the source backup must be retained. Android file-picker export/import and actual WebView capacity require on-device verification.


## Schema 8 – full research journal portability

Schema 8 adds bounded Lab v2 summaries and manual rule review notes to the existing encrypted research transfer. Older schemas 5–7 remain readable; older APKs reject schema 8. Lab summaries are limited to 40 entries / 120000 bytes; rule notes to 60 entries / 80000 bytes. Journal identity conflicts and merged capacity overflow are rejected before WebView writes. Manifests and native responses report independent counts. Room restoration and separate localStorage writes are not one atomic transaction; a partial failure is explicitly reported, and the original backup should be retained. No credentials, live sessions, model execution settings or automatic rule activation are included by these new journal fields. On-device transfer remains to be tested.
