# APEX AI — подключение Android к Cloudflare

## Проверенное состояние на 13 ноября 2026

- Cloudflare Worker `apex-ai-collective` доступен по HTTPS; независимая проверка GitHub Actions: https://github.com/tehnologydd-alt/crypto-smc/actions/runs/43453582034 .
- Опубликованная версия Worker **пока не поддерживает маршруты привязки телефона**. Версия с поддержкой привязки содержится только в ветке `apex-ai-device-pairing-20261113`.
- База D1 `apex-ai-research` уже содержит таблицы `ai_devices`, `ai_device_nonces`, `ai_pair_guard`, `ai_budget`, `ai_usage`.
- Автоматические тесты безопасности пройдены: https://github.com/tehnologydd-alt/crypto-smc/actions/runs/43451803803 .
- Debug APK собрана успешно: https://github.com/tehnologydd-alt/crypto-smc/actions/runs/43452657797 . Артефакт `APEX9-AI-Device-Pairing-Debug-APK`.
- Публикация обновлённого Worker блокируется Cloudflare HTTP 500, API error `10013`, в том числе через Wrangler; пример лога https://github.com/tehnologydd-alt/crypto-smc/actions/runs/43452906879 . Старый Worker и его секрет не удалять.

## Безопасная последовательность завершения

1. Добиться успешного `wrangler deploy` обновлённого Worker. Повторять после устранения проблемы Cloudflare, не удалять рабочий Worker и не раскрывать `APEX_EDGE_TOKEN`.
2. Проверить через GitHub Actions `/health`, неавторизованный запрос → HTTP 401, `POST /v1/device/enroll` с проверяемым тестовым RSA-публичным ключом → `PENDING_APPROVAL`, но не использовать реальные AI-вызовы без контроля лимитов.
3. Установить новую APK после проверки подписи. Debug-подпись может отличаться от старой; прежде чем удалять какую-либо версию APEX, сохранить и проверить резервный архив Room и настроек.
4. На Android открыть Настройки → Облачный исследовательский ИИ → Привязать это устройство. Приложение покажет код и отпечаток публичного ключа.
5. Владелец аккаунта Cloudflare должен вручную сопоставить показанный код И отпечаток, сверив их с записью в D1. **Никогда не утверждать устройство автоматически лишь по одному коду**.
6. При совпадении выполнить безопасную команду с проверкой и кода, и отпечатка (подставлять только сверенные значения):

```sql
SELECT device_id, fingerprint, verification_code, approved, revoked
FROM ai_devices WHERE verification_code = 'CODE';

UPDATE ai_devices SET approved = 1
WHERE verification_code = 'CODE' AND fingerprint = 'FINGERPRINT'
  AND approved = 0 AND revoked = 0;
```

7. На Android выбрать «Проверить подключение и лимиты»: защищённый ответ должен иметь `state=POLICY_ACTIVE`; продемонстрировать повтор запроса с тем же nonce → отказ.
8. Выполнять запрос GLM/Qwen только после проверки оставшегося бесплатного бюджета и подтверждения разрешённого пользователем исследовательского действия.

## Ограничения

- RSA-ключ телефона остаётся в Android Keystore; в APK нельзя помещать серверный токен `APEX_EDGE_TOKEN` или общий секрет.
- Серверный учёт запросов — защита от превышений по попыткам, а не мониторинг реального счёта Cloudflare Neurons.
- Никакого подключения Oracle, торговых операций или платных облачных ресурсов в этой ветке нет.
- Статусы `health=RUNNING` и `model listed` **не подтверждают**, что сами модели успешно ответили на запрос.