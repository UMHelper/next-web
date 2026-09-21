import SearchComp from "@/components/search";
import { getAppConfig } from "@/lib/config/app-config";

export default async function HomeSearchSection() {
  const { currentYear, currentSem, databaseLastUpdate } = await getAppConfig();

  return (
    <SearchComp
      currentYear={currentYear}
      currentSem={currentSem}
      databaseLastUpdate={databaseLastUpdate}
    />
  );
}
