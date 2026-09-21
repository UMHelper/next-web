"use client";

import React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { buildSearchPath } from "@/lib/site";

const formSchema = z.object({
  code: z
    .string()
    .min(4, { message: "Search Keywords must be at least 4 characters." })
    .max(30, { message: "Search Keywords must be at most 30 characters." }),
  is_prof: z.boolean().default(false),
});

export type SearchFormVariant = "hero" | "header" | "inline" | "dialog";

type SearchFormProps = {
  variant: SearchFormVariant;
  defaultCode?: string;
  defaultMode?: "course" | "instructor";
  onSubmitted?: () => void;
  className?: string;
};

export default function SearchForm({
  variant,
  defaultCode = "",
  defaultMode = "course",
  onSubmitted,
  className,
}: SearchFormProps) {
  const router = useRouter();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: defaultCode,
      is_prof: defaultMode === "instructor",
    },
  });
  const isProf = form.watch("is_prof");

  function onSubmit(values: z.infer<typeof formSchema>) {
    router.push(buildSearchPath(values.is_prof ? "instructor" : "course", values.code));
    onSubmitted?.();
  }

  const isHero = variant === "hero";
  const isHeader = variant === "header";

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className={cn("space-y-2", className)}>
        <FormField
          control={form.control}
          name="is_prof"
          render={({ field }) => (
            <FormItem
              className={cn(
                "flex flex-row items-center space-x-2 mb-1",
                isHeader && "order-first",
              )}
            >
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div>
                <div className={cn("text-sm font-medium", isHero && "text-white")}>
                  Search Instructors
                </div>
                <FormDescription className={cn(isHero && "text-white/80")}>
                  搜索講師
                </FormDescription>
              </div>
            </FormItem>
          )}
        />
        <div className={cn(isHeader ? "flex flex-row items-start space-x-2" : "space-y-2")}>
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem className={cn(isHeader && "flex-1")}>
                <FormControl>
                  <Input
                    placeholder={isProf ? "e.g., CHAN Tai Man" : "e.g., ACCT1000 or Accounting"}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            className={cn(
              "bg-gradient-to-r from-blue-600 to-indigo-500",
              variant !== "header" && "w-full",
            )}
          >
            <Search size={20} />
            <span>Search</span>
          </Button>
        </div>
      </form>
    </Form>
  );
}
