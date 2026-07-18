"use client";

import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import {
  bindThemeParamsCssVars,
  bindViewportCssVars,
  hideBackButton,
  init,
  miniAppReady,
  mountBackButton,
  mountMiniAppSync,
  mountThemeParamsSync,
  mountViewport,
  offBackButtonClick,
  onBackButtonClick,
  retrieveRawInitData,
  showBackButton,
  unmountMiniApp,
  unmountThemeParams,
  unmountViewport,
} from "@telegram-apps/sdk-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import { HttpApiTransport, type ApiTransport } from "../lib/api";
import { TestBridgeTransport } from "../lib/test-bridge";

export type ThemeChoice = "dark" | "light" | "system" | "telegram";

interface TelegramWebApp {
  readonly colorScheme?: "dark" | "light";
  readonly initData?: string;
  readonly initDataUnsafe?: { readonly start_param?: string };
  ready?(): void;
  requestFullscreen?(): void;
  close?(): void;
}

interface TelegramWindow extends Window {
  readonly Telegram?: { readonly WebApp?: TelegramWebApp };
}

interface TelegramContextValue {
  readonly booted: boolean;
  readonly initData: string;
  readonly launchToken?: string | undefined;
  readonly isTestBridge: boolean;
  readonly requestFullscreen: () => void;
}

const TelegramContext = createContext<TelegramContextValue | null>(null);

const getTelegramWebApp = (): TelegramWebApp | undefined =>
  (window as TelegramWindow).Telegram?.WebApp;

const testBridgeEnabled = process.env.NEXT_PUBLIC_ENABLE_TEST_BRIDGE === "true";

export function TelegramAppProvider({
  children,
}: {
  readonly children: ReactNode;
}): JSX.Element {
  const [booted, setBooted] = useState(false);
  const [initData, setInitData] = useState("");
  const [launchToken, setLaunchToken] = useState<string>();
  const [isTestBridge, setIsTestBridge] = useState(false);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const bridgeRequested = testBridgeEnabled && search.get("bridge") === "1";
    setIsTestBridge(bridgeRequested);
    if (bridgeRequested) {
      setInitData("test-bridge-init-data");
      setLaunchToken(search.get("startapp") ?? "test-launch-token-1234567890");
      document.documentElement.style.setProperty(
        "--tg-safe-area-inset-top",
        "0px",
      );
      document.documentElement.style.setProperty(
        "--tg-content-safe-area-inset-bottom",
        "0px",
      );
      setBooted(true);
      return;
    }

    try {
      init();
      mountThemeParamsSync.ifAvailable();
      mountMiniAppSync.ifAvailable();
      void mountViewport.ifAvailable();
      bindViewportCssVars.ifAvailable();
      bindThemeParamsCssVars.ifAvailable();
      setInitData(retrieveRawInitData() ?? getTelegramWebApp()?.initData ?? "");
      setLaunchToken(
        getTelegramWebApp()?.initDataUnsafe?.start_param ??
          search.get("tgWebAppStartParam") ??
          search.get("startapp") ??
          undefined,
      );
      miniAppReady.ifAvailable();
      getTelegramWebApp()?.ready?.();
    } catch {
      setInitData("");
    } finally {
      setBooted(true);
    }

    return () => {
      unmountViewport();
      unmountMiniApp();
      unmountThemeParams();
    };
  }, []);

  const requestFullscreen = useCallback(() => {
    getTelegramWebApp()?.requestFullscreen?.();
  }, []);

  const value = useMemo(
    () => ({
      booted,
      initData,
      launchToken,
      isTestBridge,
      requestFullscreen,
    }),
    [booted, initData, isTestBridge, launchToken, requestFullscreen],
  );
  return (
    <TelegramContext.Provider value={value}>
      {children}
    </TelegramContext.Provider>
  );
}

export const useTelegram = (): TelegramContextValue => {
  const value = useContext(TelegramContext);
  if (value === null) throw new Error("TelegramAppProvider is missing");
  return value;
};

export const useTelegramBack = (onBack: () => void, visible: boolean): void => {
  const { isTestBridge } = useTelegram();
  useEffect(() => {
    if (isTestBridge || !visible) return;
    mountBackButton.ifAvailable();
    showBackButton.ifAvailable();
    onBackButtonClick.ifAvailable(onBack);
    return () => {
      offBackButtonClick.ifAvailable(onBack);
      hideBackButton.ifAvailable();
    };
  }, [isTestBridge, onBack, visible]);
};

interface ThemeContextValue {
  readonly theme: ThemeChoice;
  readonly setTheme: (theme: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const resolveTheme = (choice: ThemeChoice): "dark" | "light" => {
  if (choice === "dark" || choice === "light") return choice;
  if (choice === "telegram") {
    const host = getTelegramWebApp()?.colorScheme;
    if (host === "dark" || host === "light") return host;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

export function ThemeProvider({
  children,
}: {
  readonly children: ReactNode;
}): JSX.Element {
  const [theme, setThemeState] = useState<ThemeChoice>(() => {
    if (typeof window === "undefined") return "system";
    const stored = window.localStorage.getItem("collage-theme");
    return stored === "dark" ||
      stored === "light" ||
      stored === "system" ||
      stored === "telegram"
      ? stored
      : "system";
  });
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = (): void => {
      document.documentElement.dataset.theme = resolveTheme(theme);
      document.documentElement.dataset.themeChoice = theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  const setTheme = useCallback((choice: ThemeChoice) => {
    window.localStorage.setItem("collage-theme", choice);
    setThemeState(choice);
  }, []);
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = (): ThemeContextValue => {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error("ThemeProvider is missing");
  return value;
};

interface ApiContextValue {
  readonly api: ApiTransport;
  readonly setSessionToken: (token: string) => void;
}

const ApiContext = createContext<ApiContextValue | null>(null);

export function ApiProvider({
  children,
}: {
  readonly children: ReactNode;
}): JSX.Element {
  const telegram = useTelegram();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const scenario =
    typeof window === "undefined"
      ? "default"
      : (new URLSearchParams(window.location.search).get("scenario") ??
        "default");
  const api = useMemo<ApiTransport>(
    () =>
      telegram.isTestBridge
        ? new TestBridgeTransport(scenario)
        : new HttpApiTransport(() => sessionToken),
    [scenario, sessionToken, telegram.isTestBridge],
  );
  return (
    <ApiContext.Provider value={{ api, setSessionToken }}>
      {children}
    </ApiContext.Provider>
  );
}

export const useApi = (): ApiContextValue => {
  const value = useContext(ApiContext);
  if (value === null) throw new Error("ApiProvider is missing");
  return value;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});

export function AppProviders({
  children,
}: {
  readonly children: ReactNode;
}): JSX.Element {
  useEffect(() => {
    const setOnline = (): void => onlineManager.setOnline(navigator.onLine);
    window.addEventListener("online", setOnline);
    window.addEventListener("offline", setOnline);
    setOnline();
    return () => {
      window.removeEventListener("online", setOnline);
      window.removeEventListener("offline", setOnline);
    };
  }, []);
  return (
    <TelegramAppProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ApiProvider>{children}</ApiProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </TelegramAppProvider>
  );
}
