import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

const COOKIE_KEY = "cookie_consent_v1";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Показываем баннер только если ещё не принято
    if (!localStorage.getItem(COOKIE_KEY)) {
      // Небольшая задержка чтобы не мешать первому рендеру
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  function accept() {
    localStorage.setItem(COOKIE_KEY, "accepted");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Уведомление об использовании cookies"
      className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-800"
    >
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6">
        <p className="text-xs text-slate-400 leading-relaxed flex-1">
          Мы используем cookies для аналитики и улучшения работы сайта. Продолжая пользоваться сайтом, вы соглашаетесь с{" "}
          <Link
            to="/legal/privacy"
            className="text-slate-300 underline underline-offset-2 hover:text-white transition-colors"
          >
            политикой конфиденциальности
          </Link>{" "}
          и обработкой персональных данных.
        </p>
        <button
          onClick={accept}
          className="flex-shrink-0 px-4 py-2 bg-white hover:bg-slate-100 text-slate-900 text-xs font-semibold rounded-lg transition-colors"
        >
          Принять
        </button>
      </div>
    </div>
  );
}
