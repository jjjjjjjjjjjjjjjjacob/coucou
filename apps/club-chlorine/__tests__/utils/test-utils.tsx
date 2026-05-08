import { type RenderOptions, render as rtlRender } from "@testing-library/react";
import type React from "react";

// Create a custom render function
function render(ui: React.ReactElement, options?: RenderOptions) {
  return rtlRender(ui, options);
}

// Re-export everything
export * from "@testing-library/react";
export { render };
