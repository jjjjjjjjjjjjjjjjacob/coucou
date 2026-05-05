import React from "react";

type SpinnerProps = {
  size?: number;
  className?: string;
  title?: string;
};

export function Spinner({
  size = 24,
  className = "",
  title = "Loading",
}: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={title}
      role="img"
      className={className}
      fill="currentColor"
    >
      <style>{`.spinner_qM83{animation:spinner_8HQG 1.05s infinite}.spinner_oXPr{animation-delay:.1s}.spinner_ZTLf{animation-delay:.2s}@keyframes spinner_8HQG{0%,57.14%{animation-timing-function:cubic-bezier(0.33,.66,.66,1);transform:translate(0)}28.57%{animation-timing-function:cubic-bezier(0.33,0,.66,.33);transform:translateY(-6px)}100%{transform:translate(0)}}`}</style>
      <circle className="spinner_qM83" cx="4" cy="12" r="3" />
      <circle className="spinner_qM83 spinner_oXPr" cx="12" cy="12" r="3" />
      <circle className="spinner_qM83 spinner_ZTLf" cx="20" cy="12" r="3" />
    </svg>
  );
}
