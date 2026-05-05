"use client";
import React from "react";
import { FlyerUpload } from "./flyer-upload";

export function FlyerUploadField({ name }: { name: string }) {
  const [val, setVal] = React.useState<string | null>(null);
  return (
    <div className="space-y-2">
      <FlyerUpload value={val} onChange={setVal} />
      <input type="hidden" name={name} value={val ?? ""} />
    </div>
  );
}

