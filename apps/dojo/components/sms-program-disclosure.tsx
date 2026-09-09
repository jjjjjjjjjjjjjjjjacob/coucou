import { dojoSmsProgram } from "@/lib/sms-program";

interface SmsProgramDisclosureProps {
  className?: string;
}

export function SmsProgramDisclosure({ className }: SmsProgramDisclosureProps) {
  return (
    <span className={className}>
      {dojoSmsProgram.disclosure}{" "}
      <a href="/terms" className="underline">
        Terms
      </a>{" "}
      and{" "}
      <a href="/privacy" className="underline">
        Privacy Policy
      </a>
      .
    </span>
  );
}
