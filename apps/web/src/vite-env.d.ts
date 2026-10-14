interface ImportMetaEnv {
  /** Endereço público do servidor realtime (não é segredo: vai para o bundle). */
  readonly VITE_REALTIME_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
