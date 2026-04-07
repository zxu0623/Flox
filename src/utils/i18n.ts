import enMessages from "../../_locales/en/messages.json";
import zhCnMessages from "../../_locales/zh_CN/messages.json";

export type LanguageCode = "auto" | "en" | "zh_CN";

type MessageRecord = Record<
  string,
  {
    message: string;
    placeholders?: Record<string, { content: string }>;
  }
>;

const dictionaries: Record<Exclude<LanguageCode, "auto">, MessageRecord> = {
  en: enMessages as MessageRecord,
  zh_CN: zhCnMessages as MessageRecord
};

export const LANGUAGE_STORAGE_KEY = "flox.language";

function normalizeLanguage(value: unknown): LanguageCode {
  if (value === "en" || value === "zh_CN" || value === "auto") {
    return value;
  }
  return "auto";
}

function getBrowserLanguage(): Exclude<LanguageCode, "auto"> {
  const locale = chrome.i18n.getUILanguage().toLowerCase();
  return locale.startsWith("zh") ? "zh_CN" : "en";
}

function getMessageFromDictionary(
  dictionary: MessageRecord,
  key: string,
  substitutions?: string | string[]
): string {
  const entry = dictionary[key];
  if (!entry) {
    return "";
  }

  let text = entry.message;
  const values = substitutions === undefined ? [] : Array.isArray(substitutions) ? substitutions : [substitutions];

  if (entry.placeholders) {
    Object.entries(entry.placeholders).forEach(([placeholderName, meta]) => {
      const content = meta.content;
      const indexMatch = content.match(/\$(\d+)\$?/);
      if (!indexMatch) {
        return;
      }

      const index = Number(indexMatch[1]) - 1;
      if (index < 0 || index >= values.length) {
        return;
      }

      const namedToken = new RegExp(`\\$${placeholderName}\\$`, "gi");
      text = text.replace(namedToken, values[index]);
    });
  }

  values.forEach((value, index) => {
    const token = new RegExp(`\\$${index + 1}\\$`, "g");
    text = text.replace(token, value);
  });

  return text;
}

export async function getStoredLanguage(): Promise<LanguageCode> {
  const result = await chrome.storage.sync.get(LANGUAGE_STORAGE_KEY);
  return normalizeLanguage(result[LANGUAGE_STORAGE_KEY]);
}

export async function setStoredLanguage(language: LanguageCode): Promise<void> {
  await chrome.storage.sync.set({ [LANGUAGE_STORAGE_KEY]: language });
}

export async function resolveLanguage(): Promise<Exclude<LanguageCode, "auto">> {
  const stored = await getStoredLanguage();
  return stored === "auto" ? getBrowserLanguage() : stored;
}

export function t(
  key: string,
  substitutions?: string | string[],
  language: LanguageCode = "auto"
): string {
  if (language === "auto") {
    const fromChrome = chrome.i18n.getMessage(key, substitutions);
    return fromChrome || key;
  }

  const fromDictionary = getMessageFromDictionary(dictionaries[language], key, substitutions);
  if (fromDictionary) {
    return fromDictionary;
  }

  const fallback = chrome.i18n.getMessage(key, substitutions);
  return fallback || key;
}
