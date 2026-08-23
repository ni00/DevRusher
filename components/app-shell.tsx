"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  House,
  LibraryBig,
  MessagesSquare,
  Settings,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const navigation = [
  {
    href: "/",
    label: "首页",
    shortLabel: "首页",
    icon: House,
    matches: ["/"],
  },
  {
    href: "/questions",
    label: "题库",
    shortLabel: "题库",
    icon: LibraryBig,
    matches: ["/questions", "/practice"],
  },
  {
    href: "/interview",
    label: "模拟面试",
    shortLabel: "模拟",
    icon: MessagesSquare,
    matches: ["/interview"],
  },
  {
    href: "/profile",
    label: "我的学习",
    shortLabel: "我的",
    icon: UserRound,
    matches: ["/profile", "/plan"],
  },
] as const;

const githubUrl = "https://github.com/ni00/DevRusher";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.82-.26.82-.58l-.01-2.04c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.75-1.33-1.75-1.09-.75.08-.73.08-.73 1.21.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5 1 .1-.78.41-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18.76.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22l-.01 3.29c0 .31.21.69.82.57A12 12 0 0 0 12 .3Z" />
    </svg>
  );
}

function isRouteActive(pathname: string, matches: readonly string[]): boolean {
  return matches.some(match =>
    match === "/" ? pathname === match : pathname.startsWith(match)
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-surface lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-border px-5">
          <span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <BookOpenText className="size-5" aria-hidden="true" />
          </span>
          <p className="text-base font-semibold tracking-tight">DevRusher</p>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="主导航">
          {navigation.map(item => {
            const active = isRouteActive(pathname, item.matches);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-1">
            <Link
              href="/settings"
              prefetch={false}
              className={cn(
                "flex h-10 min-w-0 flex-1 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                pathname.startsWith("/settings") &&
                  "bg-primary-soft text-primary"
              )}
            >
              <Settings className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">设置与数据</span>
            </Link>
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="grid size-10 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="在 GitHub 查看 DevRusher"
              title="GitHub"
            >
              <GitHubIcon className="size-4" />
            </a>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between border-b border-border bg-background/95 pb-0 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:hidden">
          <Link
            href="/"
            prefetch={false}
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <BookOpenText className="size-4" aria-hidden="true" />
            </span>
            DevRusher
          </Link>
          <div className="flex items-center gap-1">
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="grid size-11 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="在 GitHub 查看 DevRusher"
              title="GitHub"
            >
              <GitHubIcon className="size-4" />
            </a>
            <ThemeToggle />
            <Link
              href="/settings"
              prefetch={false}
              className="grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="设置与数据"
            >
              <Settings className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </header>

        <main className="mx-auto min-h-[calc(100dvh-3.5rem)] w-full max-w-[1440px] pb-[calc(6rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-5 sm:px-6 sm:pt-6 lg:min-h-dvh lg:px-8 lg:pb-10 lg:pt-8">
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-4 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur lg:hidden"
        aria-label="移动端主导航"
      >
        {navigation.map(item => {
          const active = isRouteActive(pathname, item.matches);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              <span className="truncate">{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
