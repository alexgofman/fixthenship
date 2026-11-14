import type { Fixable, RuleId } from "./types";

export type Rule = {
  id: RuleId;
  guideline: string;
  title: string;
  fixable: Fixable;
  tier: 1 | 2 | 3;
};

export const RULES: Rule[] = [
  { id: "R1", guideline: "2.1(a)", title: "The app loads without errors", fixable: "partly", tier: 1 },
  { id: "R2", guideline: "2.1(a)", title: "No placeholder content", fixable: "yes", tier: 1 },
  { id: "R3", guideline: "2.1", title: "No dead buttons or broken links", fixable: "yes", tier: 2 },
  { id: "R4", guideline: "2.1(a)", title: "The reviewer can get in", fixable: "partly", tier: 2 },
  { id: "R5", guideline: "5.1.1(i)", title: "A privacy policy is reachable in the app", fixable: "yes", tier: 1 },
  { id: "R6", guideline: "5.1.1(v)", title: "An account can be deleted in the app", fixable: "yes", tier: 1 },
  { id: "R7", guideline: "4.8", title: "Third-party login comes with an Apple option", fixable: "partly", tier: 1 },
  { id: "R8", guideline: "3.1.1", title: "Digital goods are not sold through outside checkout", fixable: "partly", tier: 1 },
  { id: "R9", guideline: "1.5", title: "A support or contact page exists", fixable: "yes", tier: 2 },
  { id: "R10", guideline: "4.2.6", title: "No app-builder badge or default branding", fixable: "yes", tier: 2 },
  { id: "R11", guideline: "5.1.2(i)", title: "No tracking or third-party AI calls before consent", fixable: "partly", tier: 3 },
  { id: "R12", guideline: "1.2", title: "User content can be reported and blocked", fixable: "yes", tier: 3 },
  { id: "R13", guideline: "4.2", title: '"Just a website" risk', fixable: "no", tier: 3 },
];

export function getRule(id: RuleId): Rule {
  const rule = RULES.find((r) => r.id === id);
  if (!rule) throw new Error(`Unknown rule ${id}`);
  return rule;
}
