import { EVAL_CASES, type EvalCase } from "./cases";
import { TOKEN_CASES } from "./token-cases";

export const SUITES: Record<string, EvalCase[]> = { navigation: EVAL_CASES, tokens: TOKEN_CASES };
