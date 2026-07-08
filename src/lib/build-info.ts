// Метка версии для отладки: чтобы при проверке на телефоне/PWA можно было
// однозначно увидеть, какая сборка сейчас открыта, а не гадать по описаниям.
// Автообновляется при каждой правке фронтенда (см. scripts/write-build-info.mjs —
// npm/vite hooks недоступны, т.к. package.json и vite.config.ts защищены платформой).
export const BUILD_COMMIT = "16e8e8b";
export const BUILD_TIME = "2026-07-08T13:02:16Z";
