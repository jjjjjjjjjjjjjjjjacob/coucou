# Same-phone identity consolidation runbook

The workflow is intentionally two-phase. Alias-aware schema and application code must be live before any duplicate user or RSVP row is deleted.

## 1. Deploy compatibility code

Deploy this backend and web release normally. Do not execute consolidation in the same deployment step.

## 2. Backfill normalized phones

Run `identityConsolidation:backfillUserPhoneHashes` against production with a Coucou platform identity. Start in dry-run mode and continue with the returned cursor until `isDone` is true.

```bash
bunx convex run --prod --identity "$COUCOU_PLATFORM_IDENTITY_JSON" \
  identityConsolidation:backfillUserPhoneHashes \
  '{"dryRun":true,"batchSize":200}'
```

Review every `invalidPhones` entry. Invalid rows are reported and never merged. Repeat with `"dryRun":false`, carrying `nextCursor` into the next call.

## 3. Dry-run duplicate groups

```bash
bunx convex run --prod --identity "$COUCOU_PLATFORM_IDENTITY_JSON" \
  identityConsolidation:processDuplicatePhoneGroups \
  '{"dryRun":true,"batchSize":5}'
```

Continue with the returned cursor. Review canonical selection, RSVP moves/collisions, profile duplicates, immutable snapshot references, and unresolved groups before execution.

## 4. Export a recoverable snapshot

```bash
bunx convex export --prod --include-file-storage \
  --path /secure/backup/location/coucou-before-phone-consolidation.zip
```

Record the immutable backup location or artifact identifier. Execution rejects requests without this reference.

## 5. Execute bounded batches

```bash
bunx convex run --prod --identity "$COUCOU_PLATFORM_IDENTITY_JSON" \
  identityConsolidation:processDuplicatePhoneGroups \
  '{"dryRun":false,"batchSize":1,"confirmation":"CONSOLIDATE_SAME_PHONE_USERS","snapshotReference":"REPLACE_WITH_BACKUP_REFERENCE"}'
```

Carry `nextCursor` forward until `isDone` is true. Each group is idempotent, writes aliases before deletion, updates the RSVP aggregate, and records an `identity.samePhoneConsolidated` audit entry.

## 6. Backfill inviter history

Run `identityConsolidation:backfillInviterHistory` in dry-run mode and then execution mode, continuing with its cursor until complete.

## 7. Verify health

```bash
bunx convex run --prod --identity "$COUCOU_PLATFORM_IDENTITY_JSON" \
  identityConsolidation:getPostMigrationHealth '{}'
```

The result is healthy only when there is at most one active user per phone hash, every alias resolves, no checked live reference retains a retired identity, and the RSVP aggregate count matches storage. Pass `phoneHash` to inspect the affected contact's active-user, RSVP, and normalized social-profile counts.
