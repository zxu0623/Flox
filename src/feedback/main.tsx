import React from "react";
import ReactDOM from "react-dom/client";
import "../styles.css";
import { getStoredLanguage, t, type LanguageCode } from "../utils/i18n";
import { applyAccentHueToDocument, applyUiThemeToDocument, getStoredAccentHue, getStoredUiTheme } from "../utils/theme";

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
    void getStoredAccentHue().then(applyAccentHueToDocument);
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

  const inputClass =
    "mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none ring-0 focus:border-[var(--line-strong)] focus:ring-2 focus:ring-[var(--accent)]/30";

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-[var(--paper-3)] px-4 py-10 text-[var(--ink)] antialiased">
      <h1 className="serif text-3xl font-normal tracking-[-0.02em] text-[var(--ink)]">{t("feedbackPageTitle", undefined, language)}</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{t("feedbackPageSubtitle", undefined, language)}</p>
      <p className="mono mt-1 text-xs text-[var(--muted)]">{FEEDBACK_TO}</p>

      <form onSubmit={openFeedbackMail} className="mt-8 space-y-4">
        <div>
          <label htmlFor="fb-subject" className="block text-xs font-medium text-[var(--muted)]">
            {t("feedbackFormSubject", undefined, language)}
          </label>
          <input
            id="fb-subject"
            type="text"
            value={subject}
            onChange={(ev) => setSubject(ev.target.value)}
            className={inputClass}
            placeholder={t("feedbackDefaultSubject", undefined, language)}
          />
        </div>
        <div>
          <label htmlFor="fb-msg" className="block text-xs font-medium text-[var(--muted)]">
            {t("feedbackFormMessage", undefined, language)}
          </label>
          <textarea
            id="fb-msg"
            required
            rows={8}
            value={message}
            onChange={(ev) => setMessage(ev.target.value)}
            className={inputClass}
            placeholder={t("feedbackFormMessagePlaceholder", undefined, language)}
          />
        </div>
        <div>
          <label htmlFor="fb-email" className="block text-xs font-medium text-[var(--muted)]">
            {t("feedbackFormEmailOptional", undefined, language)}
          </label>
          <input
            id="fb-email"
            type="email"
            value={yourEmail}
            onChange={(ev) => setYourEmail(ev.target.value)}
            className={inputClass}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-4 py-2.5 text-sm font-medium text-[var(--ink)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--paper-2)]"
        >
          {t("feedbackFormSubmit", undefined, language)}
        </button>
      </form>

      {hint ? <p className="mt-4 text-xs text-[var(--muted)]">{t("feedbackFormNote", undefined, language)}</p> : null}

      <div className="mt-10 border-t border-[var(--line)] pt-6">
        <button
          type="button"
          onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") })}
          className="text-sm text-[var(--accent)] hover:underline"
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
