export interface SetupStatus {
  setup_enabled: boolean
  env_file_exists: boolean
  database_url_masked: string
  connection: { ok: boolean; message: string }
  migrations_ok: boolean
  school_count: number | null
}

export interface DatabaseConfig {
  host: string
  port: number
  username: string
  password: string
  database: string
}

export const DEFAULT_DATABASE_CONFIG: DatabaseConfig = {
  host: '127.0.0.1',
  port: 5432,
  username: 'postgres',
  password: '',
  database: 'capabble_school_intel',
}
