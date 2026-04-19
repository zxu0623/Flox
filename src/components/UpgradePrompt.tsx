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
    <div className={`rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-4 shadow-[var(--shadow-sm)] ${className}`}>
      <p className="text-sm text-[var(--ink)]">{t("upgradeProUnlockFeature", [featureName], language)}</p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void openPro()}
          className="rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--paper-3)]"
        >
          {t("learnFloxPro", undefined, language)}
        </button>
        {onClose ? (
          <button type="button" onClick={onClose} className="text-xs text-[var(--muted)] hover:text-[var(--ink)] hover:underline">
            {t("popupClose", undefined, language)}
          </button>
        ) : null}
      </div>
    </div>
  );
}
