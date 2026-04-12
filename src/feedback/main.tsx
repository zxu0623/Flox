import React from "react";
import ReactDOM from "react-dom/client";
import "../styles.css";
import { getStoredLanguage, t, type LanguageCode } from "../utils/i18n";
import { applyUiThemeToDocument, getStoredUiTheme } from "../utils/theme";

const FEEDBACK_TO = "xinjiew1112@gmail.com";

function FeedbackApp() {
  const [language, setLanguage] = React.useState<LanguageCode>("en");
  const [yourEmail, setYourEmail] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [hint, setHint] = React.useState(false);

  React.useEffect(() => {
    void getStoredLanguage().then(setLanguage);
    void getStoredUiTheme().then(applyUiThemeToDocument);
  }, []);

  const openFeedbackMail = (e: React.FormEvent) => {
    e.preventDefault();
    const sub = subject.trim() || t("feedbackDefaultSubject", undefined, language);
    const lines: string[] = [];
    if (message.trim()) {
      lines.push(message.trim());
    }
    if (yourEmail.trim()) {
      lines.push("", `${t("feedbackBodyContactLine", undefined, language)} ${yourEmail.trim()}`);
    }
    lines.push("", "---", `${t("feedbackBodyFooter", undefined, language)}`, `UA: ${navigator.userAgent}`);
    const body = lines.join("\n");
    setHint(true);
    window.location.href = `mailto:${FEEDBACK_TO}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-zinc-50 dark:bg-zinc-950 px-4 py-10 text-zinc-900 dark:text-zinc-100 antialiased">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">{t("feedbackPageTitle", undefined, language)}</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{t("feedbackPageSubtitle", undefined, language)}</p>
      <p className="mt-1 font-mono text-xs text-zinc-600 dark:text-zinc-500">{FEEDBACK_TO}</p>

      <form onSubmit={openFeedbackMail} className="mt-8 space-y-4">
        <div>
          <label htmlFor="fb-subject" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {t("feedbackFormSubject", undefined, language)}
          </label>
          <input
            id="fb-subject"
            type="text"
            value={subject}
            onChange={(ev) => setSubject(ev.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-3 py-2 text-sm outline-none ring-amber-400/0 focus:border-zinc-600 focus:ring-2 focus:ring-amber-400/30"
            placeholder={t("feedbackDefaultSubject", undefined, language)}
          />
        </div>
        <div>
          <label htmlFor="fb-msg" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {t("feedbackFormMessage", undefined, language)}
          </label>
          <textarea
            id="fb-msg"
            required
            rows={8}
            value={message}
            onChange={(ev) => setMessage(ev.target.value)}
            className="mt-1 w-full resize-y rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-3 py-2 text-sm outline-none ring-amber-400/0 focus:border-zinc-600 focus:ring-2 focus:ring-amber-400/30"
            placeholder={t("feedbackFormMessagePlaceholder", undefined, language)}
          />
        </div>
        <div>
          <label htmlFor="fb-email" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {t("feedbackFormEmailOptional", undefined, language)}
          </label>
          <input
            id="fb-email"
            type="email"
            value={yourEmail}
            onChange={(ev) => setYourEmail(ev.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-3 py-2 text-sm outline-none ring-amber-400/0 focus:border-zinc-600 focus:ring-2 focus:ring-amber-400/30"
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-amber-300 transition-colors duration-100"
        >
          {t("feedbackFormSubmit", undefined, language)}
        </button>
      </form>

      {hint ? <p className="mt-4 text-xs text-zinc-600 dark:text-zinc-500">{t("feedbackFormNote", undefined, language)}</p> : null}

      <div className="mt-10 border-t border-zinc-200 dark:border-zinc-800 pt-6">
        <button
          type="button"
          onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") })}
          className="text-sm text-amber-400 hover:text-amber-800 dark:text-amber-300 transition-colors duration-100"
        >
          {t("feedbackOpenDashboard", undefined, language)}
        </button>
      </div>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FeedbackApp />
  </React.StrictMode>
);
