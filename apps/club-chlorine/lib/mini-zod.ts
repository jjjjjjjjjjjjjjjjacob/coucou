export type FieldRule = {
  key: string;
  label: string;
  required?: boolean;
};

export function validateRequired(
  name: string,
  custom: Record<string, string>,
  rules: FieldRule[] = [],
) {
  const errors: string[] = [];
  if (!name?.trim()) errors.push("Name is required");
  for (const r of rules) {
    if (r.required && !((custom?.[r.key] || "").trim())) {
      errors.push(`${r.label} is required`);
    }
  }
  return errors;
}

export function validateRequiredWithFirstName(
  firstName: string,
  custom: Record<string, string>,
  rules: FieldRule[] = [],
) {
  const errors: string[] = [];
  if (!firstName?.trim()) errors.push("First name is required");
  for (const r of rules) {
    if (r.required && !((custom?.[r.key] || "").trim())) {
      errors.push(`${r.label} is required`);
    }
  }
  return errors;
}

