"use client";

import { Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import SearchForm from "@/components/search/search-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function SearchButton() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  if (pathname === "/" || pathname.startsWith("/timetable") || pathname.startsWith("/search")) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="flex items-center outline-none" aria-label="Search">
        <Search size={20} strokeWidth={2} />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          {/* No visible heading: keep the required title/description for screen readers only. */}
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">
            Search courses and instructors.
          </DialogDescription>
          <SearchForm
            variant="dialog"
            onSubmitted={() => {
              window.setTimeout(() => setOpen(false), 100);
            }}
          />
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
