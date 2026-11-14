import { codeEvidence, makeFinding, quote, type RuleCheck } from "../finding";
import { findAll, findInText, uniqueLines } from "../match";

const CHECKOUT = /buy\.stripe\.com|checkout\.stripe\.com|\bredirectToCheckout\b|paddle\.com|lemonsqueezy|gumroad\.com/gi;
const DIGITAL_GOODS = /\bsubscriptions?\b|\bsubscribe\b|\bplans\b|\bpremium\b|\bcredits\b|\bpricing\b/gi;
const PRO_TIER = /\bPro\b/g;

export const outsideCheckout: RuleCheck = (files) => {
  const appFiles = files.filter((f) => !/\.(test|spec)\.[jt]sx?$/.test(f.path) && !f.path.endsWith("package.json"));
  const checkouts = findAll(appFiles, CHECKOUT);
  if (checkouts.length === 0) return null;
  // Only words on screen tell what is sold; `data.subscription` from an auth listener is not a subscription.
  const goods = uniqueLines([...findInText(appFiles, DIGITAL_GOODS), ...findInText(appFiles, PRO_TIER)]);
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
