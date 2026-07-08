// Метка версии сборки для отладки на телефоне/PWA: чтобы при проверке можно было
// однозначно увидеть, какой именно фронтенд-бандл сейчас загружен, а не гадать
// по описаниям или полагаться на ручную запись коммита (она могла отставать).
//
// package.json и vite.config.ts защищены платформой от редактирования, поэтому
// classic build-hook (define/prebuild с git hash) недоступен. Вместо этого берём
// хеш реально загруженного JS-файла из имени <script src="/assets/index-XXXXXXXX.js">
// — Vite сам генерирует уникальный хеш на каждую сборку, значит метка ВСЕГДА
// соответствует фактическому бандлу у пользователя и не требует ручного обновления.
function readBundleHash(): string {
  const script = Array.from(document.scripts).find(s => /\/assets\/index-[\w-]+\.js$/.test(s.src));
  const match = script?.src.match(/index-([\w-]+)\.js$/);
  return match?.[1] || "dev";
}

export const BUILD_HASH = readBundleHash();
