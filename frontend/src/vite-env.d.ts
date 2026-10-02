/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" builds the /dev/kit route into a production bundle (e2e only). */
  readonly VITE_DEV_KIT?: string;
}
