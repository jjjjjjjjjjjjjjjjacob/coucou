"use client";

import { api } from "@convex/_generated/api";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Html5Qrcode } from "html5-qrcode";
import { Camera } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";

export default function ScanPage() {
  const searchParams = useSearchParams();
  const workspaceScope = useWorkspaceScope();
  const codeFromUrl = searchParams.get("code");
  const [code, setCode] = useState("");
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [autoRedeemed, setAutoRedeemed] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerElementId = "qr-reader";

  useEffect(() => {
    if (codeFromUrl) {
      setCode(codeFromUrl.toUpperCase());
      setLastAction("checked");
    }
  }, [codeFromUrl]);

  const statusQuery = useQuery(
    convexQuery(
      api.redemptions.validate,
      code && workspaceScope ? { code, ...workspaceScope.queryArgs } : "skip",
    ),
  );
  const status = statusQuery.data;
  const isLoading = statusQuery.isLoading;

  const redeem = useMutation({
    mutationFn: useConvexMutation(api.redemptions.redeem),
  });

  const unredeem = useMutation({
    mutationFn: useConvexMutation(api.redemptions.unredeem),
  });

  useEffect(() => {
    const autoRedeem = async () => {
      if (
        !isLoading &&
        status?.status === "valid" &&
        code &&
        !autoRedeemed &&
        lastAction === "checked"
      ) {
        try {
          if (!workspaceScope) {
            return;
          }
          await redeem.mutateAsync({ code, ...workspaceScope.queryArgs });
          setLastAction("redeemed");
          setAutoRedeemed(true);
          await statusQuery.refetch();
          toast.success("Redeemed");
        } catch (_error) {
          toast.error("Failed to redeem");
        }
      }
    };
    autoRedeem();
  }, [status, code, autoRedeemed, lastAction, redeem, isLoading, statusQuery, workspaceScope]);

  const startScanner = async () => {
    setIsScannerOpen(true);

    await new Promise((resolve) => setTimeout(resolve, 300));

    try {
      const html5QrCode = new Html5Qrcode(scannerElementId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          let extractedCode = decodedText;

          try {
            const url = new URL(decodedText);
            const pathParts = url.pathname.split("/");
            const lastPart = pathParts[pathParts.length - 1];
            if (lastPart) {
              extractedCode = lastPart;
            }
          } catch {
            extractedCode = decodedText;
          }

          const detectedCode = extractedCode.toUpperCase();
          setCode(detectedCode);
          setLastAction("checked");
          setAutoRedeemed(false);
          toast.success("QR Code detected");
          stopScanner();
        },
        undefined,
      );
    } catch (error) {
      toast.error("Failed to start camera");
      console.error(error);
      setIsScannerOpen(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
      } catch (error) {
        console.error("Error stopping scanner:", error);
      }
    }
    setIsScannerOpen(false);
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, []);

  const handleCameraClick = () => {
    if (!isScannerOpen) {
      startScanner();
    }
  };

  const handleDialogClose = (open: boolean) => {
    if (!open && isScannerOpen) {
      stopScanner();
    }
  };

  return (
    <section className="space-y-3">
      <p className="text-sm">
        Scan a QR code or enter the redemption code manually. Valid tickets will be automatically
        redeemed.
      </p>

      <div className="flex gap-2">
        <Button variant="outline" onClick={handleCameraClick} className="flex items-center gap-2">
          <Camera className="h-4 w-4" />
          Open Camera
        </Button>
      </div>

      <Dialog open={isScannerOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Scan QR Code</DialogTitle>
            <DialogDescription>Point your camera at a QR code to scan it</DialogDescription>
          </DialogHeader>
          <div className="rounded border border-foreground/10 overflow-hidden">
            <div id={scannerElementId} />
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex gap-2">
        <Input
          className="flex-1"
          placeholder="Enter redemption code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.trim());
            setAutoRedeemed(false);
          }}
        />
        <Button
          onClick={() => {
            setLastAction("checked");
            setAutoRedeemed(false);
          }}
        >
          Check
        </Button>
      </div>

      <div className="rounded border border-foreground/10 p-4 text-sm space-y-2">
        <div className="font-medium">
          Status:{" "}
          {isLoading && code ? (
            <span className="text-foreground/50">Loading...</span>
          ) : status?.status === "valid" ? (
            <span className="text-green-600">Valid</span>
          ) : status?.status === "redeemed" ? (
            <span className="text-blue-600">Redeemed ✓</span>
          ) : status?.status === "invalid" ? (
            <span className="text-red-600">Invalid</span>
          ) : (
            "—"
          )}
        </div>
        {status && (status.status === "valid" || status.status === "redeemed") && (
          <div>
            <div>Name: {status.name ?? "(unknown)"}</div>
            <div>List: {status.listKey}</div>
          </div>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!code || !status || status.status !== "redeemed"}
            onClick={async () => {
              if (!workspaceScope) {
                return;
              }
              await unredeem.mutateAsync({ code, ...workspaceScope.queryArgs });
              setLastAction("unredeemed");
              setAutoRedeemed(false);
              await statusQuery.refetch();
              toast("Un-redeemed");
            }}
          >
            Un-redeem
          </Button>
        </div>
        {lastAction && <div className="text-foreground/70">Last action: {lastAction}</div>}
      </div>
    </section>
  );
}
