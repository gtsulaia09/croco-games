import { Play, ScrollText } from "lucide-react";
import { useT } from "../i18n";
import { JOKER_KHISHTI, JOKER_NINE_TRUMP, JOKER_PREMIA, type JokerKhishti, type JokerNineTrump, type JokerPremia } from "./options";

export type JokerRuleset = "standard" | "nines";

export interface JokerTableRules {
  ruleset: JokerRuleset;
  setBonus: JokerPremia;
  hist: JokerKhishti;
  /** Nine-card deals: the player after the dealer declares trump, or the dealer's last card shows it. */
  nineTrump: JokerNineTrump;
}

export const DEFAULT_JOKER_RULES: JokerTableRules = { ruleset: "standard", setBonus: "eraseLast", hist: "perCard", nineTrump: "choose" };

/** Reads table rules from URL parameters, falling back to the defaults for anything unknown. */
export function jokerRulesFromParams(params: URLSearchParams): JokerTableRules {
  const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);
  return {
    ruleset: pick(params.get("ruleset"), ["standard", "nines"] as const, DEFAULT_JOKER_RULES.ruleset),
    setBonus: pick(params.get("premia"), JOKER_PREMIA, DEFAULT_JOKER_RULES.setBonus),
    hist: pick(params.get("khishti"), JOKER_KHISHTI, DEFAULT_JOKER_RULES.hist),
    nineTrump: pick(params.get("trump"), JOKER_NINE_TRUMP, DEFAULT_JOKER_RULES.nineTrump),
  };
}

export function jokerRulesToParams(rules: JokerTableRules): Record<string, string> {
  const out: Record<string, string> = {};
  if (rules.ruleset !== DEFAULT_JOKER_RULES.ruleset) out.ruleset = rules.ruleset;
  if (rules.setBonus !== DEFAULT_JOKER_RULES.setBonus) out.premia = rules.setBonus;
  if (rules.hist !== DEFAULT_JOKER_RULES.hist) out.khishti = rules.hist;
  if (rules.nineTrump !== DEFAULT_JOKER_RULES.nineTrump) out.trump = rules.nineTrump;
  return out;
}

function Choice<T extends string>({ name, legend, value, options, label, hint, onChange }: { name: string; legend: string; value: T; options: readonly T[]; label(v: T): string; hint?(v: T): string; onChange(v: T): void }) {
  return (
    <fieldset className="jsetup-group">
      <legend>{legend}</legend>
      <div className="jsetup-options" data-count={options.length}>
        {options.map((v) => (
          <label key={v} className="jsetup-option" data-checked={v === value ? "true" : "false"}>
            <input type="radio" name={name} value={v} checked={v === value} onChange={() => onChange(v)} />
            <b>{label(v)}</b>
            {hint && <span>{hint(v)}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Before a Joker practice game: clean, effortless rule cards for format, premia,
 * nine-card trump declaration, and khishti penalty.
 */
export function JokerSetup({ rules, onChange, onStart }: { rules: JokerTableRules; onChange(patch: Partial<JokerTableRules>): void; onStart(): void }) {
  const t = useT();
  return (
    <form
      className="jsetup fade-in"
      onSubmit={(e) => {
        e.preventDefault();
        onStart();
      }}
    >
      <div className="jsetup-head">
        <div className="jsetup-head-main">
          <span className="jsetup-icon">
            <ScrollText size={20} />
          </span>
          <div className="min-w-0">
            <h2>{t("joker.setupTitle")}</h2>
            <p>{t("joker.setupText")}</p>
          </div>
        </div>
      </div>
      <Choice
        name="ruleset"
        legend={t("opt.ruleset")}
        value={rules.ruleset}
        options={["standard", "nines"] as const}
        label={(v) => t(`joker.rulesets.${v}`)}
        onChange={(ruleset) => onChange({ ruleset })}
      />
      <Choice
        name="premia"
        legend={t("opt.setBonus")}
        value={rules.setBonus}
        options={JOKER_PREMIA}
        label={(v) => t(`opt.values.${v}`)}
        hint={(v) => t(`opt.hints.${v}`)}
        onChange={(setBonus) => onChange({ setBonus })}
      />
      <Choice
        name="nineTrump"
        legend={t("opt.nineTrump")}
        value={rules.nineTrump}
        options={JOKER_NINE_TRUMP}
        label={(v) => t(`opt.values.${v}`)}
        hint={(v) => t(`opt.hints.${v}`)}
        onChange={(nineTrump) => onChange({ nineTrump })}
      />
      <Choice
        name="khishti"
        legend={t("opt.hist")}
        value={rules.hist}
        options={JOKER_KHISHTI}
        label={(v) => t(`opt.values.${v}`)}
        onChange={(hist) => onChange({ hist })}
      />
      <p className="jsetup-note">{t(`opt.hints.${rules.hist}`)}</p>
      <button type="submit" className="btn-primary btn-lg w-full sm:w-auto sm:justify-self-end sm:px-9">
        <Play size={16} className="fill-current" /> {t("joker.start")}
      </button>
    </form>
  );
}
