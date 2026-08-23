"use client";

import Link from "next/link";
import {
  Check,
  CheckCircle2,
  Copy,
  LoaderCircle,
  RefreshCw,
  Settings,
  Square,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MarkdownContent } from "@/components/markdown-content";
import { ScrollJumpControls } from "@/components/scroll-jump-controls";
import { Button, buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { copyText } from "@/lib/clipboard";
import { streamCompatibleChat } from "@/modules/ai/infrastructure/openai-compatible-browser-client";
import { useAiSettings } from "@/modules/ai/ui/use-ai-settings";
import { isAiEndpointReady } from "@/modules/ai/domain/settings";
import type { Question } from "@/modules/catalog/domain/question";
import {
  buildQuestionAnalysisInput,
  getAnalysisPromptPreset,
  type AnalysisMode,
  type AnalysisPromptId,
} from "../domain/prompt-presets";
import {
  createAnalysisCacheId,
  getReusableCachedQuestionAnalysis,
  saveCachedQuestionAnalysis,
  type CachedAnalysisResult,
} from "../infrastructure/analysis-cache-repository";

const modeLabels: Record<AnalysisMode, string> = {
  coach: "全能教练",
  deep: "深度原理",
  quick: "速成技巧",
  super: "超能模式",
};

type AnalysisRequestStatus = "streaming" | "completed" | "error" | "stopped";
type QuestionCopyStatus = "idle" | "copied" | "error";

const questionCopyContent = {
  idle: { label: "复制题目", icon: Copy },
  copied: { label: "已复制", icon: Check },
  error: { label: "复制失败", icon: TriangleAlert },
} satisfies Record<QuestionCopyStatus, { label: string; icon: typeof Copy }>;

function isAnalysisAbort(error: unknown, signal?: AbortSignal): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function QuestionAnalysisDialog({
  question,
  answer,
  open,
  onClose,
}: {
  question?: Question;
  answer?: string;
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const analysisBodyRef = useRef<HTMLDivElement>(null);
  const abortController = useRef<AbortController>(null);
  const activeAnalysisRunKey = useRef<string>(undefined);
  const generationVersion = useRef(0);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultQuestionId = useRef<string | undefined>(undefined);
  const { settings, isReady } = useAiSettings();
  const [mode, setMode] = useState<AnalysisMode>("coach");
  const [results, setResults] = useState<
    Partial<Record<AnalysisPromptId, string>>
  >({});
  const [errors, setErrors] = useState<
    Partial<Record<AnalysisPromptId, string>>
  >({});
  const [requestStatuses, setRequestStatuses] = useState<
    Partial<Record<AnalysisPromptId, AnalysisRequestStatus>>
  >({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [cachedAt, setCachedAt] = useState<string>();
  const [modeQuestionId, setModeQuestionId] = useState<string>();
  const [questionCopyStatus, setQuestionCopyStatus] =
    useState<QuestionCopyStatus>("idle");
  const orderedPromptPresets = useMemo(
    () => settings.analysisPromptOrder.map(getAnalysisPromptPreset),
    [settings.analysisPromptOrder]
  );

  const requestSpecs = useMemo(() => {
    const ids: readonly AnalysisPromptId[] =
      mode === "super" ? settings.analysisPromptOrder : [mode];
    return ids.map(promptId => ({
      promptId,
      model: settings.analysisModels[promptId],
      reasoningEffort: settings.analysisReasoningEfforts[promptId],
      systemPrompt: settings.analysisPrompts[promptId],
    }));
  }, [
    mode,
    settings.analysisModels,
    settings.analysisReasoningEfforts,
    settings.analysisPromptOrder,
    settings.analysisPrompts,
  ]);
  const superRequestSpecs = useMemo(
    () =>
      settings.analysisPromptOrder.map(promptId => ({
        promptId,
        model: settings.analysisModels[promptId],
        reasoningEffort: settings.analysisReasoningEfforts[promptId],
        systemPrompt: settings.analysisPrompts[promptId],
      })),
    [
      settings.analysisModels,
      settings.analysisReasoningEfforts,
      settings.analysisPromptOrder,
      settings.analysisPrompts,
    ]
  );
  const analysisInput = useMemo(
    () => (question ? buildQuestionAnalysisInput({ question, answer }) : ""),
    [answer, question]
  );
  const analysisRunKey = useMemo(
    () =>
      question
        ? JSON.stringify({
            questionId: question.id,
            analysisInput,
            mode,
            requests: requestSpecs,
          })
        : undefined,
    [analysisInput, mode, question, requestSpecs]
  );

  const abortActiveRequest = useCallback(() => {
    const controller = abortController.current;
    abortController.current = null;
    activeAnalysisRunKey.current = undefined;
    if (controller && !controller.signal.aborted) {
      controller.abort(new DOMException("题目解析已取消", "AbortError"));
    }
  }, []);

  const cancelGeneration = useCallback(() => {
    generationVersion.current += 1;
    abortActiveRequest();
    setIsGenerating(false);
    setRequestStatuses(current =>
      Object.fromEntries(
        Object.entries(current).map(([promptId, status]) => [
          promptId,
          status === "streaming" ? "stopped" : status,
        ])
      )
    );
  }, [abortActiveRequest]);

  const analyze = useCallback(
    async (force = false) => {
      const runId = ++generationVersion.current;
      abortActiveRequest();
      setIsGenerating(false);
      const fallbackPromptId =
        mode === "super" ? settings.defaultAnalysisPrompt : mode;
      const canReuseCurrentResults =
        !force &&
        Boolean(question?.id) &&
        resultQuestionId.current === question?.id;
      if (!canReuseCurrentResults) {
        setResults({});
        setErrors({});
        setRequestStatuses({});
        setCachedAt(undefined);
      }

      try {
        if (!question || !isReady || !analysisInput || !analysisRunKey) return;
        activeAnalysisRunKey.current = analysisRunKey;
        if (!isAiEndpointReady(settings)) {
          setErrors({
            [fallbackPromptId]: "请先配置模型 API Key，再解析题目。",
          });
          return;
        }

        const cacheInput = {
          questionId: question.id,
          analysisInput,
          mode,
          requests: requestSpecs,
        } as const;
        const cacheId = await createAnalysisCacheId(cacheInput);
        if (runId !== generationVersion.current) return;

        if (!force) {
          const cached = await getReusableCachedQuestionAnalysis({
            ...cacheInput,
            superRequests: superRequestSpecs,
          });
          if (runId !== generationVersion.current) return;
          if (cached) {
            const cachedResults = Object.fromEntries(
              cached.results.map(result => [result.promptId, result.content])
            );
            const cachedStatuses = Object.fromEntries(
              cached.results.map(result => [result.promptId, "completed"])
            );
            const sameQuestion = resultQuestionId.current === question.id;
            setResults(current =>
              sameQuestion ? { ...current, ...cachedResults } : cachedResults
            );
            setErrors(current => (sameQuestion ? current : {}));
            setRequestStatuses(current =>
              sameQuestion ? { ...current, ...cachedStatuses } : cachedStatuses
            );
            resultQuestionId.current = question.id;
            setCachedAt(cached.createdAt);
            return;
          }
        }

        setResults({});
        setErrors({});
        setRequestStatuses({});
        setCachedAt(undefined);
        resultQuestionId.current = question.id;
        const controller = new AbortController();
        if (runId !== generationVersion.current) return;
        abortController.current = controller;
        setIsGenerating(true);
        setRequestStatuses(
          Object.fromEntries(
            requestSpecs.map(request => [request.promptId, "streaming"])
          )
        );

        // Create every promise before awaiting any of them. In super mode this
        // starts all three network streams in the same event-loop turn.
        const runningRequests = requestSpecs.map(async request => {
          try {
            const content = await streamCompatibleChat({
              settings: {
                ...settings,
                model: request.model,
                reasoningEffort: request.reasoningEffort,
              },
              signal: controller.signal,
              messages: [
                { role: "system", content: request.systemPrompt },
                { role: "user", content: analysisInput },
              ],
              onText: content => {
                if (
                  runId !== generationVersion.current ||
                  controller.signal.aborted
                ) {
                  return;
                }
                setResults(current => ({
                  ...current,
                  [request.promptId]: content,
                }));
              },
            });
            if (runId === generationVersion.current) {
              setRequestStatuses(current => ({
                ...current,
                [request.promptId]: "completed",
              }));
            }
            return {
              ...request,
              content,
            } satisfies CachedAnalysisResult & { systemPrompt: string };
          } catch (error) {
            if (
              !isAnalysisAbort(error, controller.signal) &&
              runId === generationVersion.current
            ) {
              setErrors(current => ({
                ...current,
                [request.promptId]:
                  error instanceof Error ? error.message : "题目解析失败",
              }));
              setRequestStatuses(current => ({
                ...current,
                [request.promptId]: "error",
              }));
            }
            return undefined;
          }
        });
        const completed = await Promise.all(runningRequests);

        if (runId !== generationVersion.current || controller.signal.aborted) {
          return;
        }

        const successful = completed
          .filter((result): result is NonNullable<(typeof completed)[number]> =>
            Boolean(result?.content)
          )
          .map(result => ({
            promptId: result.promptId,
            model: result.model,
            content: result.content,
          }));

        if (successful.length) {
          const createdAt = new Date().toISOString();
          try {
            await saveCachedQuestionAnalysis({
              id: cacheId,
              questionId: question.id,
              mode,
              createdAt,
              results: successful,
            });
            if (runId === generationVersion.current) setCachedAt(createdAt);
          } catch (error) {
            console.error("Failed to cache question analysis", error);
          }
        }
      } catch (error) {
        if (
          runId !== generationVersion.current ||
          isAnalysisAbort(error, abortController.current?.signal)
        ) {
          return;
        }
        setResults({});
        setErrors({
          [fallbackPromptId]:
            error instanceof Error ? error.message : "题目解析失败",
        });
        setRequestStatuses({ [fallbackPromptId]: "error" });
      } finally {
        if (runId === generationVersion.current) {
          abortController.current = null;
          activeAnalysisRunKey.current = undefined;
          setIsGenerating(false);
        }
      }
    },
    [
      abortActiveRequest,
      analysisInput,
      analysisRunKey,
      isReady,
      mode,
      question,
      requestSpecs,
      settings,
      superRequestSpecs,
    ]
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open || !isReady || !question) return;
    if (modeQuestionId === question.id) return;
    setMode(
      settings.superModeByDefault ? "super" : settings.defaultAnalysisPrompt
    );
    setModeQuestionId(question.id);
  }, [
    isReady,
    modeQuestionId,
    open,
    question,
    settings.defaultAnalysisPrompt,
    settings.superModeByDefault,
  ]);

  useEffect(() => {
    if (
      !open ||
      !isReady ||
      !question ||
      modeQuestionId !== question.id ||
      activeAnalysisRunKey.current === analysisRunKey
    ) {
      return;
    }
    void analyze();
  }, [analysisRunKey, analyze, isReady, modeQuestionId, open, question]);

  useEffect(
    () => () => {
      generationVersion.current += 1;
      abortActiveRequest();
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
    },
    [abortActiveRequest]
  );

  useEffect(() => {
    setQuestionCopyStatus("idle");
  }, [question?.id]);

  const handleCopyQuestion = async () => {
    if (!question?.prompt) return;

    try {
      await copyText(question.prompt);
      setQuestionCopyStatus("copied");
    } catch {
      setQuestionCopyStatus("error");
    }

    if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = setTimeout(
      () => setQuestionCopyStatus("idle"),
      1800
    );
  };

  const visiblePromptId =
    mode === "super" ? settings.defaultAnalysisPrompt : mode;
  const visibleContent = results[visiblePromptId];
  const visibleError = errors[visiblePromptId];
  const { label: questionCopyLabel, icon: QuestionCopyIcon } =
    questionCopyContent[questionCopyStatus];

  return (
    <dialog
      ref={dialogRef}
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className={cn(
        "m-auto h-dvh max-h-dvh w-full max-w-none overflow-hidden border-0 bg-surface p-0 text-foreground backdrop:bg-black/60 open:flex open:flex-col sm:max-h-[92dvh] sm:rounded-xl sm:border",
        mode === "super"
          ? "sm:h-[92dvh] sm:w-[min(90rem,calc(100%-1rem))]"
          : "sm:h-auto sm:w-[min(60rem,calc(100%-1rem))]"
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:gap-4 sm:px-6 sm:py-4">
        <div className="flex min-w-0 flex-1 items-start gap-1 sm:gap-2">
          <h2 className="line-clamp-2 min-w-0 flex-1 text-base font-semibold leading-6 sm:text-lg">
            {question?.prompt}
          </h2>
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "-mt-1 h-8 shrink-0 px-2 text-xs",
              questionCopyStatus === "copied" && "text-success",
              questionCopyStatus === "error" && "text-destructive"
            )}
            aria-label={questionCopyLabel}
            title={questionCopyLabel}
            onClick={() => void handleCopyQuestion()}
          >
            <QuestionCopyIcon aria-hidden="true" />
            <span className="hidden sm:inline" aria-hidden="true">
              {questionCopyLabel}
            </span>
            <span className="sr-only" aria-live="polite">
              {questionCopyLabel}
            </span>
          </Button>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="-mr-2 -mt-2 shrink-0"
          aria-label="关闭解析窗口"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </header>

      <div className="border-b border-border px-4 py-3 sm:flex sm:items-center sm:gap-2 sm:px-6">
        <div
          className="-mx-1 flex items-center gap-2 overflow-x-auto px-1"
          role="radiogroup"
          aria-label="解析模式"
        >
          {([...settings.analysisPromptOrder, "super"] as const).map(value => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              disabled={isGenerating}
              onClick={() => setMode(value)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                mode === value
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              {value === "super" ? (
                <Zap className="size-3.5" aria-hidden="true" />
              ) : null}
              {modeLabels[value]}
            </button>
          ))}
        </div>
        {cachedAt ? (
          <span className="mt-2 inline-flex items-center gap-1 text-xs text-success sm:ml-auto sm:mt-0">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            已缓存 · {new Date(cachedAt).toLocaleString("zh-CN")}
          </span>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={analysisBodyRef}
          className={cn(
            "h-full px-4 py-5 sm:px-6 sm:py-6",
            mode === "super"
              ? "overflow-y-auto overscroll-contain lg:overflow-hidden"
              : "overflow-y-auto"
          )}
          aria-live="polite"
          aria-busy={isGenerating}
        >
          {!isReady ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />{" "}
              正在读取模型设置
            </p>
          ) : !isAiEndpointReady(settings) ? (
            <div className="rounded-lg border border-border bg-background p-5">
              <p className="text-sm leading-6 text-muted-foreground">
                请先在设置中配置模型端点和 API Key。
              </p>
              <Link
                href="/settings"
                className={buttonStyles({ size: "sm", className: "mt-4" })}
              >
                <Settings aria-hidden="true" /> 前往设置
              </Link>
            </div>
          ) : mode === "super" ? (
            <div className="grid gap-3 lg:h-full lg:min-h-0 lg:grid-cols-3">
              {orderedPromptPresets.map(preset => {
                const status = requestStatuses[preset.id];
                const content = results[preset.id];
                const error = errors[preset.id];
                return (
                  <section
                    key={preset.id}
                    className="flex min-h-64 flex-col overflow-hidden rounded-lg border border-border bg-background lg:min-h-0"
                    aria-labelledby={`analysis-${preset.id}`}
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                      <h3
                        id={`analysis-${preset.id}`}
                        className="text-sm font-semibold"
                      >
                        {preset.label}
                      </h3>
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        {status === "streaming" ? (
                          <LoaderCircle
                            className="size-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : status === "completed" ? (
                          <CheckCircle2
                            className="size-3.5 text-success"
                            aria-hidden="true"
                          />
                        ) : status === "stopped" ? (
                          <Square className="size-3.5" aria-hidden="true" />
                        ) : null}
                        {status === "streaming"
                          ? "生成中"
                          : status === "completed"
                            ? "已完成"
                            : status === "error"
                              ? "失败"
                              : status === "stopped"
                                ? "已停止"
                                : "等待中"}
                      </span>
                    </div>
                    <AnalysisPanelContent>
                      {content ? (
                        <>
                          <MarkdownContent content={content} />
                          {error ? (
                            <p
                              className="mt-4 border-t border-border pt-3 text-sm text-destructive"
                              role="alert"
                            >
                              流式输出已中断：{error}
                            </p>
                          ) : null}
                        </>
                      ) : error ? (
                        <p className="text-sm text-destructive" role="alert">
                          {error}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {status === "stopped" ? "生成已停止" : "正在解析"}
                        </p>
                      )}
                    </AnalysisPanelContent>
                  </section>
                );
              })}
            </div>
          ) : visibleContent ? (
            <MarkdownContent content={visibleContent} />
          ) : visibleError ? (
            <div className="rounded-lg border border-destructive/30 bg-background p-5">
              <p className="text-sm text-destructive" role="alert">
                {visibleError}
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-4"
                onClick={() => void analyze(true)}
              >
                <RefreshCw aria-hidden="true" /> 重试
              </Button>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
              正在解析
            </p>
          )}
        </div>
        <ScrollJumpControls
          targetRef={analysisBodyRef}
          className={cn(
            "absolute bottom-3 right-3 z-10",
            mode === "super" && "lg:hidden"
          )}
        />
      </div>

      {isGenerating || isAiEndpointReady(settings) ? (
        <footer className="flex justify-end border-t border-border px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:py-3">
          {isGenerating ? (
            <Button variant="secondary" size="sm" onClick={cancelGeneration}>
              <Square aria-hidden="true" /> 停止生成
            </Button>
          ) : isAiEndpointReady(settings) ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void analyze(true)}
            >
              <RefreshCw aria-hidden="true" /> 忽略缓存，重新解析
            </Button>
          ) : null}
        </footer>
      ) : null}
    </dialog>
  );
}

function AnalysisPanelContent({ children }: { children: ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative min-h-48 flex-1 lg:min-h-0">
      <div
        ref={contentRef}
        className="overscroll-contain p-4 lg:h-full lg:overflow-y-auto lg:pr-14"
      >
        {children}
      </div>
      <ScrollJumpControls
        targetRef={contentRef}
        className="absolute bottom-3 right-3 z-10 hidden lg:flex"
      />
    </div>
  );
}
