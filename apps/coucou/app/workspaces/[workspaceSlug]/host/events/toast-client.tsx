"use client";
import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";

export default function CreatedToastOnce() {
  const sp = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    if (sp?.get("created") === "1") {
      toast.success("Event created");
      const url = new URL(window.location.href);
      url.searchParams.delete("created");
      router.replace(url.pathname + url.search);
    }
  }, [sp, router]);
  return null;
}

