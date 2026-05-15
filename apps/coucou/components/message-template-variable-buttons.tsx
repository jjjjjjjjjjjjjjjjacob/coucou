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
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Variables</div>
      <div className="flex flex-wrap gap-2">
        {variableNames.map((variableName) => (
          <button
            key={variableName}
            type="button"
            className="rounded border border-border/70 px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-foreground/60 hover:text-foreground"
            onClick={() => onMessageChange(appendTemplateVariable(message, variableName))}
          >
            {`{{${variableName}}}`}
          </button>
        ))}
      </div>
    </div>
  );
}
