/** Declares Vite asset-module imports for the TypeScript compiler. */
declare module "*.css";

interface ImportMetaEnv {
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
