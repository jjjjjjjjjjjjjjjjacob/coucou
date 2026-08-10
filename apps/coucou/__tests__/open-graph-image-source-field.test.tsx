import { describe, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { OpenGraphImageSourceField } from "@/components/event-form-sections/open-graph-image-source-field";
import { Form } from "@/components/ui/form";
import type { EventFormData } from "@/lib/types";

function TestForm({ initialSource }: { initialSource?: EventFormData["openGraphImageSource"] }) {
  const form = useForm<EventFormData>({
    defaultValues: {
      name: "Danza Night",
      hosts: "Danza Organica",
      location: "New York",
      eventDate: "2030-08-10",
      eventTime: "22:00",
      eventTimezone: "America/New_York",
      openGraphImageSource: initialSource,
    },
  });

  return (
    <Form {...form}>
      <OpenGraphImageSourceField form={form} />
    </Form>
  );
}

describe("Open Graph image source field", () => {
  it("defaults legacy events to the event thumbnail", () => {
    render(<TestForm />);

    expect(screen.getByRole("radio", { name: /event thumbnail/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /danza globe/i })).not.toBeChecked();
  });

  it("allows the Danza globe to be selected", () => {
    render(<TestForm initialSource="thumbnail" />);

    fireEvent.click(screen.getByRole("radio", { name: /danza globe/i }));

    expect(screen.getByRole("radio", { name: /danza globe/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /event thumbnail/i })).not.toBeChecked();
  });
});
