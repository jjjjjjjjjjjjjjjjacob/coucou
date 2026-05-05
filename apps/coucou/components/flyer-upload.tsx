"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export interface StorageImageUploadProps {
  value?: string | null;
  onChange?: (storageId: string | null) => void;
  emptyStateTitle: string;
  emptyStateDescription: string;
  uploadingLabel?: string;
  uploadedTitle: string;
  previewAlt: string;
  removeButtonLabel?: string;
  helperText?: React.ReactNode;
}

export function StorageImageUpload({
  value,
  onChange,
  emptyStateTitle,
  emptyStateDescription,
  uploadingLabel = "Uploading…",
  uploadedTitle,
  previewAlt,
  removeButtonLabel = "Remove",
  helperText,
}: StorageImageUploadProps) {
  const generateUrl = useMutation(api.files.generateUploadUrl);
  const preview = useQuery(
    api.files.getUrl,
    value ? { storageId: value as Id<"_storage"> } : "skip",
  );
  const [dragOver, setDragOver] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  const handleFiles = React.useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      if (!file.type.startsWith("image/")) {
        alert("Please upload an image file");
        return;
      }
      setUploading(true);
      try {
        const { url } = await generateUrl({});
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json?.message || "Upload failed");
        const storageId = json.storageId as string;
        onChange?.(storageId);
      } catch (error: unknown) {
        const errorDetails = error as Error;
        alert(errorDetails?.message || "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [generateUrl, onChange],
  );

  return (
    <div className="space-y-2">
      <div
        className={`rounded border-2 border-dashed p-4 text-sm text-center cursor-pointer ${dragOver ? "bg-foreground/5" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          handleFiles(event.dataTransfer.files);
        }}
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.onchange = () => handleFiles(input.files);
          input.click();
        }}
      >
        {uploading ? (
          <div>{uploadingLabel}</div>
        ) : value ? (
          <div className="flex items-center gap-3">
            {preview?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.url}
                alt={previewAlt}
                className="h-20 w-20 object-cover rounded border"
                onError={(event) => {
                  console.error(
                    "Failed to load preview image:",
                    preview.url,
                  );
                  event.currentTarget.style.display = "none";
                  const fallback = event.currentTarget
                    .nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = "block";
                }}
              />
            ) : (
              <div className="h-20 w-20 bg-foreground/10 rounded flex items-center justify-center text-xs text-foreground/50">
                Loading...
              </div>
            )}
            <div
              className="h-20 w-20 bg-foreground/10 rounded flex items-center justify-center text-xs text-foreground/50"
              style={{ display: "none" }}
            >
              Failed to load
            </div>
            <div className="text-left">
              <div className="font-medium">{uploadedTitle}</div>
              <div className="text-foreground/70 text-xs break-all">{value}</div>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onChange?.(null)}
                >
                  {removeButtonLabel}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="font-medium">{emptyStateTitle}</div>
            <div className="text-foreground/70">{emptyStateDescription}</div>
          </div>
        )}
      </div>
      {helperText ? (
        <div className="text-xs text-muted-foreground">{helperText}</div>
      ) : null}
    </div>
  );
}

type FlyerUploadProps = {
  value?: string | null;
  onChange?: (storageId: string | null) => void;
};

export function FlyerUpload({ value, onChange }: FlyerUploadProps) {
  return (
    <StorageImageUpload
      value={value}
      onChange={onChange}
      emptyStateTitle="Drag & drop flyer here"
      emptyStateDescription="or click to select an image"
      uploadedTitle="Flyer uploaded"
      previewAlt="Flyer preview"
    />
  );
}
