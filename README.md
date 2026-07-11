# Million Music

Десктопный музыкальный клиент на Tauri 2, Vanilla TypeScript, Vite 6 и Tailwind CSS 4. Интерфейс получает каталог, поиск, профиль и аудиопотоки из backend API; локально хранит пользовательские плейлисты, избранное и настройки плеера.

## Запуск

```powershell
npm install
Copy-Item .env.example .env.local
# Fill VITE_MUSIC_APP_TOKEN in .env.local
npm run tauri dev
```

Frontend без десктопной оболочки можно запустить командой `npm run dev`.

## Проверки

```powershell
npm run typecheck
npm run build
```

В проекте пока нет настроенных lint- и unit-test-команд. Финальная проверка интерфейса выполняется интерактивно в окне Tauri на desktop, tablet и mobile-размерах.

## Структура

- `src/main.ts` — маршруты, UI-состояние, плеер и пользовательские сценарии.
- `src/styles.css` — Tailwind и дизайн-система Nocturne Prism.
- `src/api.ts` — backend API, авторизация и преобразование данных.
- `src/metadataFeedService.ts` — загрузка и нормализация музыкальной ленты.
- `src-tauri/` — конфигурация и Rust-оболочка Tauri.
