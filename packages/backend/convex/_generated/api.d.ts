/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apiClients from "../apiClients.js";
import type * as apiV1 from "../apiV1.js";
import type * as apiV1Data from "../apiV1Data.js";
import type * as approvals from "../approvals.js";
import type * as attentionFlags from "../attentionFlags.js";
import type * as audit from "../audit.js";
import type * as cascades from "../cascades.js";
import type * as credentials from "../credentials.js";
import type * as credentialsNode from "../credentialsNode.js";
import type * as dashboard from "../dashboard.js";
import type * as dashboardPreferences from "../dashboardPreferences.js";
import type * as devUtils from "../devUtils.js";
import type * as events from "../events.js";
import type * as eventsNode from "../eventsNode.js";
import type * as exports from "../exports.js";
import type * as exportsQueries from "../exportsQueries.js";
import type * as files from "../files.js";
import type * as functions from "../functions.js";
import type * as guestDirectory from "../guestDirectory.js";
import type * as http from "../http.js";
import type * as lib_apiKeys from "../lib/apiKeys.js";
import type * as lib_apiRequestAuth from "../lib/apiRequestAuth.js";
import type * as lib_autoApproval from "../lib/autoApproval.js";
import type * as lib_cascadeHelpers from "../lib/cascadeHelpers.js";
import type * as lib_clerkAuthConfig from "../lib/clerkAuthConfig.js";
import type * as lib_clerkTenantProvisioning from "../lib/clerkTenantProvisioning.js";
import type * as lib_clerkWebhookPayloads from "../lib/clerkWebhookPayloads.js";
import type * as lib_codeGenerators from "../lib/codeGenerators.js";
import type * as lib_credentialPasswords from "../lib/credentialPasswords.js";
import type * as lib_eventMetadata from "../lib/eventMetadata.js";
import type * as lib_eventPatch from "../lib/eventPatch.js";
import type * as lib_eventTiming from "../lib/eventTiming.js";
import type * as lib_guestIdentity from "../lib/guestIdentity.js";
import type * as lib_phoneHash from "../lib/phoneHash.js";
import type * as lib_phoneUtils from "../lib/phoneUtils.js";
import type * as lib_platformAuth from "../lib/platformAuth.js";
import type * as lib_primaryFields from "../lib/primaryFields.js";
import type * as lib_profileValueRecords from "../lib/profileValueRecords.js";
import type * as lib_publicBaseUrl from "../lib/publicBaseUrl.js";
import type * as lib_qrCodeGenerator from "../lib/qrCodeGenerator.js";
import type * as lib_recipientFiltering from "../lib/recipientFiltering.js";
import type * as lib_rsvpAggregate from "../lib/rsvpAggregate.js";
import type * as lib_rsvpApproval from "../lib/rsvpApproval.js";
import type * as lib_rsvpFilters from "../lib/rsvpFilters.js";
import type * as lib_rsvpStatus from "../lib/rsvpStatus.js";
import type * as lib_rsvpTicketSnapshot from "../lib/rsvpTicketSnapshot.js";
import type * as lib_rsvpUserName from "../lib/rsvpUserName.js";
import type * as lib_siteScope from "../lib/siteScope.js";
import type * as lib_smsConversationRecords from "../lib/smsConversationRecords.js";
import type * as lib_smsProgramCopy from "../lib/smsProgramCopy.js";
import type * as lib_socialProfileRecords from "../lib/socialProfileRecords.js";
import type * as lib_types from "../lib/types.js";
import type * as lib_webhookCrypto from "../lib/webhookCrypto.js";
import type * as lib_webhookEmission from "../lib/webhookEmission.js";
import type * as lib_workspaceAuth from "../lib/workspaceAuth.js";
import type * as lib_workspaceRecords from "../lib/workspaceRecords.js";
import type * as lib_workspaceScope from "../lib/workspaceScope.js";
import type * as migrations from "../migrations.js";
import type * as notifications from "../notifications.js";
import type * as orgMemberships from "../orgMemberships.js";
import type * as plaintextBackfill from "../plaintextBackfill.js";
import type * as plaintextBackfillNode from "../plaintextBackfillNode.js";
import type * as profileValues from "../profileValues.js";
import type * as profiles from "../profiles.js";
import type * as qrDelivery from "../qrDelivery.js";
import type * as redemptions from "../redemptions.js";
import type * as rsvps from "../rsvps.js";
import type * as seed from "../seed.js";
import type * as sms from "../sms.js";
import type * as smsActions from "../smsActions.js";
import type * as smsConversations from "../smsConversations.js";
import type * as smsMonitoring from "../smsMonitoring.js";
import type * as smsMonitoringActions from "../smsMonitoringActions.js";
import type * as smsSenders from "../smsSenders.js";
import type * as smsTemplates from "../smsTemplates.js";
import type * as socialProfiles from "../socialProfiles.js";
import type * as tenantApplications from "../tenantApplications.js";
import type * as testTwilio from "../testTwilio.js";
import type * as textBlasts from "../textBlasts.js";
import type * as users from "../users.js";
import type * as webhookDeliveries from "../webhookDeliveries.js";
import type * as webhookDispatch from "../webhookDispatch.js";
import type * as webhookEndpoints from "../webhookEndpoints.js";
import type * as webhooks from "../webhooks.js";
import type * as workspaceBootstrap from "../workspaceBootstrap.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apiClients: typeof apiClients;
  apiV1: typeof apiV1;
  apiV1Data: typeof apiV1Data;
  approvals: typeof approvals;
  attentionFlags: typeof attentionFlags;
  audit: typeof audit;
  cascades: typeof cascades;
  credentials: typeof credentials;
  credentialsNode: typeof credentialsNode;
  dashboard: typeof dashboard;
  dashboardPreferences: typeof dashboardPreferences;
  devUtils: typeof devUtils;
  events: typeof events;
  eventsNode: typeof eventsNode;
  exports: typeof exports;
  exportsQueries: typeof exportsQueries;
  files: typeof files;
  functions: typeof functions;
  guestDirectory: typeof guestDirectory;
  http: typeof http;
  "lib/apiKeys": typeof lib_apiKeys;
  "lib/apiRequestAuth": typeof lib_apiRequestAuth;
  "lib/autoApproval": typeof lib_autoApproval;
  "lib/cascadeHelpers": typeof lib_cascadeHelpers;
  "lib/clerkAuthConfig": typeof lib_clerkAuthConfig;
  "lib/clerkTenantProvisioning": typeof lib_clerkTenantProvisioning;
  "lib/clerkWebhookPayloads": typeof lib_clerkWebhookPayloads;
  "lib/codeGenerators": typeof lib_codeGenerators;
  "lib/credentialPasswords": typeof lib_credentialPasswords;
  "lib/eventMetadata": typeof lib_eventMetadata;
  "lib/eventPatch": typeof lib_eventPatch;
  "lib/eventTiming": typeof lib_eventTiming;
  "lib/guestIdentity": typeof lib_guestIdentity;
  "lib/phoneHash": typeof lib_phoneHash;
  "lib/phoneUtils": typeof lib_phoneUtils;
  "lib/platformAuth": typeof lib_platformAuth;
  "lib/primaryFields": typeof lib_primaryFields;
  "lib/profileValueRecords": typeof lib_profileValueRecords;
  "lib/publicBaseUrl": typeof lib_publicBaseUrl;
  "lib/qrCodeGenerator": typeof lib_qrCodeGenerator;
  "lib/recipientFiltering": typeof lib_recipientFiltering;
  "lib/rsvpAggregate": typeof lib_rsvpAggregate;
  "lib/rsvpApproval": typeof lib_rsvpApproval;
  "lib/rsvpFilters": typeof lib_rsvpFilters;
  "lib/rsvpStatus": typeof lib_rsvpStatus;
  "lib/rsvpTicketSnapshot": typeof lib_rsvpTicketSnapshot;
  "lib/rsvpUserName": typeof lib_rsvpUserName;
  "lib/siteScope": typeof lib_siteScope;
  "lib/smsConversationRecords": typeof lib_smsConversationRecords;
  "lib/smsProgramCopy": typeof lib_smsProgramCopy;
  "lib/socialProfileRecords": typeof lib_socialProfileRecords;
  "lib/types": typeof lib_types;
  "lib/webhookCrypto": typeof lib_webhookCrypto;
  "lib/webhookEmission": typeof lib_webhookEmission;
  "lib/workspaceAuth": typeof lib_workspaceAuth;
  "lib/workspaceRecords": typeof lib_workspaceRecords;
  "lib/workspaceScope": typeof lib_workspaceScope;
  migrations: typeof migrations;
  notifications: typeof notifications;
  orgMemberships: typeof orgMemberships;
  plaintextBackfill: typeof plaintextBackfill;
  plaintextBackfillNode: typeof plaintextBackfillNode;
  profileValues: typeof profileValues;
  profiles: typeof profiles;
  qrDelivery: typeof qrDelivery;
  redemptions: typeof redemptions;
  rsvps: typeof rsvps;
  seed: typeof seed;
  sms: typeof sms;
  smsActions: typeof smsActions;
  smsConversations: typeof smsConversations;
  smsMonitoring: typeof smsMonitoring;
  smsMonitoringActions: typeof smsMonitoringActions;
  smsSenders: typeof smsSenders;
  smsTemplates: typeof smsTemplates;
  socialProfiles: typeof socialProfiles;
  tenantApplications: typeof tenantApplications;
  testTwilio: typeof testTwilio;
  textBlasts: typeof textBlasts;
  users: typeof users;
  webhookDeliveries: typeof webhookDeliveries;
  webhookDispatch: typeof webhookDispatch;
  webhookEndpoints: typeof webhookEndpoints;
  webhooks: typeof webhooks;
  workspaceBootstrap: typeof workspaceBootstrap;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rsvpAggregate: {
    btree: {
      aggregateBetween: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any },
        { count: number; sum: number }
      >;
      aggregateBetweenBatch: FunctionReference<
        "query",
        "internal",
        { queries: Array<{ k1?: any; k2?: any; namespace?: any }> },
        Array<{ count: number; sum: number }>
      >;
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetBatch: FunctionReference<
        "query",
        "internal",
        {
          queries: Array<{
            k1?: any;
            k2?: any;
            namespace?: any;
            offset: number;
          }>;
        },
        Array<{ k: any; s: number; v: any }>
      >;
      get: FunctionReference<
        "query",
        "internal",
        { key: any; namespace?: any },
        null | { k: any; s: number; v: any }
      >;
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any; namespace?: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any; namespace?: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
        {
          cursor?: string;
          k1?: any;
          k2?: any;
          limit: number;
          namespace?: any;
          order: "asc" | "desc";
        },
        {
          cursor: string;
          isDone: boolean;
          page: Array<{ k: any; s: number; v: any }>;
        }
      >;
      paginateNamespaces: FunctionReference<
        "query",
        "internal",
        { cursor?: string; limit: number },
        { cursor: string; isDone: boolean; page: Array<any> }
      >;
      validate: FunctionReference<
        "query",
        "internal",
        { namespace?: any },
        any
      >;
    };
    inspect: {
      display: FunctionReference<"query", "internal", { namespace?: any }, any>;
      dump: FunctionReference<"query", "internal", { namespace?: any }, string>;
      inspectNode: FunctionReference<
        "query",
        "internal",
        { namespace?: any; node?: string },
        null
      >;
      listTreeNodes: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          aggregate?: { count: number; sum: number };
          items: Array<{ k: any; s: number; v: any }>;
          subtrees: Array<string>;
        }>
      >;
      listTrees: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          maxNodeSize: number;
          namespace?: any;
          root: string;
        }>
      >;
    };
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      delete_: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        any
      >;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<
        "mutation",
        "internal",
        { namespace?: any },
        null
      >;
      replace: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        any
      >;
    };
  };
  migrations: {
    lib: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        { name: string },
        {
          batchSize?: number;
          cursor?: string | null;
          error?: string;
          isDone: boolean;
          latestEnd?: number;
          latestStart: number;
          name: string;
          next?: Array<string>;
          processed: number;
          state: "inProgress" | "success" | "failed" | "canceled" | "unknown";
        }
      >;
      cancelAll: FunctionReference<
        "mutation",
        "internal",
        { sinceTs?: number },
        Array<{
          batchSize?: number;
          cursor?: string | null;
          error?: string;
          isDone: boolean;
          latestEnd?: number;
          latestStart: number;
          name: string;
          next?: Array<string>;
          processed: number;
          state: "inProgress" | "success" | "failed" | "canceled" | "unknown";
        }>
      >;
      clearAll: FunctionReference<
        "mutation",
        "internal",
        { before?: number },
        null
      >;
      getStatus: FunctionReference<
        "query",
        "internal",
        { limit?: number; names?: Array<string> },
        Array<{
          batchSize?: number;
          cursor?: string | null;
          error?: string;
          isDone: boolean;
          latestEnd?: number;
          latestStart: number;
          name: string;
          next?: Array<string>;
          processed: number;
          state: "inProgress" | "success" | "failed" | "canceled" | "unknown";
        }>
      >;
      migrate: FunctionReference<
        "mutation",
        "internal",
        {
          batchSize?: number;
          cursor?: string | null;
          dryRun: boolean;
          fnHandle: string;
          name: string;
          next?: Array<{ fnHandle: string; name: string }>;
        },
        {
          batchSize?: number;
          cursor?: string | null;
          error?: string;
          isDone: boolean;
          latestEnd?: number;
          latestStart: number;
          name: string;
          next?: Array<string>;
          processed: number;
          state: "inProgress" | "success" | "failed" | "canceled" | "unknown";
        }
      >;
    };
  };
};
