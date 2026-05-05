interface RecordValue {
  [key: string]: unknown;
}

export interface ClerkWebhookEvent {
  type: string;
  data: unknown;
}

export interface ClerkUserWebhookProfile {
  clerkUserId: string;
  email?: string;
  phone?: string;
  imageUrl?: string;
}

export interface ClerkOrganizationWorkspacePayload {
  clerkOrganizationId: string;
  name: string;
  clerkOrganizationSlug?: string;
  workspaceSlug?: string;
  primaryDomain?: string;
}

export interface ClerkOrganizationMembershipPayload {
  clerkUserId?: string;
  organizationId?: string;
  role: string;
  organization?: ClerkOrganizationWorkspacePayload;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(record: RecordValue, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getRecord(record: RecordValue, key: string): RecordValue | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function getRecordArray(record: RecordValue, key: string): RecordValue[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function getMetadataValue(
  metadata: RecordValue | undefined,
  keys: string[],
): string | undefined {
  if (!metadata) return undefined;
  for (const key of keys) {
    const value = getString(metadata, key);
    if (value) return value;
  }
  return undefined;
}

function getPublicMetadata(record: RecordValue): RecordValue | undefined {
  return (
    getRecord(record, "public_metadata") ??
    getRecord(record, "publicMetadata")
  );
}

export function parseClerkWebhookEvent(
  value: unknown,
): ClerkWebhookEvent | null {
  if (!isRecord(value)) return null;
  const type = getString(value, "type");
  if (!type) return null;
  return {
    type,
    data: value.data,
  };
}

export function extractClerkUserWebhookProfile(
  value: unknown,
): ClerkUserWebhookProfile | null {
  if (!isRecord(value)) return null;

  const clerkUserId = getString(value, "id");
  if (!clerkUserId) return null;

  const primaryEmailAddressId = getString(value, "primary_email_address_id");
  const emailAddresses = getRecordArray(value, "email_addresses");
  const primaryEmailAddress = emailAddresses.find(
    (emailAddress) => getString(emailAddress, "id") === primaryEmailAddressId,
  );
  const fallbackEmailAddress = emailAddresses[0];
  const email =
    (primaryEmailAddress
      ? getString(primaryEmailAddress, "email_address")
      : undefined) ??
    (fallbackEmailAddress
      ? getString(fallbackEmailAddress, "email_address")
      : undefined);

  const primaryPhoneNumberId = getString(value, "primary_phone_number_id");
  const phoneNumbers = getRecordArray(value, "phone_numbers");
  const primaryPhoneNumber = phoneNumbers.find(
    (phoneNumber) => getString(phoneNumber, "id") === primaryPhoneNumberId,
  );
  const fallbackPhoneNumber = phoneNumbers[0];
  const phone =
    (primaryPhoneNumber
      ? getString(primaryPhoneNumber, "phone_number")
      : undefined) ??
    (fallbackPhoneNumber
      ? getString(fallbackPhoneNumber, "phone_number")
      : undefined);

  return {
    clerkUserId,
    email,
    phone,
    imageUrl: getString(value, "image_url"),
  };
}

export function extractClerkOrganizationWorkspacePayload(
  value: unknown,
): ClerkOrganizationWorkspacePayload | null {
  if (!isRecord(value)) return null;

  const clerkOrganizationId = getString(value, "id");
  if (!clerkOrganizationId) return null;

  const metadata = getPublicMetadata(value);
  const clerkOrganizationSlug = getString(value, "slug");
  const workspaceSlug =
    getMetadataValue(metadata, ["workspaceSlug", "workspace_slug"]) ??
    clerkOrganizationSlug;
  const name =
    getString(value, "name") ??
    workspaceSlug ??
    clerkOrganizationSlug ??
    clerkOrganizationId;

  return {
    clerkOrganizationId,
    name,
    clerkOrganizationSlug,
    workspaceSlug,
    primaryDomain: getMetadataValue(metadata, [
      "primaryDomain",
      "primary_domain",
    ]),
  };
}

export function extractClerkOrganizationMembershipPayload(
  value: unknown,
): ClerkOrganizationMembershipPayload | null {
  if (!isRecord(value)) return null;

  const publicUserData = getRecord(value, "public_user_data");
  const organizationRecord = getRecord(value, "organization");
  const organization = extractClerkOrganizationWorkspacePayload(
    organizationRecord,
  );

  const clerkUserId =
    (publicUserData ? getString(publicUserData, "user_id") : undefined) ??
    getString(value, "user_id") ??
    getString(value, "id");
  const organizationId =
    organization?.clerkOrganizationId ?? getString(value, "organization_id");

  return {
    clerkUserId,
    organizationId,
    role:
      getString(value, "role") ??
      (publicUserData ? getString(publicUserData, "role") : undefined) ??
      "member",
    organization: organization ?? undefined,
  };
}
