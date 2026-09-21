import SearchHeader from "@/components/search/search-header";

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-screen-xl mx-auto p-4 space-y-4">
      <div className="text-2xl font-semibold">You are searching:</div>
      <SearchHeader />
      {children}
    </div>
  );
}
