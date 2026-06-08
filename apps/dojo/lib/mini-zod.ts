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
    if (r.required && !(custom?.[r.key] || "").trim()) {
      errors.push(`${r.label} is required`);
    }
  }
  return errors;
}

export function validateRequiredWithFirstName(
  firstName: string,
  lastName: string,
  custom: Record<string, string>,
  rules: FieldRule[] = [],
) {
  const errors: string[] = [];
  if (!firstName?.trim()) errors.push("First name is required");
  if (!lastName?.trim()) errors.push("Last name is required");
  for (const r of rules) {
    if (r.required && !(custom?.[r.key] || "").trim()) {
      errors.push(`${r.label} is required`);
    }
  }
  return errors;
}

export function validateRequiredFieldValues(
  values: Record<string, string>,
  rules: FieldRule[] = [],
) {
  const errors: string[] = [];
  for (const rule of rules) {
    if (rule.required && !(values?.[rule.key] || "").trim()) {
      errors.push(`${rule.label} is required`);
    }
  }
  return errors;
}

export function validateRequiredPrimaryFields(
  socialProfiles: Record<string, string>,
  socialRules: FieldRule[] = [],
  invitedByName?: string,
  invitedByRule?: FieldRule,
) {
  const errors = validateRequiredFieldValues(socialProfiles, socialRules);
  if (invitedByRule?.required && !(invitedByName || "").trim()) {
    errors.push(`${invitedByRule.label} is required`);
  }
  return errors;
}
