/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CREDENTIAL_SOURCE?: string;
  readonly VITE_OPENROUTER_API_KEY?: string;
  readonly VITE_VAULT_PACKAGE_ID?: string;
  readonly VITE_WALRUS_PUBLISHER_URL?: string;
  readonly VITE_ENOKI_PUBLIC_API_KEY?: string;
  readonly VITE_ENOKI_GOOGLE_CLIENT_ID?: string;
  readonly VITE_ENOKI_REDIRECT_URL?: string;
  readonly VITE_ENOKI_FACEBOOK_CLIENT_ID?: string;
  readonly VITE_ENOKI_TWITCH_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
