"use client";

import React from "react";
import { StorageImageUpload } from "@/components/flyer-upload";

interface EventIconUploadProps {
  value?: string | null;
  onChange?: (storageId: string | null) => void;
}

export function EventIconUpload({
  value,
  onChange,
}: EventIconUploadProps) {
  return (
    <StorageImageUpload
      value={value}
      onChange={onChange}
      emptyStateTitle="Drag & drop icon here"
      emptyStateDescription="or click to select an image"
      uploadedTitle="Event icon uploaded"
      previewAlt="Event icon preview"
      helperText="Use a square PNG with transparent background if possible. Minimum recommended size is 192x192."
      removeButtonLabel="Remove icon"
    />
  );
}
