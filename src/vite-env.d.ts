/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __NATIVE__: boolean;
declare const __APP_VERSION__: string;

declare module '*.py?raw' {
  const source: string;
  export default source;
}
