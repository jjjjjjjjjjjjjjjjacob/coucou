"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { useHaptic, type HapticFeedbackType } from "@/lib/hooks/use-haptic"

interface HapticSettings {
  enabled: boolean
  intensity: "low" | "medium" | "high"
}

interface HapticContextType {
  settings: HapticSettings
  updateSettings: (newSettings: Partial<HapticSettings>) => void
  trigger: (feedbackType?: HapticFeedbackType) => boolean
  isSupported: boolean
}

const HapticContext = createContext<HapticContextType | undefined>(undefined)

const STORAGE_KEY = "haptic-settings"

const DEFAULT_SETTINGS: HapticSettings = {
  enabled: true,
  intensity: "medium"
}

function getStoredSettings(): HapticSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return { ...DEFAULT_SETTINGS, ...parsed }
    }
  } catch (error) {
    console.warn("Failed to parse stored haptic settings:", error)
  }

  return DEFAULT_SETTINGS
}

function storeSettings(settings: HapticSettings) {
  if (typeof window === "undefined") return

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.warn("Failed to store haptic settings:", error)
  }
}

export function HapticProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<HapticSettings>(DEFAULT_SETTINGS)
  const { hapticFeedback, isHapticSupported, cleanup } = useHaptic()

  useEffect(() => {
    setSettings(getStoredSettings())
  }, [])

  useEffect(() => {
    storeSettings(settings)
  }, [settings])

  useEffect(() => {
    return cleanup
  }, [cleanup])

  const updateSettings = (newSettings: Partial<HapticSettings>) => {
    setSettings(prevSettings => ({ ...prevSettings, ...newSettings }))
  }

  const trigger = (feedbackType: HapticFeedbackType = "light") => {
    if (!settings.enabled || !isHapticSupported()) {
      return false
    }

    let adjustedFeedbackType = feedbackType

    if (feedbackType === "light" || feedbackType === "medium" || feedbackType === "heavy") {
      switch (settings.intensity) {
        case "low":
          adjustedFeedbackType = "light"
          break
        case "medium":
          adjustedFeedbackType = "medium"
          break
        case "high":
          adjustedFeedbackType = "heavy"
          break
      }
    }

    return hapticFeedback(adjustedFeedbackType)
  }

  const contextValue: HapticContextType = {
    settings,
    updateSettings,
    trigger,
    isSupported: isHapticSupported()
  }

  return (
    <HapticContext.Provider value={contextValue}>
      {children}
    </HapticContext.Provider>
  )
}

export function useHapticContext(): HapticContextType {
  const context = useContext(HapticContext)
  if (context === undefined) {
    throw new Error("useHapticContext must be used within a HapticProvider")
  }
  return context
}

export { type HapticSettings }