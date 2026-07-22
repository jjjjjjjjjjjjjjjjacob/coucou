"use client";

import * as React from "react";

export type DashboardAppearance = "dark" | "light";

const DASHBOARD_APPEARANCE_STORAGE_KEY = "coucou-dashboard-appearance";
const DASHBOARD_LIGHT_MODE_CLASS_NAME = "maison-dashboard-light";

function isDashboardAppearance(value: string | null): value is DashboardAppearance {
  return value === "dark" || value === "light";
}

function getStoredDashboardAppearance(): DashboardAppearance {
  if (typeof window === "undefined") {
    return "dark";
  }

  try {
    const storedDashboardAppearance = window.localStorage.getItem(DASHBOARD_APPEARANCE_STORAGE_KEY);

    return isDashboardAppearance(storedDashboardAppearance) ? storedDashboardAppearance : "dark";
  } catch {
    return "dark";
  }
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
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(DASHBOARD_APPEARANCE_STORAGE_KEY, dashboardAppearance);
  } catch {
    return;
  }
}

function useDashboardAppearance() {
  const [dashboardAppearance, setDashboardAppearanceState] =
    React.useState<DashboardAppearance>("dark");

  React.useEffect(() => {
    const storedDashboardAppearance = getStoredDashboardAppearance();
    setDashboardAppearanceState(storedDashboardAppearance);
    applyDashboardAppearance(storedDashboardAppearance);
    return clearDashboardAppearance;
  }, []);

  const setDashboardAppearance = React.useCallback((appearance: DashboardAppearance) => {
    setDashboardAppearanceState(appearance);
    storeDashboardAppearance(appearance);
    applyDashboardAppearance(appearance);
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
  DASHBOARD_APPEARANCE_STORAGE_KEY,
  DASHBOARD_LIGHT_MODE_CLASS_NAME,
  useDashboardAppearance,
};
