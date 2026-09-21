export type AppConfig = {
  currentYear: number;
  currentSem: 1 | 2;
  isPreenrollmentOpen: boolean;
  databaseLastUpdate: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  currentYear: 2026,
  currentSem: 1,
  isPreenrollmentOpen: true,
  databaseLastUpdate: null,
  updatedAt: null,
  updatedBy: null,
};

type SupabaseLike = { from(table: string): any };

function toNullableString(value: unknown): string | null {
  return value == null ? null : String(value);
}

export function mapAppConfigRow(row: Record<string, unknown> | null | undefined): AppConfig {
  if (!row) return { ...DEFAULT_APP_CONFIG };

  const year = Number(row.current_year);
  const sem = Number(row.current_sem);
  const open = row.is_preenrollment_open;

  return {
    currentYear: Number.isInteger(year) && year > 2000 ? year : DEFAULT_APP_CONFIG.currentYear,
    currentSem: sem === 2 ? 2 : sem === 1 ? 1 : DEFAULT_APP_CONFIG.currentSem,
    isPreenrollmentOpen: typeof open === "boolean" ? open : DEFAULT_APP_CONFIG.isPreenrollmentOpen,
    databaseLastUpdate: toNullableString(row.database_last_update),
    updatedAt: toNullableString(row.updated_at),
    updatedBy: toNullableString(row.updated_by),
  };
}

export async function readAppConfig(client: SupabaseLike): Promise<AppConfig> {
  const { data, error } = await client
    .from("app_config")
    .select("current_year, current_sem, is_preenrollment_open, database_last_update, updated_at, updated_by")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("[app-config] read failed:", error.message);
    return { ...DEFAULT_APP_CONFIG };
  }

  return mapAppConfigRow(data);
}
