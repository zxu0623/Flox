export type UserPlan = "FREE" | "PRO";

/** When false: hide paywall UI and treat all plan-gated features as unlocked. Set to true to restore monetization. */
export const MONETIZATION_ENABLED = false;

export type FeatureKey =
  | "unlimitedWorkspaces"
  | "unlimitedPinnedLinks"
  | "crossDeviceSync"
  | "smartClassification"
  | "statistics";

const PLAN_STORAGE_KEY = "flox.userPlan";
const DEFAULT_PLAN: UserPlan = "FREE";

const PLAN_FEATURES: Record<UserPlan, Record<FeatureKey, boolean>> = {
  FREE: {
    unlimitedWorkspaces: false,
    unlimitedPinnedLinks: false,
    crossDeviceSync: false,
    smartClassification: false,
    statistics: false
  },
  PRO: {
    unlimitedWorkspaces: true,
    unlimitedPinnedLinks: true,
    crossDeviceSync: true,
    smartClassification: true,
    statistics: true
  }
};

export const PLAN_LIMITS = {
  FREE: {
    maxWorkspaces: 5,
    maxPinnedLinks: 20
  }
} as const;

export async function getUserPlan(): Promise<UserPlan> {
  const result = await chrome.storage.local.get(PLAN_STORAGE_KEY);
  const plan = result[PLAN_STORAGE_KEY];
  return plan === "PRO" ? "PRO" : DEFAULT_PLAN;
}

export async function setUserPlan(plan: UserPlan): Promise<void> {
  await chrome.storage.local.set({ [PLAN_STORAGE_KEY]: plan });
}

export async function checkFeature(feature: string): Promise<boolean> {
  if (!MONETIZATION_ENABLED) {
    return true;
  }
  if (!Object.prototype.hasOwnProperty.call(PLAN_FEATURES.FREE, feature)) {
    return true;
  }
  const plan = await getUserPlan();
  return PLAN_FEATURES[plan][feature as FeatureKey];
}
