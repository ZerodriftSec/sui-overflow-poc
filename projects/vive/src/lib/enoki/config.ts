import type { AuthProvider } from "@mysten/enoki";

export interface EnokiOAuthProviderConfig {
  clientId: string;
  redirectUrl?: string;
}

export interface EnokiPublicConfig {
  apiKey: string;
  providers: Partial<Record<AuthProvider, EnokiOAuthProviderConfig>>;
}

function readEnv(key: string): string {
  const value = import.meta.env[key];
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalProvider(
  envKey: string,
  redirectUrl?: string,
): EnokiOAuthProviderConfig | undefined {
  const clientId = readEnv(envKey);
  if (!clientId) return undefined;
  return redirectUrl ? { clientId, redirectUrl } : { clientId };
}

export function readEnokiPublicConfig(): EnokiPublicConfig | null {
  const apiKey = readEnv("VITE_ENOKI_PUBLIC_API_KEY");
  if (!apiKey) return null;

  const redirectUrl = readEnv("VITE_ENOKI_REDIRECT_URL") || undefined;

  const providers: Partial<Record<AuthProvider, EnokiOAuthProviderConfig>> = {
    google: readOptionalProvider("VITE_ENOKI_GOOGLE_CLIENT_ID", redirectUrl),
    facebook: readOptionalProvider("VITE_ENOKI_FACEBOOK_CLIENT_ID", redirectUrl),
    twitch: readOptionalProvider("VITE_ENOKI_TWITCH_CLIENT_ID", redirectUrl),
  };

  const configuredProviders = Object.fromEntries(
    Object.entries(providers).filter((entry): entry is [AuthProvider, EnokiOAuthProviderConfig] =>
      Boolean(entry[1]?.clientId),
    ),
  );

  if (Object.keys(configuredProviders).length === 0) {
    return null;
  }

  return { apiKey, providers: configuredProviders };
}
