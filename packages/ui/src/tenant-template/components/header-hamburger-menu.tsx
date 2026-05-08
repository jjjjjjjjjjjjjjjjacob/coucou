"use client";

import Link from "next/link";
import {
  type CSSProperties,
  type MouseEventHandler,
  type ReactNode,
  useCallback,
  useState,
} from "react";
import { Drawer as Vaul } from "vaul";
import { usePresetOptional } from "../use-preset";

export interface HeaderHamburgerMenuProps {
  /**
   * Items rendered inside the drawer. Use the exported `HamburgerMenuItem`
   * and `HamburgerMenuSection` for the styled set, or pass arbitrary JSX.
   */
  children: ReactNode;
  /**
   * Pixel size of the trigger square. Defaults to 32 (header-friendly).
   */
  size?: number;
  /**
   * Brand wordmark shown at the top of the open drawer. Helps anchor the
   * drawer to the tenant identity. Defaults to the resolved preset name.
   */
  brandName?: string;
  /**
   * `aria-label` for the trigger button. Defaults to "Menu".
   */
  triggerLabel?: string;
}

/**
 * Animated hamburger trigger + top-down vaul drawer. Three lines morph into
 * an X when open. The drawer slides in from the top edge with the active
 * preset's --tt-bg / --tt-fg tokens applied so it matches the rest of the
 * chrome.
 *
 * Layout is tightened compared to the previous slide-in panel: the brand
 * wordmark steps up slightly so the drawer header anchors against the
 * masthead, and menu items step down so the jump from header text to menu
 * items reads as one editorial scale instead of two disconnected sizes.
 */
export function HeaderHamburgerMenu({
  children,
  size = 32,
  brandName,
  triggerLabel = "Menu",
}: HeaderHamburgerMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { preset, presetKey } = usePresetOptional();
  const resolvedBrand = brandName ?? preset.name;

  const close = useCallback(() => setIsOpen(false), []);

  return (
    <Vaul.Root open={isOpen} onOpenChange={setIsOpen} direction="top" shouldScaleBackground>
      <Vaul.Trigger asChild>
        <button
          type="button"
          aria-label={triggerLabel}
          aria-haspopup="dialog"
          style={{
            width: size,
            height: size,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "none",
            color: "var(--tt-fg)",
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
          }}
        >
          <HamburgerIcon isOpen={isOpen} />
        </button>
      </Vaul.Trigger>

      <Vaul.Portal>
        <Vaul.Overlay
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0, 0, 0, 0.4)",
          }}
        />
        <Vaul.Content
          aria-describedby={undefined}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 101,
            display: "flex",
            flexDirection: "column",
            maxHeight: "85vh",
            background: preset.bg,
            color: preset.fg,
            fontFamily: preset.text,
            outline: "none",
            // Make preset tokens available to descendants (HamburgerMenuItem
            // etc.) since the portaled content renders outside the
            // <TenantTemplateProvider> tree.
            ["--tt-bg" as string]: preset.bg,
            ["--tt-fg" as string]: preset.fg,
            ["--tt-fg-dim" as string]: preset.fgDim,
            ["--tt-fg-mute" as string]: preset.fgMute,
            ["--tt-rule" as string]: preset.rule,
            ["--tt-rule-strong" as string]: preset.ruleStrong,
            ["--tt-display" as string]: preset.display,
            ["--tt-text" as string]: preset.text,
          }}
        >
          <Vaul.Title className="sr-only">{resolvedBrand} navigation</Vaul.Title>
          <header
            className="flex w-full items-center px-6 py-5 sm:px-12"
            style={{
              borderBottom: `1px solid ${preset.rule}`,
              gap: 16,
              minHeight: 32,
            }}
          >
            <span
              className="inline-flex items-center"
              style={{
                color: preset.fg,
                fontFamily: preset.display,
                fontWeight: presetKey === "dojo" ? 600 : 500,
                letterSpacing: preset.upper ? "0.02em" : "-0.005em",
                fontSize: 14,
                height: 32,
                lineHeight: 1,
              }}
            >
              {preset.upper ? resolvedBrand.toUpperCase() : resolvedBrand}
            </span>
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              style={{
                marginLeft: "auto",
                width: 32,
                height: 32,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "none",
                color: preset.fg,
                cursor: "pointer",
                padding: 0,
              }}
            >
              <HamburgerIcon isOpen />
            </button>
          </header>

          <nav
            aria-label="Site navigation"
            className="px-6 sm:px-12"
            style={{
              flex: 1,
              overflowY: "auto",
              paddingTop: 24,
              paddingBottom: 32,
              width: "100%",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <PanelClickToClose onClose={close}>{children}</PanelClickToClose>
          </nav>

          <Vaul.Handle
            className="mx-auto mb-2 mt-1"
            style={{
              width: 56,
              height: 4,
              borderRadius: 9999,
              background: preset.ruleStrong,
              flexShrink: 0,
            }}
          />
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  );
}

interface HamburgerIconProps {
  isOpen: boolean;
}

function HamburgerIcon({ isOpen }: HamburgerIconProps) {
  // Three line spans absolutely positioned over a 20×14 box. CSS transforms
  // morph them: top + bottom converge into the center and rotate ±45°,
  // middle fades out.
  const lineBase: CSSProperties = {
    position: "absolute",
    left: 0,
    width: 20,
    height: 1.5,
    background: "currentColor",
    transition:
      "top 220ms cubic-bezier(0.65, 0, 0.35, 1), opacity 140ms ease, transform 220ms cubic-bezier(0.65, 0, 0.35, 1)",
    transformOrigin: "center",
  };

  return (
    <span
      aria-hidden="true"
      style={{
        position: "relative",
        display: "inline-block",
        width: 20,
        height: 14,
      }}
    >
      <span
        style={{
          ...lineBase,
          top: isOpen ? 6 : 0,
          transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
        }}
      />
      <span
        style={{
          ...lineBase,
          top: 6,
          opacity: isOpen ? 0 : 1,
          transition: "opacity 100ms ease",
        }}
      />
      <span
        style={{
          ...lineBase,
          top: isOpen ? 6 : 12,
          transform: isOpen ? "rotate(-45deg)" : "rotate(0deg)",
        }}
      />
    </span>
  );
}

interface PanelClickToCloseProps {
  onClose: () => void;
  children: ReactNode;
}

function PanelClickToClose({ onClose, children }: PanelClickToCloseProps) {
  const handleClick: MouseEventHandler<HTMLDivElement> = (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("[data-hamburger-close]")) {
      onClose();
    }
  };
  return (
    <div onClick={handleClick} style={{ display: "contents" }}>
      {children}
    </div>
  );
}

export interface HamburgerMenuItemProps {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  /**
   * When true, render in a dimmer color (e.g. for sub-actions like sign-out).
   */
  dim?: boolean;
}

/**
 * One row in the drawer. Editorial type, hairline border below, full-width
 * tap target. Renders as a `<Link>` if `href` is provided, otherwise as a
 * `<button>`. Sized to feel proportional to the masthead instead of dwarfing
 * it — about 1.3× the masthead's 13px so the two reads as one scale.
 */
export function HamburgerMenuItem({
  href,
  onClick,
  children,
  dim = false,
}: HamburgerMenuItemProps) {
  const itemStyle: CSSProperties = {
    display: "block",
    width: "100%",
    padding: "14px 0",
    borderBottom: "1px solid var(--tt-rule)",
    fontFamily: "var(--tt-display)",
    fontSize: 18,
    fontWeight: 400,
    letterSpacing: "-0.005em",
    color: dim ? "var(--tt-fg-dim)" : "var(--tt-fg)",
    background: "transparent",
    border: "none",
    borderTop: "none",
    borderLeft: "none",
    borderRight: "none",
    textAlign: "left",
    cursor: "pointer",
    textDecoration: "none",
    transition: "opacity 150ms ease",
  };

  if (href) {
    return (
      <Link href={href} data-hamburger-close style={itemStyle} className="hover:opacity-80">
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      data-hamburger-close
      onClick={onClick}
      style={itemStyle}
      className="hover:opacity-80"
    >
      {children}
    </button>
  );
}

export interface HamburgerMenuSectionProps {
  label: string;
  children: ReactNode;
}

/**
 * Optional eyebrow above a group of items. Tighter spacing than the previous
 * version so adjacent sections feel related instead of detached.
 */
export function HamburgerMenuSection({ label, children }: HamburgerMenuSectionProps) {
  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--tt-fg-mute)",
          marginBottom: 4,
          paddingBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
