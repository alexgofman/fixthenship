import { codeEvidence, makeFinding, quote, type RuleCheck } from "../finding";
import { findAll, uniqueLines } from "../match";

const CHECKOUT = /buy\.stripe\.com|\bstripe\b|\bcheckout\b|paddle\.com|@paddle\/|lemonsqueezy|gumroad\.com/gi;
const DIGITAL_GOODS = /\bsubscriptions?\b|\bsubscribe\b|\bplans\b|\bpremium\b|\bcredits\b|\bpricing\b/gi;
const PRO_TIER = /\bPro\b/g;

export const outsideCheckout: RuleCheck = (files) => {
  const checkouts = findAll(files, CHECKOUT);
  if (checkouts.length === 0) return null;
  const appFiles = files.filter((f) => !f.path.endsWith("package.json"));
  const goods = uniqueLines([...findAll(appFiles, DIGITAL_GOODS), ...findAll(appFiles, PRO_TIER)]);
  if (goods.length === 0) return null;
  return makeFinding(
    "R8",
    "medium",
    `The app sends users to an outside checkout (${quote(checkouts[0].match)}) for digital goods such as ${quote(goods[0].match)}, which a reviewer would likely reject in favour of In-App Purchase.`,
    [
      ...checkouts.slice(0, 3).map((h) => codeEvidence(h, `Outside checkout ${quote(h.match)}`)),
      ...goods.slice(0, 2).map((h) => codeEvidence(h, `Digital goods ${quote(h.match)}`)),
    ],
    "Decide whether these purchases must move to In-App Purchase on iOS; outside checkout for digital goods is a likely rejection risk.",
  );
};
