import type { NotificationConfig, NotificationStatic } from "animal-island-ui";
import type { ReactNode } from "react";
import { toast as sonner } from "sonner";

import { effectiveSkin, getSkin } from "@/lib/skin";

export interface NotifyOptions {
  description?: ReactNode;
  /** 毫秒，与 sonner 一致；转给库时换算成秒 */
  duration?: number;
  toasterId?: string;
}

type Kind = "success" | "error" | "info";
type Args = [message: ReactNode, options?: NotifyOptions];

interface PromiseMessages<T> {
  loading: string;
  success: string | ((value: T) => string);
  error: string | ((error: unknown) => string);
}

let notifier: NotificationStatic | null = null;
let promiseSeq = 0;

export function setNotifier(next: NotificationStatic | null): void {
  notifier = next;
}

function activeNotifier(): NotificationStatic | null {
  if (!notifier || typeof window === "undefined") return null;
  return effectiveSkin(window.location.pathname, getSkin()) === "island" ? notifier : null;
}

function emit(kind: Kind, args: Args): void {
  const [message, options] = args;
  const island = options?.toasterId ? null : activeNotifier();
  if (!island) {
    sonner[kind](...args);
    return;
  }
  const config: NotificationConfig = { message };
  if (options?.description !== undefined) config.description = options.description;
  if (options?.duration !== undefined) config.duration = options.duration / 1000;
  island[kind](config);
}

function promise<T>(p: Promise<T>, messages: PromiseMessages<T>) {
  const island = activeNotifier();
  if (!island) return sonner.promise(p, messages);

  const key = `notify-promise-${++promiseSeq}`;
  island.info({ key, message: messages.loading, duration: 0 });
  p.then(
    (value) => {
      const { success } = messages;
      island.success({ key, message: typeof success === "function" ? success(value) : success });
    },
    (error: unknown) => {
      const { error: fail } = messages;
      island.error({ key, message: typeof fail === "function" ? fail(error) : fail });
    },
  );
  return undefined;
}

function bare(...args: Parameters<typeof sonner>) {
  return sonner(...args);
}

export const toast = Object.assign(bare, {
  success: (...args: Args) => emit("success", args),
  error: (...args: Args) => emit("error", args),
  info: (...args: Args) => emit("info", args),
  promise,
});
