/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly APP_MODE?: string;
  readonly VITE_APP_MODE?: string;
  readonly VITE_ADMIN_PASSCODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __APP_MODE__?: string;
}
