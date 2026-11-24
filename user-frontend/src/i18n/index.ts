import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enUS from '@/i18n/locales/en-US.json';
import faIR from '@/i18n/locales/fa-IR.json';
import jaJP from '@/i18n/locales/ja-JP.json';
import koKR from '@/i18n/locales/ko-KR.json';
import ruRU from '@/i18n/locales/ru-RU.json';
import viVN from '@/i18n/locales/vi-VN.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'en-US', label: 'English' },
  { code: 'fa-IR', label: 'فارسی (Iran)' },
  { code: 'ja-JP', label: '日本語' },
  { code: 'vi-VN', label: 'Tiếng Việt' },
  { code: 'ko-KR', label: '한국어' },
  { code: 'ru-RU', label: 'Русский' },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];

const LANG_KEY = 'xboard_user_lang';
const SUPPORTED_CODES = new Set<string>(SUPPORTED_LANGUAGES.map((l) => l.code));

export function applyDocumentLocale(lang: SupportedLanguage): void {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa-IR' ? 'rtl' : 'ltr';
}

function getInitialLang(): SupportedLanguage {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && SUPPORTED_CODES.has(saved)) {
      return saved as SupportedLanguage;
    }
  } catch {
    // ignore
  }
  return 'zh-CN';
}

const initialLang = getInitialLang();
applyDocumentLocale(initialLang);

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'zh-TW': { translation: zhTW },
    'en-US': { translation: enUS },
    'fa-IR': { translation: faIR },
    'ja-JP': { translation: jaJP },
    'vi-VN': { translation: viVN },
    'ko-KR': { translation: koKR },
    'ru-RU': { translation: ruRU },
  },
  lng: initialLang,
  fallbackLng: 'zh-CN',
  interpolation: {
    escapeValue: false,
  },
});

export function changeLanguage(lang: SupportedLanguage): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // ignore
  }
  applyDocumentLocale(lang);
  void i18n.changeLanguage(lang);
}

export default i18n;
