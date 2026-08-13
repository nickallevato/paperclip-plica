import { vi } from "vitest";
import * as React from "react";

/**
 * Test double for the host's plugin bridge.
 *
 * The SDK's UI hooks resolve their implementations at call time from
 * `globalThis.__paperclipPluginBridge__.sdkUi` (see sdk/src/ui/runtime.ts).
 * Installing a real bridge here means tests exercise the SDK's actual code
 * path rather than mocking `@paperclipai/plugin-sdk/ui` away — so a change in
 * how the SDK resolves runtime values shows up as a test failure instead of
 * passing against a fake.
 */
export type TestBridgeOverrides = {
  companyId?: string | null;
  companyPrefix?: string | null;
  navigate?: (to: string, options?: unknown) => void;
  toast?: (input: unknown) => string | null;
};

export type TestBridgeHandles = {
  navigate: ReturnType<typeof vi.fn>;
  toast: ReturnType<typeof vi.fn>;
};

export const TEST_COMPANY_ID = "company-1";
export const TEST_COMPANY_PREFIX = "ACME";

export function installTestBridge(overrides: TestBridgeOverrides = {}): TestBridgeHandles {
  const navigate = vi.fn(overrides.navigate);
  const toast = vi.fn(overrides.toast ?? (() => null));

  const hostContext = {
    companyId: overrides.companyId === undefined ? TEST_COMPANY_ID : overrides.companyId,
    companyPrefix:
      overrides.companyPrefix === undefined ? TEST_COMPANY_PREFIX : overrides.companyPrefix,
    projectId: null,
    entityId: null,
    entityType: null,
    parentEntityId: null,
    userId: "user-1",
    renderEnvironment: null,
  };

  const navigation = {
    resolveHref: (to: string) => to,
    navigate,
    linkProps: (to: string) => ({ href: to }),
  };

  (globalThis as Record<string, unknown>).__paperclipPluginBridge__ = {
    react: React,
    sdkUi: {
      useHostContext: () => hostContext,
      useHostNavigation: () => navigation,
      useHostLocation: () => ({ pathname: `/${hostContext.companyPrefix}/plica`, search: "", hash: "" }),
      usePluginToast: () => toast,
      usePluginData: () => ({ data: null, isLoading: false, error: null }),
      usePluginAction: () => vi.fn(),
      usePluginStream: () => ({ messages: [], status: "idle" }),
      copyTextToClipboard: vi.fn(),
    },
  };

  return { navigate, toast };
}

export function clearTestBridge(): void {
  delete (globalThis as Record<string, unknown>).__paperclipPluginBridge__;
}
