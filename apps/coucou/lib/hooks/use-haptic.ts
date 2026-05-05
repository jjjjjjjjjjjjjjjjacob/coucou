"use client"

import { useCallback, useRef } from "react"

export type HapticFeedbackType =
  | "light"
  | "medium"
  | "heavy"
  | "selection"
  | "success"
  | "warning"
  | "error"

interface HapticPatterns {
  light: number[]
  medium: number[]
  heavy: number[]
  selection: number[]
  success: number[]
  warning: number[]
  error: number[]
}

const HAPTIC_PATTERNS: HapticPatterns = {
  light: [10],
  medium: [20],
  heavy: [40],
  selection: [5],
  success: [10, 50, 10],
  warning: [20, 100, 20],
  error: [50, 100, 50, 100, 50]
}

export function useHaptic() {
  const hiddenSwitchRef = useRef<HTMLInputElement | null>(null)

  const isVibrationApiSupported = useCallback(() => {
    return typeof navigator !== "undefined" && "vibrate" in navigator
  }, [])

  const isSafariHapticSupported = useCallback(() => {
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""
    const isSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent)
    return isSafari && typeof document !== "undefined"
  }, [])

  const createHiddenSwitch = useCallback(() => {
    if (hiddenSwitchRef.current) return hiddenSwitchRef.current

    const switchElement = document.createElement("input")
    switchElement.type = "checkbox"
    switchElement.style.position = "absolute"
    switchElement.style.left = "-9999px"
    switchElement.style.opacity = "0"
    switchElement.style.pointerEvents = "none"
    switchElement.setAttribute("role", "switch")

    document.body.appendChild(switchElement)
    hiddenSwitchRef.current = switchElement

    return switchElement
  }, [])

  const triggerSafariHaptic = useCallback(() => {
    if (!isSafariHapticSupported()) return false

    try {
      const switchElement = createHiddenSwitch()
      switchElement.checked = !switchElement.checked
      switchElement.focus()
      switchElement.blur()
      return true
    } catch (error) {
      console.warn("Failed to trigger Safari haptic feedback:", error)
      return false
    }
  }, [isSafariHapticSupported, createHiddenSwitch])

  const triggerVibration = useCallback((pattern: number[]) => {
    if (!isVibrationApiSupported()) return false

    try {
      navigator.vibrate(pattern)
      return true
    } catch (error) {
      console.warn("Failed to trigger vibration:", error)
      return false
    }
  }, [isVibrationApiSupported])

  const hapticFeedback = useCallback((feedbackType: HapticFeedbackType = "light") => {
    const pattern = HAPTIC_PATTERNS[feedbackType]

    let triggered = false

    if (isSafariHapticSupported()) {
      triggered = triggerSafariHaptic()
    }

    if (!triggered && isVibrationApiSupported()) {
      triggered = triggerVibration(pattern)
    }

    return triggered
  }, [isSafariHapticSupported, triggerSafariHaptic, isVibrationApiSupported, triggerVibration])

  const isHapticSupported = useCallback(() => {
    return isVibrationApiSupported() || isSafariHapticSupported()
  }, [isVibrationApiSupported, isSafariHapticSupported])

  const cleanup = useCallback(() => {
    if (hiddenSwitchRef.current && document.body.contains(hiddenSwitchRef.current)) {
      document.body.removeChild(hiddenSwitchRef.current)
      hiddenSwitchRef.current = null
    }
  }, [])

  return {
    hapticFeedback,
    isHapticSupported,
    cleanup,
    light: () => hapticFeedback("light"),
    medium: () => hapticFeedback("medium"),
    heavy: () => hapticFeedback("heavy"),
    selection: () => hapticFeedback("selection"),
    success: () => hapticFeedback("success"),
    warning: () => hapticFeedback("warning"),
    error: () => hapticFeedback("error")
  }
}