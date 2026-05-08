"use client";
import { api } from "@convex/_generated/api";
import { useAction } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { siteConfiguration } from "@/lib/site";

export default function Home() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const resolve = useAction(api.credentialsNode.resolveEventByPassword);

  const onSubmit = useCallback(async () => {
    const normalizedPassword = password.trim();
    console.log("[DEBUG] Home page password entry:", {
      original: password,
      normalized: normalizedPassword,
      length: normalizedPassword.length,
    });
    if (!normalizedPassword) {
      setMessage("Enter your list code.");
      return;
    }
    try {
      setLoading(true);
      setMessage("");
      console.log("[DEBUG] Sending password to backend:", normalizedPassword);
      const res = await resolve({
        password: normalizedPassword,
        siteKey: siteConfiguration.siteKey,
      });
      if (res?.ok && res.eventRouteId) {
        // Pass the code along in search params to the event page
        const searchParams = new URLSearchParams({
          password: normalizedPassword,
        }).toString();
        router.push(`/events/${res.eventRouteId}?${searchParams}`);
      } else {
        setMessage("No active event matches that password.");
      }
    } catch (error: unknown) {
      const errorDetails = error as Error;
      setMessage(errorDetails?.message || "Error resolving event");
    } finally {
      setLoading(false);
    }
  }, [password, resolve, router]);

  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-semibold text-primary">{siteConfiguration.homeTitle}</h1>
        <p className="text-sm text-foreground/70 text-primary">
          {siteConfiguration.homeDescription}
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value.trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
            className="border border-primary/20 placeholder:text-primary/30"
          />
          <Button onClick={onSubmit} disabled={loading}>
            {loading ? "Checking..." : "Continue"}
          </Button>
        </div>
        {message && <div className="text-sm text-red-500">{message}</div>}
      </div>
    </main>
  );
}
