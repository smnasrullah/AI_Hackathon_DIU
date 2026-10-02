// Fonts: self-hosted, latin + bengali subsets only, font-display: swap (fontsource default).
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/bricolage-grotesque/latin-700.css";
import "@fontsource/hind-siliguri/bengali-400.css";
import "@fontsource/hind-siliguri/bengali-500.css";
import "@fontsource/hind-siliguri/bengali-600.css";
import "@fontsource/hind-siliguri/latin-400.css";
import "@fontsource/hind-siliguri/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "./index.css";
import "./i18n";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { installPrefsSync } from "./features/account/prefsSync";
import { installThemeSync } from "./lib/theme";
import { App } from "./app/App";

installThemeSync();
installPrefsSync();

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
