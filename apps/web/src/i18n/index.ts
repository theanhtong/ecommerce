import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { money } from '@/lib/format';
import vi from './vi';

// shortcut: Vietnamese only; add a locale by mirroring vi.ts and listing it in resources.
void i18n.use(initReactI18next).init({
  resources: { vi: { translation: vi } },
  lng: 'vi',
  fallbackLng: 'vi',
  // React already escapes what it renders.
  interpolation: { escapeValue: false },
});
i18n.services.formatter?.add('money', (value: number) => money(value));

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof vi };
  }
}

export default i18n;
