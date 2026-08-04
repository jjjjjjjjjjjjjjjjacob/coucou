"use client";

import * as React from "react";

export type DashboardAppearance = "dark" | "light";

const DASHBOARD_APPEARANCE_STORAGE_KEY = "coucou-dashboard-appearance";
const DASHBOARD_LIGHT_MODE_CLASS_NAME = "maison-dashboard-light";
const dashboardAppearanceSubscribers = new Set<() => void>();
let cachedDashboardAppearance: DashboardAppearance = "dark";
let removeDashboardAppearanceStorageListener: (() => void) | null = null;

function isDashboardAppearance(value: string | null): value is DashboardAppearance {
  return value === "dark" || value === "light";
}

function getStoredDashboardAppearance(): DashboardAppearance {
  if (typeof window === "undefined") {
    return cachedDashboardAppearance;
  }

  try {
    const storedDashboardAppearance = window.localStorage.getItem(DASHBOARD_APPEARANCE_STORAGE_KEY);

    if (isDashboardAppearance(storedDashboardAppearance)) {
      cachedDashboardAppearance = storedDashboardAppearance;
    } else {
      cachedDashboardAppearance = "dark";
    }
  } catch {
    return cachedDashboardAppearance;
  }

  return cachedDashboardAppearance;
}

function applyDashboardAppearance(dashboardAppearance: DashboardAppearance) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.classList.toggle(
    DASHBOARD_LIGHT_MODE_CLASS_NAME,
    dashboardAppearance === "light",
  );
  document.documentElement.dataset.dashboardAppearance = dashboardAppearance;
}

function clearDashboardAppearance() {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.classList.remove(DASHBOARD_LIGHT_MODE_CLASS_NAME);
  delete document.documentElement.dataset.dashboardAppearance;
}

function storeDashboardAppearance(dashboardAppearance: DashboardAppearance) {
  cachedDashboardAppearance = dashboardAppearance;

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(DASHBOARD_APPEARANCE_STORAGE_KEY, dashboardAppearance);
  } catch {
    return;
  }
}

function notifyDashboardAppearanceSubscribers() {
  for (const subscriber of Array.from(dashboardAppearanceSubscribers)) {
    subscriber();
  }
}

function getServerDashboardAppearance(): DashboardAppearance {
  return "dark";
}

function subscribeToDashboardAppearance(subscriber: () => void): () => void {
  dashboardAppearanceSubscribers.add(subscriber);

  if (typeof window !== "undefined" && !removeDashboardAppearanceStorageListener) {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== DASHBOARD_APPEARANCE_STORAGE_KEY) {
        return;
      }

      if (isDashboardAppearance(event.newValue)) {
        cachedDashboardAppearance = event.newValue;
        applyDashboardAppearance(event.newValue);
      } else {
        cachedDashboardAppearance = "dark";
        applyDashboardAppearance("dark");
      }
      notifyDashboardAppearanceSubscribers();
    };

    window.addEventListener("storage", handleStorageChange);
    removeDashboardAppearanceStorageListener = () => {
      window.removeEventListener("storage", handleStorageChange);
      removeDashboardAppearanceStorageListener = null;
    };
  }

  return () => {
    dashboardAppearanceSubscribers.delete(subscriber);
    if (dashboardAppearanceSubscribers.size === 0) {
      removeDashboardAppearanceStorageListener?.();
      clearDashboardAppearance();
    }
  };
}

function initializeDashboardAppearance() {
  applyDashboardAppearance(getStoredDashboardAppearance());
}

function useDashboardAppearance() {
  const dashboardAppearance = React.useSyncExternalStore(
    subscribeToDashboardAppearance,
    getStoredDashboardAppearance,
    getServerDashboardAppearance,
  );

  React.useEffect(() => {
    applyDashboardAppearance(dashboardAppearance);
  }, [dashboardAppearance]);

  const setDashboardAppearance = React.useCallback((appearance: DashboardAppearance) => {
    storeDashboardAppearance(appearance);
    applyDashboardAppearance(appearance);
    notifyDashboardAppearanceSubscribers();
  }, []);

  const toggleDashboardAppearance = React.useCallback(() => {
    const nextAppearance = dashboardAppearance === "light" ? "dark" : "light";
    setDashboardAppearance(nextAppearance);
  }, [dashboardAppearance, setDashboardAppearance]);

  const isLightModeEnabled = dashboardAppearance === "light";

  return {
    dashboardAppearance,
    setDashboardAppearance,
    toggleDashboardAppearance,
    isLightModeEnabled,
  };
}

export {
  clearDashboardAppearance,
  DASHBOARD_APPEARANCE_STORAGE_KEY,
  DASHBOARD_LIGHT_MODE_CLASS_NAME,
  initializeDashboardAppearance,
  useDashboardAppearance,
};
