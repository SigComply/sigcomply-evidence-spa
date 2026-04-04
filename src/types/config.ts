export interface StorageConfig {
  show_upload_path: boolean;
  prefix: string;
}

export interface RuntimeConfig {
  frameworks: string[];
  storage: StorageConfig;
}
