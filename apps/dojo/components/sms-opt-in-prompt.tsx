import { CircleDashed } from "lucide-react";
import { SmsProgramDisclosure } from "@/components/sms-program-disclosure";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface SmsOptInPromptProps {
  isSmsConsentEnabled: boolean;
  isUpdatingSmsPreference: boolean;
  isUpdateDisabled: boolean;
  onEnableSms: () => void;
  smsSenderDisplayName: string;
  textColor: string;
}

export function SmsOptInPrompt({
  isSmsConsentEnabled,
  isUpdatingSmsPreference,
  isUpdateDisabled,
  onEnableSms,
  smsSenderDisplayName,
  textColor,
}: SmsOptInPromptProps) {
  if (isSmsConsentEnabled) {
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-3 text-sm text-primary">
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-medium" style={{ color: textColor }}>
          <CircleDashed className="h-4 w-4" />
          <span>SMS from {smsSenderDisplayName} disabled</span>
        </div>
        <Button size="sm" variant="outline" onClick={onEnableSms} disabled={isUpdateDisabled}>
          {isUpdatingSmsPreference && <Spinner className="h-3.5 w-3.5" />}
          Enable SMS Updates
        </Button>
      </div>
      <SmsProgramDisclosure className="max-w-sm text-center text-[10px] leading-tight text-muted-foreground" />
    </div>
  );
}
