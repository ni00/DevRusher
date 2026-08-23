"use client";

import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollJumpControls } from "@/components/scroll-jump-controls";
import {
  filterQuestions,
  getTopicOptions,
  type QuestionFilters,
} from "../application/filter-questions";
import {
  getDifficultyLabel,
  difficultyLevels,
  getQuestionTypeLabel,
  getTrack,
  isTrackId,
  questionTypes,
  trackIds,
  trackDefinitions,
  type Question,
  type TrackId,
} from "../domain/question";
import {
  loadQuestionCatalog,
  type QuestionCatalogScope,
} from "../infrastructure/content-pack-source";
import {
  defaultQuestionBankViewState,
  getQuestionBankViewState,
  saveQuestionBankViewState,
  type QuestionBankViewState,
} from "../infrastructure/question-bank-view-state-repository";
import type { ProgressStatus } from "@/modules/progress/domain/question-progress";
import { useQuestionProgress } from "@/modules/progress/ui/use-question-progress";
import { cn } from "@/lib/utils";

const QuestionAnalysisDialog = dynamic(
  () =>
    import("@/modules/question-analysis/ui/question-analysis").then(
      module => module.QuestionAnalysisDialog
    ),
  { ssr: false }
);

const PAGE_SIZE = 20;

const selectStyles =
  "h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/25";

const statusLabels: Record<ProgressStatus, string> = {
  unseen: "未开始",
  learning: "学习中",
  mastered: "已掌握",
};

export function QuestionBank() {
  const searchParams = useSearchParams();
  const initialUrlParams = useRef({
    track: searchParams.get("track"),
    favorites: searchParams.get("favorites"),
    page: searchParams.get("page"),
  });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isViewStateReady, setIsViewStateReady] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState("");
  const [activeQuestion, setActiveQuestion] = useState<Question>();
  const [analysisDialogMounted, setAnalysisDialogMounted] = useState(false);
  const initialRequestedTracks = useRef<TrackId[] | undefined>(undefined);
  const initialScope = useRef<QuestionCatalogScope>("core");
  const loadedTrackScopes = useRef<Map<TrackId, QuestionCatalogScope>>(
    new Map()
  );
  const activeUpdates = useRef(0);
  const questionListRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [pageDraft, setPageDraft] = useState<string | null>(null);
  const [filters, setFilters] = useState<QuestionFilters>(
    defaultQuestionBankViewState.filters
  );
  const deferredSearch = useDeferredValue(filters.search);
  const {
    records,
    favoriteIds,
    isReady: isProgressReady,
    toggleFavorite,
    setStatus,
  } = useQuestionProgress();

  useEffect(() => {
    let active = true;

    getQuestionBankViewState()
      .catch(error => {
        console.error("Failed to load question bank view state", error);
        return defaultQuestionBankViewState;
      })
      .then(storedState => {
        if (!active) return;
        const nextState = applyUrlOverrides(
          storedState,
          initialUrlParams.current
        );
        initialRequestedTracks.current =
          nextState.filters.trackId === "all"
            ? undefined
            : [nextState.filters.trackId];
        initialScope.current = nextState.filters.scope;
        setFilters(nextState.filters);
        setPage(nextState.page);
        setPageDraft(null);
        setIsViewStateReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isViewStateReady) return;
    const controller = new AbortController();
    const requestedTracks = initialRequestedTracks.current;
    const requestedScope = initialScope.current;

    loadQuestionCatalog(controller.signal, requestedTracks, requestedScope)
      .then(items => {
        setQuestions(items);
        loadedTrackScopes.current = new Map(
          (requestedTracks ?? trackIds).map(trackId => [
            trackId,
            requestedScope,
          ])
        );
        setIsLoading(false);
      })
      .catch(loadError => {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error ? loadError.message : "题库加载失败"
        );
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [isViewStateReady]);

  const topics = useMemo(
    () => getTopicOptions(questions, filters.trackId),
    [filters.trackId, questions]
  );
  const resolvedFilters = useMemo<QuestionFilters>(
    () => ({
      ...filters,
      topicId:
        filters.topicId === "all" ||
        topics.some(topic => topic.id === filters.topicId)
          ? filters.topicId
          : "all",
    }),
    [filters, topics]
  );
  const effectiveFilters = useMemo(
    () => ({ ...resolvedFilters, search: deferredSearch }),
    [deferredSearch, resolvedFilters]
  );
  const filteredQuestions = useMemo(
    () => filterQuestions(questions, effectiveFilters, favoriteIds),
    [effectiveFilters, favoriteIds, questions]
  );
  const totalPages = Math.max(
    1,
    Math.ceil(filteredQuestions.length / PAGE_SIZE)
  );
  const currentPage = Math.min(page, totalPages);
  const paginationItems = getPaginationItems(currentPage, totalPages);
  const visibleQuestions = filteredQuestions.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  useEffect(() => {
    if (error || isLoading || !isProgressReady || !isViewStateReady) return;
    const timeout = window.setTimeout(() => {
      void saveQuestionBankViewState({
        filters: resolvedFilters,
        page: currentPage,
      }).catch(error => {
        console.error("Failed to save question bank view state", error);
      });
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [
    currentPage,
    error,
    isLoading,
    isProgressReady,
    isViewStateReady,
    resolvedFilters,
  ]);

  const updateFilter = <Key extends keyof QuestionFilters>(
    key: Key,
    value: QuestionFilters[Key]
  ) => {
    setFilters(current => ({
      ...current,
      [key]: value,
      ...(key === "trackId" ? { topicId: "all" } : {}),
    }));
    setPage(1);
    setPageDraft(null);
  };

  const goToPage = (nextPage: number) => {
    const target = Math.min(totalPages, Math.max(1, Math.trunc(nextPage)));
    setPage(target);
    setPageDraft(null);
    requestAnimationFrame(() => {
      questionListRef.current?.scrollIntoView({ block: "start" });
    });
  };

  const submitPageJump = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pageDraft !== null && !pageDraft.trim()) {
      setPageDraft(null);
      return;
    }
    const requested = Number(pageDraft ?? currentPage);
    if (!Number.isFinite(requested)) {
      setPageDraft(null);
      return;
    }
    goToPage(requested);
  };

  const loadTrack = async (
    trackId: TrackId | "all",
    scope: QuestionCatalogScope
  ) => {
    const candidates = trackId === "all" ? trackIds : [trackId];
    const requested = candidates.filter(value => {
      const loadedScope = loadedTrackScopes.current.get(value);
      return scope === "all" ? loadedScope !== "all" : !loadedScope;
    });
    if (!requested.length) return;

    activeUpdates.current += 1;
    setIsUpdating(true);
    setError("");
    try {
      const items = await loadQuestionCatalog(undefined, requested, scope);
      setQuestions(current => {
        const merged = new Map(
          current.map(question => [question.id, question])
        );
        for (const question of items) merged.set(question.id, question);
        return Array.from(merged.values());
      });
      requested.forEach(value => loadedTrackScopes.current.set(value, scope));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "题包加载失败");
    } finally {
      activeUpdates.current -= 1;
      setIsUpdating(activeUpdates.current > 0);
    }
  };

  if (isLoading || !isViewStateReady || !isProgressReady) {
    return <QuestionBankSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-surface p-6">
        <h2 className="font-semibold text-destructive">无法加载题库</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section
        className="rounded-lg border border-border bg-surface p-3 sm:p-4"
        aria-label="题库筛选"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="inline-flex rounded-md border border-input bg-background p-1"
            role="radiogroup"
            aria-label="题库范围"
          >
            {(
              [
                ["core", "精选题集"],
                ["all", "全部真题"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={filters.scope === value}
                onClick={() => {
                  updateFilter("scope", value);
                  void loadTrack(filters.trackId, value);
                }}
                className={cn(
                  "h-8 rounded px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  filters.scope === value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {isUpdating ? "正在加载题包 · " : null}
            {filters.scope === "core" ? "精选" : "全部"}{" "}
            {filteredQuestions.length.toLocaleString("zh-CN")} 题
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 lg:grid-cols-3 xl:grid-cols-[minmax(14rem,1.25fr)_repeat(4,minmax(7.5rem,1fr))]">
          <label className="relative col-span-2 block xl:col-span-1">
            <span className="sr-only">搜索题目或标签</span>
            <Search
              className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={filters.search}
              onChange={event => updateFilter("search", event.target.value)}
              placeholder="搜索题目或标签"
              className="pl-9"
            />
          </label>
          <label>
            <span className="sr-only">方向</span>
            <select
              className={cn(selectStyles, "w-full")}
              value={filters.trackId}
              onChange={event => {
                const value = event.target.value;
                const nextTrack = isTrackId(value) ? value : "all";
                updateFilter("trackId", nextTrack);
                void loadTrack(nextTrack, filters.scope);
              }}
            >
              <option value="all">全部方向</option>
              {trackDefinitions.map(track => (
                <option key={track.id} value={track.id}>
                  {track.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">主题</span>
            <select
              className={cn(selectStyles, "w-full")}
              value={resolvedFilters.topicId}
              onChange={event => updateFilter("topicId", event.target.value)}
            >
              <option value="all">全部主题</option>
              {topics.map(topic => (
                <option key={topic.id} value={topic.id}>
                  {topic.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">难度等级</span>
            <select
              className={cn(selectStyles, "w-full")}
              value={filters.difficulty}
              onChange={event =>
                updateFilter(
                  "difficulty",
                  event.target.value === "all"
                    ? "all"
                    : (Number(
                        event.target.value
                      ) as QuestionFilters["difficulty"])
                )
              }
            >
              <option value="all">全部难度</option>
              {difficultyLevels.map(level => (
                <option key={level} value={level}>
                  {level} 级 · {getDifficultyLabel(level)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">题型</span>
            <select
              className={cn(selectStyles, "w-full")}
              value={filters.questionType}
              onChange={event =>
                updateFilter(
                  "questionType",
                  event.target.value as QuestionFilters["questionType"]
                )
              }
            >
              <option value="all">全部题型</option>
              {questionTypes.map(questionType => (
                <option key={questionType} value={questionType}>
                  {getQuestionTypeLabel(questionType)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={filters.favoritesOnly}
              onChange={event =>
                updateFilter("favoritesOnly", event.target.checked)
              }
              className="size-4 rounded border-input accent-[hsl(var(--primary))]"
            />
            只看收藏
          </label>
        </div>
      </section>

      {visibleQuestions.length ? (
        <div
          ref={questionListRef}
          className="scroll-mt-20 overflow-hidden rounded-lg border border-border bg-surface"
        >
          {visibleQuestions.map((question, index) => {
            const progress = records.get(question.id);
            const status = progress?.status ?? "unseen";
            const favorite = progress?.favorite ?? false;
            return (
              <article
                key={question.id}
                className={cn(
                  "p-4 sm:p-5",
                  index > 0 && "border-t border-border"
                )}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-4 lg:grid-cols-[minmax(0,1fr)_12rem] lg:gap-x-6">
                  <div className="min-w-0 lg:row-span-2">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-primary">
                        {getTrack(question.trackId).shortLabel}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{question.topicLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span>{getQuestionTypeLabel(question.questionType)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{getDifficultyLabel(question.difficulty)}</span>
                    </div>
                    <h2 className="text-base font-medium leading-7">
                      {question.prompt}
                    </h2>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="-mr-2 -mt-2 shrink-0 justify-self-end"
                    aria-label={favorite ? "取消收藏" : "收藏题目"}
                    aria-pressed={favorite}
                    onClick={() => toggleFavorite(question.id)}
                  >
                    {favorite ? (
                      <BookmarkCheck
                        className="text-primary"
                        aria-hidden="true"
                      />
                    ) : (
                      <Bookmark aria-hidden="true" />
                    )}
                  </Button>
                  <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-span-1 lg:col-start-2 lg:row-start-2 lg:justify-self-end lg:self-end">
                    <label
                      className="sr-only"
                      htmlFor={`status-${question.id}`}
                    >
                      学习状态
                    </label>
                    <select
                      id={`status-${question.id}`}
                      value={status}
                      onChange={event =>
                        setStatus(
                          question.id,
                          event.target.value as ProgressStatus
                        )
                      }
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      onClick={() => {
                        setAnalysisDialogMounted(true);
                        setActiveQuestion(question);
                      }}
                    >
                      解析题目
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-surface px-5 py-12 text-center">
          <h2 className="text-sm font-semibold">没有符合条件的题目</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {filters.scope === "core"
              ? "调整筛选条件，或切换到“全部真题”。"
              : "尝试清空搜索、调整筛选条件，或关闭“只看收藏”。"}
          </p>
        </div>
      )}

      {filteredQuestions.length > PAGE_SIZE ? (
        <nav
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-2"
          aria-label="题库分页"
        >
          <Button
            variant="ghost"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => goToPage(currentPage - 1)}
          >
            <ChevronLeft aria-hidden="true" /> 上一页
          </Button>
          <div className="hidden items-center gap-1 md:flex" aria-label="页码">
            {paginationItems.map((item, index) =>
              item === "ellipsis" ? (
                <span
                  key={`ellipsis-${index}`}
                  className="grid size-8 place-items-center text-xs text-muted-foreground"
                  aria-hidden="true"
                >
                  …
                </span>
              ) : (
                <Button
                  key={item}
                  variant={item === currentPage ? "primary" : "ghost"}
                  size="sm"
                  className="min-w-8 px-2 tabular-nums"
                  aria-current={item === currentPage ? "page" : undefined}
                  aria-label={`第 ${item} 页`}
                  onClick={() => goToPage(item)}
                >
                  {item}
                </Button>
              )
            )}
          </div>
          <form
            className="order-last flex w-full items-center justify-center gap-2 border-t border-border pt-2 md:order-none md:w-auto md:border-0 md:pt-0"
            onSubmit={submitPageJump}
          >
            <label
              htmlFor="question-page-jump"
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              跳至
              <Input
                id="question-page-jump"
                type="number"
                inputMode="numeric"
                min={1}
                max={totalPages}
                step={1}
                value={pageDraft ?? String(currentPage)}
                onChange={event => setPageDraft(event.target.value)}
                onFocus={event => event.currentTarget.select()}
                className="h-8 w-16 px-2 text-center text-xs tabular-nums"
                aria-label="跳转页码"
              />
              / {totalPages} 页
            </label>
            <Button type="submit" size="sm" variant="secondary">
              跳转
            </Button>
          </form>
          <Button
            variant="ghost"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => goToPage(currentPage + 1)}
          >
            下一页 <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      ) : null}

      {analysisDialogMounted ? (
        <QuestionAnalysisDialog
          question={activeQuestion}
          isFavorite={Boolean(
            activeQuestion && records.get(activeQuestion.id)?.favorite
          )}
          open={Boolean(activeQuestion)}
          onClose={() => setActiveQuestion(undefined)}
          onToggleFavorite={() => {
            if (activeQuestion) toggleFavorite(activeQuestion.id);
          }}
        />
      ) : null}
      <ScrollJumpControls className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-20 lg:bottom-6 lg:right-6" />
    </div>
  );
}

function applyUrlOverrides(
  storedState: QuestionBankViewState,
  params: {
    track: string | null;
    favorites: string | null;
    page: string | null;
  }
): QuestionBankViewState {
  const filters = { ...storedState.filters };
  let page = storedState.page;

  if (params.track !== null) {
    filters.trackId = isTrackId(params.track) ? params.track : "all";
    filters.topicId = "all";
    page = 1;
  }
  if (params.favorites !== null) {
    filters.favoritesOnly = params.favorites === "1";
    page = 1;
  }
  if (params.page !== null) {
    const parsedPage = Number(params.page);
    if (Number.isInteger(parsedPage) && parsedPage > 0) page = parsedPage;
  }

  return { filters, page };
}

function getPaginationItems(
  currentPage: number,
  totalPages: number
): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  if (currentPage <= 4) return [1, 2, 3, 4, 5, "ellipsis", totalPages];
  if (currentPage >= totalPages - 3) {
    return [
      1,
      "ellipsis",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }
  return [
    1,
    "ellipsis",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis",
    totalPages,
  ];
}

function QuestionBankSkeleton() {
  return (
    <div className="space-y-4" aria-label="正在加载题库" aria-busy="true">
      <div className="h-28 animate-pulse rounded-lg border border-border bg-surface" />
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="space-y-3 border-b border-border p-5 last:border-0"
          >
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-5 w-4/5 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
