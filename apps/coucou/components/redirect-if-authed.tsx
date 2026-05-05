"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

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
