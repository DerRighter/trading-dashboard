// Formulaire généré depuis le JSON Schema des paramètres d'une stratégie
// (/strategies). Bornes et défauts du schéma respectés ; aucun champ de
// période n'est jamais produit (l'API impose l'exploration).
import type { ApiStrategy, JsonSchemaProp } from "./api";

export type FieldKind = "integer" | "number" | "boolean" | "enum" | "string";
export interface Field {
  name: string;
  kind: FieldKind;
  default: unknown;
  options?: unknown[];
  min?: number;
  max?: number;
  exclusiveMin?: number;
  exclusiveMax?: number;
  description?: string;
}

/** Champs jamais affichés, même si un schéma les déclarait. */
export const PERIOD_FIELDS = ["period", "start", "end", "split", "confirmation", "control", "validation"];

function kindOf(p: JsonSchemaProp): FieldKind {
  if (p.enum) return "enum";
  const t = Array.isArray(p.type) ? p.type.find((x) => x !== "null") : p.type;
  if (t === "integer" || t === "number" || t === "boolean") return t;
  return "string";
}

export function fieldsFromSchema(schema: ApiStrategy["params_schema"]): Field[] {
  return Object.entries(schema.properties ?? {})
    .filter(([name]) => !PERIOD_FIELDS.includes(name))
    .map(([name, p]) => ({
      name, kind: kindOf(p), default: p.default, options: p.enum,
      min: p.minimum, max: p.maximum, exclusiveMin: p.exclusiveMinimum,
      exclusiveMax: p.exclusiveMaximum, description: p.description ?? p.title,
    }));
}

export function defaults(fields: Field[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.name, f.default === undefined || f.default === null
    ? "" : String(f.default)]));
}

/** Valeur saisie -> valeur typée, ou message d'erreur (bornes du schéma). */
export function coerce(f: Field, raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  if (f.kind === "boolean") return { ok: true, value: raw === "true" };
  if (f.kind === "enum") {
    const v = f.options?.find((o) => String(o) === raw);
    return v === undefined ? { ok: false, error: "valeur hors liste" } : { ok: true, value: v };
  }
  if (f.kind === "string") return { ok: true, value: raw };
  if (raw.trim() === "") return { ok: false, error: "valeur requise" };
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) return { ok: false, error: "nombre attendu" };
  if (f.kind === "integer" && !Number.isInteger(n)) return { ok: false, error: "entier attendu" };
  if (f.min !== undefined && n < f.min) return { ok: false, error: `minimum ${f.min}` };
  if (f.max !== undefined && n > f.max) return { ok: false, error: `maximum ${f.max}` };
  if (f.exclusiveMin !== undefined && n <= f.exclusiveMin) return { ok: false, error: `> ${f.exclusiveMin}` };
  if (f.exclusiveMax !== undefined && n >= f.exclusiveMax) return { ok: false, error: `< ${f.exclusiveMax}` };
  return { ok: true, value: n };
}

export function buildParams(fields: Field[], values: Record<string, string>):
  { params: Record<string, unknown>; errors: Record<string, string> } {
  const params: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const r = coerce(f, values[f.name] ?? "");
    if (r.ok) params[f.name] = r.value;
    else errors[f.name] = r.error;
  }
  return { params, errors };
}
