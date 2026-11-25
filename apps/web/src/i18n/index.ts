import { create } from "zustand";
import { en, type Dictionary } from "./en";
import { ka } from "./ka";

export type Locale = "ka" | "en";
const DICTS: Record<Locale, Dictionary> = { ka, en };

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem("croco.locale"); // non-sensitive UI preference only
    if (stored === "en" || stored === "ka") return stored;
  } catch {
    /* storage unavailable */
  }
  return "ka";
}

interface LocaleState {
  locale: Locale;
  setLocale(l: Locale): void;
}

export const useLocale = create<LocaleState>((set) => ({
  locale: initialLocale(),
  setLocale(locale) {
    try {
      localStorage.setItem("croco.locale", locale);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = locale;
    set({ locale });
  },
}));

function lookup(dict: Dictionary, key: string): string | null {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) node = (node as Record<string, unknown>)[part];
    else return null;
  }
  return typeof node === "string" ? node : null;
}

export type TFunction = (key: string, params?: Record<string, string | number>) => string;

export function translate(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const template = lookup(DICTS[locale], key) ?? lookup(en, key) ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (name in params ? String(params[name]) : `{${name}}`));
}

export function useT(): TFunction {
  const locale = useLocale((s) => s.locale);
  return (key, params) => translate(locale, key, params);
}
