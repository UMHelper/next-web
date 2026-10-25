import { auth } from "@clerk/nextjs/server";

import SearchComp from "@/components/search";
import { canUseAssistant } from "@/lib/assistant/access";
import { getAppConfig } from "@/lib/config/app-config";

export default async function HomeSearchSection() {
  const [{ currentYear, currentSem, databaseLastUpdate }, { userId }] = await Promise.all([
    getAppConfig(),
    auth(),
  ]);
  const assistantAccess = userId ? ((await canUseAssistant(userId)) ? "enabled" : "denied") : null;

  return (
    <SearchComp
      currentYear={currentYear}
      currentSem={currentSem}
      databaseLastUpdate={databaseLastUpdate}
      assistantAccess={assistantAccess}
    />
  );
}
