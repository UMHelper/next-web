import Link from "next/link";

import { faculty, faculty_dept, getFacultyLabel } from "@/lib/consant";
import { buildCatalogPath } from "@/lib/site";

export function generateMetadata() {
  return {
    title: "Catalog",
    description: "Browse University of Macau courses by faculty and department.",
    alternates: { canonical: "/catalog" },
  };
}

const CatalogPage = async () => {
  return (
    <div className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
      {faculty.map((fac) => {
        const departments = faculty_dept[fac] ?? [];
        const href = departments.length === 1
          ? buildCatalogPath([fac, departments[0]])
          : buildCatalogPath([fac]);

        return (
          <Link
            key={fac}
            href={href}
            className="rounded-lg border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900"
          >
            <div className="text-lg font-semibold">{getFacultyLabel(fac)}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {departments.length > 0
                ? `${departments.length} department${departments.length > 1 ? "s" : ""}`
                : "Faculty catalog"}
            </div>
          </Link>
        );
      })}
    </div>
  );
};

export default CatalogPage;