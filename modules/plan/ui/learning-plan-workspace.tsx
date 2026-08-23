"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Flag,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import {
  getTrack,
  isCoreQuestion,
  trackDefinitions,
  type Question,
  type TrackId,
} from "@/modules/catalog/domain/question";
import { loadQuestionCatalog } from "@/modules/catalog/infrastructure/content-pack-source";
import { listReviewEvents } from "@/modules/progress/infrastructure/question-progress-repository";
import type { ReviewEvent } from "@/modules/progress/domain/review-event";
import {
  createLearningPlan,
  getPlanDays,
  planDurations,
  toLocalDateKey,
  type PlanDuration,
} from "../domain/learning-plan";
import { useLearningPlan } from "./use-learning-plan";

const dailyTargets = [10, 20, 30] as const;

function formatDate(dateKey: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${dateKey}T12:00:00`));
}

export function LearningPlanWorkspace() {
  const { plan, isReady, persist, remove } = useLearningPlan();
  const [durationDays, setDurationDays] = useState<PlanDuration>(14);
  const [dailyTarget, setDailyTarget] = useState<number>(20);
  const [trackIds, setTrackIds] = useState<TrackId[]>(["fundamentals"]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [reviewEvents, setReviewEvents] = useState<ReviewEvent[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!plan) return;

    const controller = new AbortController();
    Promise.all([
      loadQuestionCatalog(controller.signal, plan.trackIds, "core"),
      listReviewEvents(),
    ])
      .then(([catalog, events]) => {
        setQuestions(catalog.filter(isCoreQuestion));
        setReviewEvents(events);
      })
      .catch(loadError => {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error ? loadError.message : "计划数据加载失败"
          );
        }
      });
    return () => controller.abort();
  }, [plan]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      await persist(
        createLearningPlan({ durationDays, dailyTarget, trackIds })
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "创建计划失败");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isReady) {
    return (
      <div className="grid min-h-64 place-items-center rounded-xl border border-border bg-surface">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          正在读取本地计划
        </p>
      </div>
    );
  }

  if (!plan) {
    return (
      <form
        onSubmit={create}
        className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <section className="rounded-xl border border-border bg-surface p-5 sm:p-7">
          <h2 className="text-lg font-semibold">创建一次可完成的冲刺</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            计划只规定节奏，不制造签到压力。每天的完成量来自实际作答记录。
          </p>

          <fieldset className="mt-6">
            <legend className="text-sm font-medium">冲刺周期</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {planDurations.map(value => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={durationDays === value}
                  onClick={() => setDurationDays(value)}
                  className={`rounded-md border px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    durationDays === value
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  <span className="block text-sm font-semibold">
                    {value} 天
                  </span>
                  <span className="mt-1 block text-xs opacity-75">
                    {value === 7
                      ? "快速冲刺"
                      : value === 14
                        ? "集中准备"
                        : "系统推进"}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-6">
            <legend className="text-sm font-medium">每日题量</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {dailyTargets.map(value => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={dailyTarget === value}
                  onClick={() => setDailyTarget(value)}
                  className={`rounded-md border px-3 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    dailyTarget === value
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {value} 题
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-6">
            <legend className="text-sm font-medium">学习方向</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {trackDefinitions.map(track => {
                const selected = trackIds.includes(track.id);
                return (
                  <label
                    key={track.id}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background p-3"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={event =>
                        setTrackIds(current =>
                          event.target.checked
                            ? [...current, track.id]
                            : current.filter(value => value !== track.id)
                        )
                      }
                      className="mt-0.5 size-4 accent-[hsl(var(--primary))]"
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        {track.label}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {track.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {error ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            className="mt-6 w-full sm:w-auto"
            disabled={isSaving || !trackIds.length}
          >
            {isSaving ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Flag aria-hidden="true" />
            )}
            开始计划
          </Button>
        </section>

        <aside className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">计划总量</h2>
          <p className="mt-3 text-3xl font-semibold tabular-nums">
            {durationDays * dailyTarget}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {trackIds.length || 0} 个方向 · 每天 {dailyTarget} 题
          </p>
          <ul className="mt-5 space-y-2 text-xs leading-5 text-muted-foreground">
            <li>方向按天轮换，不强行平均每道题。</li>
            <li>到期复习仍会优先进入复习入口。</li>
            <li>计划可以随时重建，本地答题记录不会丢失。</li>
          </ul>
        </aside>
      </form>
    );
  }

  return (
    <ActivePlan
      plan={plan}
      questions={questions}
      reviewEvents={reviewEvents}
      error={error}
      onReset={remove}
    />
  );
}

function ActivePlan({
  plan,
  questions,
  reviewEvents,
  error,
  onReset,
}: {
  plan: NonNullable<ReturnType<typeof useLearningPlan>["plan"]>;
  questions: Question[];
  reviewEvents: ReviewEvent[];
  error: string;
  onReset: () => Promise<void>;
}) {
  const today = toLocalDateKey();
  const days = getPlanDays(plan);
  const questionTrack = useMemo(
    () => new Map(questions.map(question => [question.id, question.trackId])),
    [questions]
  );
  const counts = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const event of reviewEvents) {
      if (!questionTrack.has(event.questionId)) continue;
      const date = toLocalDateKey(new Date(event.reviewedAt));
      if (date < plan.startDate || date > plan.endDate) continue;
      byDate.set(date, (byDate.get(date) ?? 0) + 1);
    }
    return byDate;
  }, [plan.endDate, plan.startDate, questionTrack, reviewEvents]);
  const completed = Array.from(counts.values()).reduce(
    (sum, value) => sum + value,
    0
  );
  const totalTarget = plan.durationDays * plan.dailyTarget;
  const progress = Math.min(100, Math.round((completed / totalTarget) * 100));
  const todayPlan = days.find(day => day.date === today) ?? days.at(-1);
  const todayCompleted = counts.get(today) ?? 0;
  const remainingDays = days.filter(day => day.date >= today).length;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <PlanMetric
          icon={CheckCircle2}
          label="累计完成"
          value={`${completed} / ${totalTarget}`}
        />
        <PlanMetric
          icon={CalendarDays}
          label="今日进度"
          value={`${todayCompleted} / ${plan.dailyTarget}`}
        />
        <PlanMetric
          icon={Flag}
          label="剩余日程"
          value={`${remainingDays} 天`}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="rounded-xl border border-border bg-surface">
          <div className="border-b border-border p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  {plan.durationDays}-day sprint
                </p>
                <h2 className="mt-2 text-lg font-semibold">
                  {plan.trackIds.map(id => getTrack(id).shortLabel).join(" · ")}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {plan.startDate} — {plan.endDate}
                </p>
              </div>
              {todayPlan ? (
                <Link
                  href={`/practice?track=${todayPlan.trackId}&size=${plan.dailyTarget}`}
                  className={buttonStyles()}
                >
                  开始今日 {getTrack(todayPlan.trackId).shortLabel}
                  <ArrowRight aria-hidden="true" />
                </Link>
              ) : null}
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              整体完成 {progress}% · 超出每日目标的真实作答同样计入
            </p>
          </div>

          <ol className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
            {days.map(day => {
              const completedForDay = counts.get(day.date) ?? 0;
              const isToday = day.date === today;
              return (
                <li
                  key={day.date}
                  className={`bg-surface p-4 ${isToday ? "ring-1 ring-inset ring-primary" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-muted-foreground">
                      Day {day.index}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {completedForDay}/{plan.dailyTarget}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold">
                    {getTrack(day.trackId).shortLabel}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(day.date)}
                    {isToday ? " · 今天" : ""}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold">计划规则</h2>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
              <li>完成量以练习中的真实评价为准。</li>
              <li>同一天多轮练习会累计，不要求连续签到。</li>
              <li>间隔复习由每道题的掌握评价独立安排。</li>
            </ul>
          </div>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => void onReset()}
          >
            <RotateCcw aria-hidden="true" /> 重新制定计划
          </Button>
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </aside>
      </section>
    </div>
  );
}

function PlanMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Flag;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
