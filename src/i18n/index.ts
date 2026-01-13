import i18n from 'i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { initReactI18next } from 'react-i18next';

const defaultLocale = 'pl';

void i18n
  .use(
    resourcesToBackend((language: string) => {
      return import(`./locales/${language}.json`);
    })
  )
  .use(initReactI18next)
  .init({
    lng: defaultLocale,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    react: { useSuspense: true },
  });

export default i18n;
