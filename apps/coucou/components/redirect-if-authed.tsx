"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface RedirectIfAuthedProps {
  to: string;
}

export function RedirectIfAuthed({ to }: RedirectIfAuthedProps) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace(to);
    }
  }, [isLoaded, isSignedIn, router, to]);

  return null;
}
