import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ja from "./ja.json" with { type: "json" };

i18n.use(initReactI18next).init({
  resources: {
    ja,
  },
  lng: "ja",
  fallbackLng: "en",
  debug: true,
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
