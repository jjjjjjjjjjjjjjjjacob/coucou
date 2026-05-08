"use client";

import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { usePresetOptional } from "../tenant-template/use-preset";
import { countries, findCountryByCode } from "./config/countries";
import type { CountryOption } from "./config/types";
import { combineClassNames } from "./internal-utils";

interface CountrySelectorProps {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}

/**
 * Country code picker with searchable list. Triggers as a flag + dial code
 * chip on the left edge of the phone input. The popover content is
 * tenant-template-themed via the same `var(--tt-*)` tokens the rest of
 * the auth shell uses.
 */
export function CountrySelector({ value, onChange, disabled }: CountrySelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Radix Popover renders into a Portal at document.body, which escapes
  // <TenantTemplateProvider>'s CSS-var scope. Resolve concrete preset
  // colors here and apply them inline so the popover content stays
  // opaque and on-brand.
  const { preset } = usePresetOptional();

  const selectedCountry: CountryOption = useMemo(
    () => findCountryByCode(value) ?? countries[0],
    [value],
  );

  const filteredCountries = useMemo(() => {
    if (!search.trim()) return countries;
    const query = search.toLowerCase().trim();
    return countries.filter(
      (c) =>
        c.country.toLowerCase().includes(query) ||
        c.code.includes(query) ||
        c.iso.toLowerCase().includes(query),
    );
  }, [search]);

  const handleSelect = useCallback(
    (country: CountryOption) => {
      onChange(country.code);
      setOpen(false);
      setSearch("");
    },
    [onChange],
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={combineClassNames(
            "flex h-full items-center gap-1.5 px-3 py-3 transition-opacity",
            "focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            "hover:opacity-80",
          )}
          style={{
            color: "var(--tt-fg)",
            borderRight: "1px solid var(--tt-rule-strong)",
            background: "transparent",
          }}
        >
          <span className="text-base">{selectedCountry.flag}</span>
          <span className="text-sm font-medium tabular-nums">{selectedCountry.code}</span>
          <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--tt-fg-dim)" }} />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          className={combineClassNames(
            "z-50 w-72 p-2 shadow-xl",
            "animate-in fade-in-0 zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          )}
          style={{
            background: preset.bg2,
            border: `1px solid ${preset.ruleStrong}`,
            color: preset.fg,
            fontFamily: preset.text,
          }}
        >
          <div className="relative mb-2">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: preset.fgDim }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search countries…"
              autoFocus
              className="w-full py-2 pl-9 pr-3 text-sm focus:outline-none"
              style={{
                color: preset.fg,
                border: `1px solid ${preset.rule}`,
                background: preset.bg,
              }}
            />
          </div>

          <div className="max-h-64 overflow-y-auto">
            {filteredCountries.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm" style={{ color: preset.fgDim }}>
                No countries found
              </p>
            ) : (
              filteredCountries.map((country) => {
                const isSelected = country.code === value && country.iso === selectedCountry.iso;
                return (
                  <button
                    key={`${country.iso}-${country.code}`}
                    type="button"
                    onClick={() => handleSelect(country)}
                    className={combineClassNames(
                      "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                      "hover:opacity-80",
                    )}
                    style={{
                      background: isSelected ? preset.bg : "transparent",
                      color: preset.fg,
                    }}
                  >
                    <span className="text-lg">{country.flag}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{country.country}</p>
                    </div>
                    <span className="text-sm tabular-nums" style={{ color: preset.fgDim }}>
                      {country.code}
                    </span>
                    {isSelected ? (
                      <Check className="h-4 w-4 flex-shrink-0" style={{ color: preset.fg }} />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
