"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  getDifficultyLabel,
  getQuestionTypeLabel,
  getTrack,
  isCoreQuestion,
  questionTypes,
  trackDefinitions,
  type Question,
  type QuestionType,
  type TrackId,
} from "@/modules/catalog/domain/question";
import { loadQuestionCatalog } from "@/modules/catalog/infrastructure/content-pack-source";
import {
  isReviewDue,
  type ReviewRating,
} from "@/modules/progress/domain/question-progress";
import { useQuestionProgress } from "@/modules/progress/ui/use-question-progress";
import { QuestionAnalysisDialog } from "@/modules/question-analysis/ui/question-analysis";

type Phase = "loading" | "setup" | "session" | "complete" | "error";
type SessionSize = 10 | 20 | 30 | 60;

function shuffled<T>(items: T[]): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
    const target = random % (index + 1);
    [result[index], result[target]] = [result[target] as T, result[index] as T];
  }

  return result;
}

export function PracticeWorkspace({
  initialTrack = "all",
  initialQuestionId,
  initialReviewOnly = false,
  initialSize = 10,
}: {
  initialTrack?: TrackId | "all";
  initialQuestionId?: string;
  initialReviewOnly?: boolean;
  initialSize?: SessionSize;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [catalog, setCatalog] = useState<Question[]>([]);
  const [session, setSession] = useState<Question[]>([]);
  const [trackId, setTrackId] = useState<TrackId | "all">(initialTrack);
  const [questionType, setQuestionType] = useState<QuestionType | "all">("all");
  const [scope, setScope] = useState<"core" | "all">("core");
  const [reviewOnly, setReviewOnly] = useState(initialReviewOnly);
  const [size, setSize] = useState<SessionSize>(initialSize);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const { records, isReady, recordReview, toggleFavorite } =
    useQuestionProgress();

  const matchesSelection = (question: Question) => {
    if (scope === "core" && !isCoreQuestion(question)) return false;
    if (trackId !== "all" && question.trackId !== trackId) return false;
    return questionType === "all" || question.questionType === questionType;
  };
  const dueCount = catalog.filter(
    question =>
      matchesSelection(question) && isReviewDue(records.get(question.id))
  ).length;
  const eligibleCandidates = catalog.filter(
    question =>
      matchesSelection(question) &&
      (!reviewOnly || isReviewDue(records.get(question.id)))
  );

  useEffect(() => {
    const controller = new AbortController();

    const requestedTracks =
      initialQuestionId && initialTrack !== "all" ? [initialTrack] : undefined;

    loadQuestionCatalog(controller.signal, requestedTracks)
      .then(items => {
        setCatalog(items);
        const selected = initialQuestionId
          ? items.find(question => question.id === initialQuestionId)
          : undefined;

        if (selected) {
          setSession([selected]);
          setPhase("session");
        } else {
          setPhase("setup");
        }
      })
      .catch(loadError => {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error ? loadError.message : "题库加载失败"
        );
        setPhase("error");
      });

    return () => controller.abort();
  }, [initialQuestionId, initialTrack]);

  const startSession = () => {
    if (!eligibleCandidates.length) return;
    setSession(shuffled(eligibleCandidates).slice(0, size));
    setIndex(0);
    setAnswer("");
    setAnalysisOpen(false);
    setPhase("session");
  };

  const finishQuestion = (rating: ReviewRating) => {
    const current = session[index];
    if (!current) return;
    recordReview(current.id, rating);

    if (index >= session.length - 1) {
      setPhase("complete");
      return;
    }

    setIndex(value => value + 1);
    setAnswer("");
    setAnalysisOpen(false);
  };

  if (phase === "loading") {
    return (
      <div className="grid min-h-72 place-items-center rounded-lg border border-border bg-surface">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          正在准备题库
        </p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="rounded-lg border border-destructive/30 bg-surface p-6">
        <h2 className="font-semibold text-destructive">无法开始练习</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="rounded-xl border border-border bg-surface p-5 sm:p-7">
          <h2 className="text-xl font-semibold tracking-tight">
            创建一组看题练习
          </h2>

          <div className="mt-6 grid gap-5">
            <fieldset>
              <legend className="text-sm font-medium">题库范围</legend>
              <div className="mt-2 grid grid-cols-2 rounded-md border border-input bg-background p-1">
                {(
                  [
                    ["core", "精选题集"],
                    ["all", "全部真题"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={scope === value}
                    onClick={() => setScope(value)}
                    className={`h-9 rounded text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      scope === value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="grid gap-2 text-sm font-medium">
              练习方向
              <select
                value={trackId}
                onChange={event =>
                  setTrackId(event.target.value as TrackId | "all")
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"
              >
                <option value="all">混合方向</option>
                {trackDefinitions.map(track => (
                  <option key={track.id} value={track.id}>
                    {track.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium">
              练习题型
              <select
                value={questionType}
                onChange={event =>
                  setQuestionType(event.target.value as QuestionType | "all")
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"
              >
                <option value="all">混合题型</option>
                {questionTypes.map(value => (
                  <option key={value} value={value}>
                    {getQuestionTypeLabel(value)}
                  </option>
                ))}
              </select>
            </label>

            <fieldset>
              <legend className="text-sm font-medium">练习长度</legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([10, 20, 30, 60] as const).map(value => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={size === value}
                    onClick={() => setSize(value)}
                    className={`rounded-md border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      size === value
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    <span className="block text-sm font-semibold">
                      {value} 题
                    </span>
                    <span className="mt-1 block text-xs opacity-75">
                      {value === 10
                        ? "短练"
                        : value === 20
                          ? "日常"
                          : value === 30
                            ? "标准"
                            : "长练"}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm">
              <input
                type="checkbox"
                checked={reviewOnly}
                disabled={!isReady}
                onChange={event => setReviewOnly(event.target.checked)}
                className="mt-0.5 size-4 accent-[hsl(var(--primary))]"
              />
              <span>
                <span className="block font-medium">只练到期复习</span>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {isReady
                    ? `当前筛选下有 ${dueCount} 道到期题`
                    : "正在读取本地复习计划"}
                </span>
              </span>
            </label>
          </div>

          <Button
            className="mt-7 w-full sm:w-auto"
            onClick={startSession}
            disabled={!eligibleCandidates.length}
          >
            开始看题 <ArrowRight aria-hidden="true" />
          </Button>
          {!eligibleCandidates.length && isReady ? (
            <p className="mt-3 text-xs text-muted-foreground">
              当前条件下没有可练题目；可以关闭到期复习或调整方向与题型。
            </p>
          ) : null}
        </section>

        <aside className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">掌握度记录</h2>
          <ul className="mt-3 space-y-3 text-sm leading-5 text-muted-foreground">
            <li>“不熟”会在明天优先安排复习。</li>
            <li>学习中默认 3 天后复习，已掌握默认 7 天后复习。</li>
            <li>草稿仅存在本轮内，切题后不会长期保存。</li>
          </ul>
        </aside>
      </div>
    );
  }

  if (phase === "complete") {
    return (
      <section className="mx-auto max-w-2xl rounded-xl border border-border bg-surface p-6 text-center sm:p-10">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary-soft text-primary">
          <Check className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-xl font-semibold">本轮练习已完成</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          已处理 {session.length} 道题。能力画像会根据真实标记更新。
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setPhase("setup");
              setSession([]);
            }}
          >
            <RotateCcw aria-hidden="true" /> 再练一组
          </Button>
          <Link href="/profile" className={buttonStyles()}>
            查看能力画像 <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </section>
    );
  }

  const question = session[index];
  if (!question) return null;
  const progress = records.get(question.id);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-medium text-primary">
              {getTrack(question.trackId).label} · {question.topicLabel}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {getQuestionTypeLabel(question.questionType)} ·{" "}
              {getDifficultyLabel(question.difficulty)}
            </p>
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {index + 1} / {session.length}
          </span>
        </div>
        <div className="p-5 sm:p-7">
          <h2 className="text-lg font-semibold leading-8 sm:text-xl">
            {question.prompt}
          </h2>
          <details className="mt-6 rounded-lg border border-border bg-background">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              写下自己的回答（可选）
            </summary>
            <div className="border-t border-border p-4">
              <Textarea
                value={answer}
                onChange={event => setAnswer(event.target.value)}
                placeholder="记录回答结构、关键词或工程权衡；解析时会一并评价。"
                className="min-h-36"
                aria-label="自己的回答"
              />
            </div>
          </details>

          <div className="mt-6 border-t border-border pt-5">
            <Button onClick={() => setAnalysisOpen(true)}>解析题目</Button>
            <p className="mt-2 text-xs text-muted-foreground">
              点击后直接打开解析；你的可选回答会一并交给模型评价。
            </p>
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <p className="mb-3 text-sm font-medium">记录掌握度并继续</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                variant="secondary"
                onClick={() => finishQuestion("again")}
              >
                不熟，明天再看
              </Button>
              <Button
                variant="secondary"
                onClick={() => finishQuestion("learning")}
              >
                标记学习中
              </Button>
              <Button
                variant="secondary"
                onClick={() => finishQuestion("mastered")}
              >
                标记已掌握 <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      <aside className="space-y-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-muted-foreground">当前状态</p>
          <p className="mt-1 text-sm font-semibold">
            {progress?.status === "mastered"
              ? "已掌握"
              : progress?.status === "learning"
                ? "学习中"
                : "未开始"}
          </p>
          <button
            type="button"
            className="mt-3 text-sm font-medium text-primary hover:underline"
            onClick={() => toggleFavorite(question.id)}
          >
            {progress?.favorite ? "取消收藏" : "收藏这道题"}
          </button>
        </div>
        <Link
          href="/questions"
          className={buttonStyles({
            variant: "ghost",
            className: "w-full justify-start",
          })}
        >
          <ArrowLeft aria-hidden="true" /> 返回题库
        </Link>
      </aside>
      <QuestionAnalysisDialog
        key={question.id}
        question={question}
        answer={answer}
        open={analysisOpen}
        onClose={() => setAnalysisOpen(false)}
      />
    </div>
  );
}
