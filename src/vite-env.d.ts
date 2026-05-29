/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOCAL_AGENT_BASE_URL?: string;
}

declare module "*.md?raw" {
  const content: string;
  export default content;
}
