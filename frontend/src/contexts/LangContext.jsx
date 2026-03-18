import { createContext, useContext, useState, useEffect } from "react";
import T from "../i18n/translations";

const LangContext = createContext();

const RTL_LANGS = ["ar", "he"];

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem("lang") || "en");

  useEffect(() => {
    localStorage.setItem("lang", lang);
    const dir = RTL_LANGS.includes(lang) ? "rtl" : "ltr";
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", dir);
  }, [lang]);

  const t = (key) => T[lang]?.[key] || T.en[key] || key;
  const dir = RTL_LANGS.includes(lang) ? "rtl" : "ltr";
  const isRTL = RTL_LANGS.includes(lang);

  return (
    <LangContext.Provider value={{ lang, setLang, t, dir, isRTL }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
