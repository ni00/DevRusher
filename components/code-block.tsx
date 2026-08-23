"use client";

import {
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { highlightAll } from "microlighter";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { copyText } from "@/lib/clipboard";

type CopyStatus = "idle" | "copied" | "error";

const copyStatusContent = {
  idle: { label: "复制", icon: Copy },
  copied: { label: "已复制", icon: Check },
  error: { label: "复制失败", icon: TriangleAlert },
} satisfies Record<CopyStatus, { label: string; icon: typeof Copy }>;

let syntaxHighlightTimer: ReturnType<typeof setTimeout> | null = null;
let syntaxHighlightRunning = false;
let syntaxHighlightRequested = false;

async function runSyntaxHighlight() {
  if (syntaxHighlightRunning) {
    syntaxHighlightRequested = true;
    return;
  }

  syntaxHighlightRunning = true;
  do {
    syntaxHighlightRequested = false;
    try {
      await highlightAll({
        root: document,
        selector: "[data-microlighter] pre > code",
      });
    } catch {
      // Highlighting is progressive enhancement; plain code remains usable.
    }
  } while (syntaxHighlightRequested);
  syntaxHighlightRunning = false;
}

function scheduleSyntaxHighlight() {
  if (
    typeof document === "undefined" ||
    typeof CSS === "undefined" ||
    !("highlights" in CSS) ||
    !("Highlight" in globalThis)
  ) {
    return;
  }

  if (syntaxHighlightTimer) clearTimeout(syntaxHighlightTimer);
  syntaxHighlightTimer = setTimeout(() => {
    syntaxHighlightTimer = null;
    window.requestAnimationFrame(() => {
      void runSyntaxHighlight();
    });
  }, 80);
}

export function CodeBlock({ children }: { children: ReactNode }) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const { label, icon: StatusIcon } = copyStatusContent[copyStatus];
  const code = getNodeText(children).replace(/\r?\n$/, "");
  const highlightKey = `${getNodeLanguage(children)}\u0000${code}`;

  useLayoutEffect(() => {
    const pre = preRef.current;
    if (!pre) return;

    pre.scrollLeft = 0;
    scheduleSyntaxHighlight();
    const frame = window.requestAnimationFrame(() => {
      if (pre.isConnected) pre.scrollLeft = 0;
    });

    return () => {
      window.cancelAnimationFrame(frame);
      scheduleSyntaxHighlight();
    };
  }, [highlightKey]);

  useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    []
  );

  const handleCopy = async () => {
    try {
      await copyText(code);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }

    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopyStatus("idle"), 1800);
  };

  return (
    <div
      data-microlighter
      data-syntax-theme="tokyo-night"
      className="relative my-4 overflow-hidden rounded-lg border border-border bg-[var(--syntax-background)] text-[var(--syntax-foreground)]"
      style={{ colorScheme: "dark" }}
    >
      <Button
        aria-label={label}
        title={label}
        variant="secondary"
        size="sm"
        className={cn(
          "absolute right-2 top-2 z-10 border-white/20 bg-[var(--syntax-background)] px-2.5 text-[var(--syntax-foreground)] hover:bg-white/10 hover:text-white focus-visible:ring-white/70 focus-visible:ring-offset-[var(--syntax-background)]",
          copyStatus === "copied" && "border-emerald-400/40 text-emerald-300",
          copyStatus === "error" && "border-red-400/40 text-red-300"
        )}
        onClick={handleCopy}
      >
        <StatusIcon aria-hidden="true" />
        <span aria-live="polite">{label}</span>
      </Button>
      <pre
        ref={preRef}
        className="overflow-x-auto overscroll-x-contain p-3 pr-24 sm:p-4 sm:pr-24 [&>code]:!block [&>code]:!min-w-max [&>code]:!rounded-none [&>code]:!bg-transparent [&>code]:!p-0 [&>code]:!text-inherit"
      >
        {children}
      </pre>
    </div>
  );
}

function getNodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (typeof node === "bigint") return node.toString();
  if (Array.isArray(node)) return node.map(getNodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getNodeText(node.props.children);
  }

  return "";
}

function getNodeLanguage(node: ReactNode): string {
  if (Array.isArray(node)) {
    return node.map(getNodeLanguage).find(Boolean) ?? "";
  }
  if (isValidElement<{ children?: ReactNode; className?: string }>(node)) {
    const languageClass = node.props.className
      ?.split(/\s+/)
      .find(className => className.startsWith("language-"));
    return (
      languageClass?.slice("language-".length) ??
      getNodeLanguage(node.props.children)
    );
  }
  return "";
}
