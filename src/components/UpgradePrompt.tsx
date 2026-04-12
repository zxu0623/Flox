import React from "react";
import { type LanguageCode, t } from "../utils/i18n";
import { MONETIZATION_ENABLED } from "../utils/plan";

type FeatureKey = "unlimitedWorkspaces" | "crossDeviceSync" | "smartClassification" | "statistics";

function getFeatureName(feature: FeatureKey, language: LanguageCode): string {
  switch (feature) {
    case "unlimitedWorkspaces":
      return t("proFeatureUnlimitedWorkspaces", undefined, language);
    case "crossDeviceSync":
      return t("proFeatureCrossDeviceSync", undefined, language);
    case "smartClassification":
      return t("proFeatureSmartClassification", undefined, language);
    case "statistics":
      return t("proFeatureStatistics", undefined, language);
  }
}

export function UpgradePrompt({
  feature,
  language,
  className = "",
  onClose
}: {
  feature: FeatureKey;
  language: LanguageCode;
  className?: string;
  onClose?: () => void;
}) {
  if (!MONETIZATION_ENABLED) {
    return null;
  }
  const featureName = getFeatureName(feature, language);
  const openPro = async () => {
    await chrome.tabs.create({ url: t("proLearnMoreUrl", undefined, language) });
  };

  return (
    <div className={`rounded-xl border border-amber-300 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-950/20 p-4 ${className}`}>
      <p className="text-sm text-amber-950 dark:text-amber-100">{t("upgradeProUnlockFeature", [featureName], language)}</p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void openPro()}
          className="rounded-md bg-amber-400 px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-amber-300 transition-colors duration-100"
        >
          {t("learnFloxPro", undefined, language)}
        </button>
        {onClose ? (
          <button type="button" onClick={onClose} className="text-xs text-amber-800 dark:text-amber-300/70 hover:text-amber-900 dark:text-amber-200 transition-colors duration-100">
            {t("popupClose", undefined, language)}
          </button>
        ) : null}
      </div>
    </div>
  );
}
