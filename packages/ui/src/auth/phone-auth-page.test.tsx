import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { PhoneAuthPage } from "./phone-auth-page";
import { siteAuthConfigurations } from "@coucou/sdk/site-config";

GlobalRegistrator.register({ url: "http://localhost:3000/admin/login" });

const routerReplaceCalls: string[] = [];
const documentReplaceCalls: string[] = [];
let isSignedIn = true;
let LoadedPhoneAuthPage: typeof PhoneAuthPage;

mock.module("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn,
  }),
  useUser: () => ({
    isSignedIn,
  }),
  useSignIn: () => ({
    isLoaded: true,
    signIn: {},
    setActive: async () => {},
  }),
  useSignUp: () => ({
    isLoaded: true,
    signUp: {},
    setActive: async () => {},
  }),
}));

mock.module("next/navigation", () => ({
  useRouter: () => ({
    replace: (href: string) => {
      routerReplaceCalls.push(href);
    },
  }),
}));

describe("PhoneAuthPage", () => {
  beforeAll(async () => {
    const module = await import("./phone-auth-page");
    LoadedPhoneAuthPage = module.PhoneAuthPage;
  });

  beforeEach(() => {
    isSignedIn = true;
    routerReplaceCalls.length = 0;
    documentReplaceCalls.length = 0;
    Object.defineProperty(window.location, "replace", {
      configurable: true,
      value: (href: string) => {
        documentReplaceCalls.push(href);
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  afterAll(() => {
    GlobalRegistrator.unregister();
  });

  it("uses a document replace for admin post-auth navigation", async () => {
    render(
      <LoadedPhoneAuthPage
        preset="coucou"
        siteAuthConfiguration={siteAuthConfigurations.coucou}
        redirectUrl="/admin"
        postAuthNavigation="document-replace"
      />,
    );

    await waitFor(() => {
      expect(documentReplaceCalls).toEqual(["/admin"]);
    });
    expect(routerReplaceCalls).toEqual([]);
  });

  it("uses the app router by default", async () => {
    render(
      <LoadedPhoneAuthPage
        preset="coucou"
        siteAuthConfiguration={siteAuthConfigurations.coucou}
        redirectUrl="/dashboard"
      />,
    );

    await waitFor(() => {
      expect(routerReplaceCalls).toEqual(["/dashboard"]);
    });
    expect(documentReplaceCalls).toEqual([]);
  });

  it("renders a custom brand mark slot when provided", async () => {
    const { getByTestId } = render(
      <LoadedPhoneAuthPage
        preset="coucou"
        siteAuthConfiguration={siteAuthConfigurations.coucou}
        redirectUrl="/dashboard"
        brandMarkSlot={<div data-testid="custom-brand-mark" />}
      />,
    );

    expect(getByTestId("custom-brand-mark")).toBeTruthy();
    await waitFor(() => {
      expect(routerReplaceCalls).toEqual(["/dashboard"]);
    });
  });
});
