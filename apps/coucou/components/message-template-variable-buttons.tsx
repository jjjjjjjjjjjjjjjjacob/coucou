import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MESSAGE_TEMPLATE_VARIABLES } from "@/lib/text-blast-message";

type MessageTemplateVariableName = (typeof MESSAGE_TEMPLATE_VARIABLES)[number];

interface MessageTemplateVariableButtonsProps {
  message: string;
  onMessageChange: (message: string) => void;
  variableNames?: readonly MessageTemplateVariableName[];
  disabledVariableNames?: readonly MessageTemplateVariableName[];
  disabledVariableReason?: string;
}

function appendTemplateVariable(
  message: string,
  variableName: MessageTemplateVariableName,
): string {
  const token = `{{${variableName}}}`;
  if (!message.trim()) return token;
  const separator = message.endsWith(" ") || message.endsWith("\n") ? "" : " ";
  return `${message}${separator}${token}`;
}

export function MessageTemplateVariableButtons({
  message,
  onMessageChange,
  variableNames = MESSAGE_TEMPLATE_VARIABLES,
  disabledVariableNames = [],
  disabledVariableReason = "This variable is not available for the current message.",
}: MessageTemplateVariableButtonsProps) {
  const disabledVariables = new Set(disabledVariableNames);

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-[var(--text-tertiary)]">Variables</div>
      <div className="flex flex-wrap gap-1.5">
        {variableNames.map((variableName) => {
          const isDisabled = disabledVariables.has(variableName);
          const button = (
            <button
              type="button"
              aria-disabled={isDisabled}
              title={isDisabled ? disabledVariableReason : undefined}
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-3)]/60 px-2 py-1 font-mono text-[11px] text-[var(--text-secondary)] transition-[color,border-color,scale,opacity] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] active:scale-[0.96] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:border-[var(--border-subtle)] aria-disabled:hover:text-[var(--text-secondary)] aria-disabled:active:scale-100"
              onClick={() => {
                if (isDisabled) {
                  toast.info(disabledVariableReason);
                  return;
                }
                onMessageChange(appendTemplateVariable(message, variableName));
              }}
            >
              {`{{${variableName}}}`}
            </button>
          );

          return isDisabled ? (
            <Tooltip key={variableName}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent side="top" sideOffset={6}>
                {disabledVariableReason}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span key={variableName}>{button}</span>
          );
        })}
      </div>
    </div>
  );
}
