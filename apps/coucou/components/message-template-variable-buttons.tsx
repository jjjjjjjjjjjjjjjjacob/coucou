import { MESSAGE_TEMPLATE_VARIABLES } from "@/lib/text-blast-message";

type MessageTemplateVariableName = (typeof MESSAGE_TEMPLATE_VARIABLES)[number];

interface MessageTemplateVariableButtonsProps {
  message: string;
  onMessageChange: (message: string) => void;
  variableNames?: readonly MessageTemplateVariableName[];
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
}: MessageTemplateVariableButtonsProps) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-[var(--text-tertiary)]">Variables</div>
      <div className="flex flex-wrap gap-1.5">
        {variableNames.map((variableName) => (
          <button
            key={variableName}
            type="button"
            className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-3)]/60 px-2 py-1 font-mono text-[11px] text-[var(--text-secondary)] transition-[color,border-color,scale] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] active:scale-[0.96]"
            onClick={() => onMessageChange(appendTemplateVariable(message, variableName))}
          >
            {`{{${variableName}}}`}
          </button>
        ))}
      </div>
    </div>
  );
}
