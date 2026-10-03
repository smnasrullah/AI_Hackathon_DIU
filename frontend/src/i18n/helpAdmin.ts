import i18n from "i18next";

import bn from "./helpAdmin.bn.json";
import en from "./helpAdmin.en.json";

// Admin help-settings wording (demo mode, scheduler, dry-run list) lives in its own namespace,
// bundled with the admin page chunk, so it never weighs on the first load (bundle budget).
export const HELP_ADMIN_NS = "helpAdmin";

for (const [lang, dict] of [["en", en], ["bn", bn]] as const) {
  if (!i18n.hasResourceBundle(lang, HELP_ADMIN_NS)) i18n.addResourceBundle(lang, HELP_ADMIN_NS, dict, true, true);
}
