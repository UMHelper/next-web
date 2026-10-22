import { EVAL_CASES, type EvalCase } from "./cases";
import { MULTILINGUAL_CASES } from "./multilingual-cases";
import { SMOKE_CASES } from "./smoke-cases";
import { TOKEN_CASES } from "./token-cases";

export const SUITES: Record<string, EvalCase[]> = {
  navigation: EVAL_CASES,
  tokens: TOKEN_CASES,
  multilingual: MULTILINGUAL_CASES,
  smoke: SMOKE_CASES,
};
