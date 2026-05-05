"use client";
import React from "react";
import { Calendar as CalendarIcon, ChevronDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectOption } from "@/components/ui/select";
import { getTimeZoneOptions } from "@/lib/date-utils";

export type DateTimePickerProps = {
  date: string | undefined; // YYYY-MM-DD
  time: string | undefined; // HH:mm
  timezone?: string | undefined;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onTimezoneChange?: (value: string) => void;
  className?: string;
  buttonClassName?: string;
};

export function DateTimePicker({
  date,
  time,
  timezone,
  onDateChange,
  onTimeChange,
  onTimezoneChange,
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  const selectedDate = React.useMemo(() => {
    if (!date) return undefined;
    const [year, month, day] = date
      .split("-")
      .map((value) => parseInt(value, 10));
    if (!year || !month || !day) return undefined;
    return new Date(year, month - 1, day);
  }, [date]);

  const formattedDate = React.useMemo(() => {
    if (!selectedDate) return "Select date";
    return selectedDate.toLocaleDateString();
  }, [selectedDate]);

  const timezoneOptions = React.useMemo(() => getTimeZoneOptions(), []);
  const fromYear = React.useMemo(() => selectedDate?.getFullYear() ?? new Date().getFullYear(), [selectedDate]);
  const yearRangeStart = fromYear - 10;
  const yearRangeEnd = fromYear + 10;
  const resolvedTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-end gap-6">
        <div className="flex flex-col gap-3">
          <Label htmlFor="date-picker" className="px-1">
            Date
          </Label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                id="date-picker"
                className={cn(
                  "w-40 justify-between font-normal",
                  !selectedDate && "text-muted-foreground",
                )}
              >
                {formattedDate}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto overflow-hidden p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                defaultMonth={selectedDate}
                captionLayout="dropdown"
                fromYear={yearRangeStart}
                toYear={yearRangeEnd}
                onSelect={(nextDate) => {
                  if (!nextDate) return;
                  const year = nextDate.getFullYear();
                  const month = String(nextDate.getMonth() + 1).padStart(2, "0");
                  const day = String(nextDate.getDate()).padStart(2, "0");
                  onDateChange(`${year}-${month}-${day}`);
                  setOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-col gap-3 min-w-[9rem]">
          <Label htmlFor="time-picker" className="px-1">
            Time
          </Label>
          <Input
            id="time-picker"
            type="time"
            step={60}
            value={time || ""}
            onChange={(event) => onTimeChange(event.target.value)}
            className="w-full"
          />
        </div>

        {onTimezoneChange && (
          <div className="flex flex-col gap-3 min-w-[12rem] flex-1">
            <Label htmlFor="timezone-picker" className="px-1">
              Timezone
            </Label>
            <Select
              id="timezone-picker"
              value={resolvedTimezone}
              onValueChange={(value) => onTimezoneChange(value)}
              className="h-10"
            >
              {timezoneOptions.map((option) => (
                <SelectOption key={option.value} value={option.value}>
                  {option.label}
                </SelectOption>
              ))}
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
