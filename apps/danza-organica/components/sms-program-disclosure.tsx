import { danzaOrganicaSmsProgram } from "@/lib/sms-program";

interface SmsProgramDisclosureProps {
  className?: string;
}

export function SmsProgramDisclosure({ className }: SmsProgramDisclosureProps) {
  return (
    <span className={className}>
      {danzaOrganicaSmsProgram.disclosure}{" "}
      <a href={danzaOrganicaSmsProgram.termsUrl} className="underline">
        Terms
      </a>{" "}
      and{" "}
      <a href={danzaOrganicaSmsProgram.privacyUrl} className="underline">
        Privacy Policy
      </a>
      .
    </span>
  );
}
