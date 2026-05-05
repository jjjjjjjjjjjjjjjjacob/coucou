"use client";
import React from "react";
import { DateTimePicker } from "@/components/date-time-picker";

type Props = {
  nameDate?: string;
  nameTime?: string;
  nameCombined?: string;
  label?: string;
  required?: boolean;
};

// A simple date + time field that also emits a hidden combined value suitable
// for server actions. Uses native inputs for reliability.
export function DateTimeField({
  nameDate = "eventDateOnly",
  nameTime = "eventTimeOnly",
  nameCombined = "eventDate",
  label = "Date & Time",
  required,
}: Props) {
  const [date, setDate] = React.useState<string>("");
  const [time, setTime] = React.useState("");

  const combined = React.useMemo(() => {
    if (!date) return "";
    // Build a local datetime string; server will parse as local time.
    const timeValue = time || "00:00";
    return `${date}T${timeValue}`;
  }, [date, time]);

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <DateTimePicker
        date={date || undefined}
        time={time || undefined}
        onDateChange={setDate}
        onTimeChange={setTime}
      />
      <input type="hidden" name={nameDate} value={date} />
      <input type="hidden" name={nameCombined} value={combined} />
    </div>
  );
}
