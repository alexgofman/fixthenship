import { codeEvidence, makeFinding, type RuleCheck } from "../finding";
import { findAll, isCode, SIGN_UP_CALL } from "../match";

const DELETES_ACCOUNT = /(?:delete|remove)[\s_-]*(?:my[\s_-]*|the[\s_-]*)?(?:account|user)(?![a-z])/i;

export const accountDeletion: RuleCheck = (files) => {
  const signUps = findAll(files, SIGN_UP_CALL, isCode);
  if (signUps.length === 0 || findAll(files, DELETES_ACCOUNT).length > 0) return null;
  return makeFinding(
    "R6",
    "high",
    "The app lets users create an account but nothing in the code deletes one, and a reviewer would likely reject an app that offers sign-up without in-app account deletion.",
    signUps.map((h) => codeEvidence(h, `Accounts are created here (${h.match.replace(/\s*\($/, "")})`)),
    "Confirm that deleting an account also removes the user's data from your backend, not only the login.",
  );
};
