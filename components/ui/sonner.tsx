"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg dark:group-[.toaster]:bg-gray-800 dark:group-[.toaster]:text-white dark:group-[.toaster]:border-gray-700",
          description: "group-[.toast]:text-muted-foreground dark:group-[.toast]:text-gray-300",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground dark:group-[.toast]:bg-gray-700 dark:group-[.toast]:text-white",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground dark:group-[.toast]:bg-gray-700 dark:group-[.toast]:text-gray-300",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
