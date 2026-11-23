import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from '@/i18n/locales/zh-CN.json';

export const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US', 'ru-RU'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = 'i18nextLng';

function detectInitialLanguage(): SupportedLanguage {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && SUPPORTED_LANGUAGES.includes(saved as SupportedLanguage)) {
    return saved as SupportedLanguage;
  }
  return 'zh-CN';
}

const localeLoaders: Record<SupportedLanguage, () => Promise<{ default: Record<string, unknown> }>> = {
  'zh-CN': async () => ({ default: zhCN }),
  'en-US': () => import('@/i18n/locales/en-US.json'),
  'ru-RU': () => import('@/i18n/locales/ru-RU.json'),
};

const initialLanguage = detectInitialLanguage();
document.documentElement.lang = 'zh-CN';

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
  },
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  react: {
    bindI18n: 'languageChanged loaded',
    bindI18nStore: 'added removed',
  },
  interpolation: {
    escapeValue: false,
  },
});

if (initialLanguage !== 'zh-CN') {
  void changeAppLanguage(initialLanguage);
}

export async function changeAppLanguage(lang: SupportedLanguage): Promise<void> {
  if (!i18n.hasResourceBundle(lang, 'translation')) {
    const mod = await localeLoaders[lang]();
    i18n.addResourceBundle(lang, 'translation', mod.default, true, true);
  }
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  await i18n.changeLanguage(lang);
}

export default i18n;
