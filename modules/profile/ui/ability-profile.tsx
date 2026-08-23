"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  CheckCircle2,
  History,
  Repeat2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buttonStyles } from "@/components/ui/button";
import {
  getTrackIdFromQuestionId,
  getTrack,
  trackDefinitions,
  type TrackId,
} from "@/modules/catalog/domain/question";
import { loadContentManifest } from "@/modules/catalog/infrastructure/content-pack-source";
import { useQuestionProgress } from "@/modules/progress/ui/use-question-progress";
import {
  isReviewDue,
  type QuestionProgress,
} from "@/modules/progress/domain/question-progress";
import {
  listInterviewSessions,
  type InterviewSessionRecord,
} from "@/modules/interview/infrastructure/session-repository";

interface TrackSignal {
  id: TrackId;
  label: string;
  catalogSize: number;
  attempted: number;
  mastered: number;
  score: number;
}

export function AbilityProfile() {
  const [catalogSizes, setCatalogSizes] = useState<Map<TrackId, number>>(
    new Map()
  );
  const [interviewSessions, setInterviewSessions] = useState<
    InterviewSessionRecord[]
  >([]);
  const { records, isReady } = useQuestionProgress();

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      loadContentManifest(controller.signal),
      listInterviewSessions(),
    ])
      .then(([manifest, sessions]) => {
        setCatalogSizes(
          new Map(manifest.tracks.map(track => [track.id, track.count]))
        );
        setInterviewSessions(sessions);
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          console.error("Failed to load catalog for profile", error);
        }
      });
    return () => controller.abort();
  }, []);

  const signals = useMemo<TrackSignal[]>(() => {
    const recordsByTrack = new Map<TrackId, QuestionProgress[]>();
    for (const record of records.values()) {
      const recordTrackId = getTrackIdFromQuestionId(record.questionId);
      if (!recordTrackId) continue;
      const related = recordsByTrack.get(recordTrackId) ?? [];
      related.push(record);
      recordsByTrack.set(recordTrackId, related);
    }

    return trackDefinitions.map(track => {
      const related = recordsByTrack.get(track.id) ?? [];
      const attempted = related.filter(item => item.attempts > 0).length;
      const mastered = related.filter(
        item => item.status === "mastered"
      ).length;

      return {
        id: track.id,
        label: track.label,
        catalogSize: catalogSizes.get(track.id) ?? 0,
        attempted,
        mastered,
        score: attempted ? Math.round((mastered / attempted) * 100) : 0,
      };
    });
  }, [catalogSizes, records]);

  const values = Array.from(records.values());
  const attempted = values.filter(item => item.attempts > 0).length;
  const mastered = values.filter(item => item.status === "mastered").length;
  const favorites = values.filter(item => item.favorite).length;
  const due = values.filter(item => isReviewDue(item)).length;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={History}
          label="已练习题目"
          value={attempted}
          detail={`本地累计 ${values.length} 条状态记录`}
        />
        <Metric
          icon={CheckCircle2}
          label="已掌握"
          value={mastered}
          detail={
            attempted
              ? `占已练习 ${Math.round((mastered / attempted) * 100)}%`
              : "完成练习后生成"
          }
        />
        <Metric
          icon={Bookmark}
          label="收藏"
          value={favorites}
          detail="用于定向复习"
        />
        <Metric
          icon={Repeat2}
          label="到期复习"
          value={due}
          detail={due ? "优先处理会延长复习间隔" : "当前复习节奏已清空"}
        />
      </section>

      {due ? (
        <Link
          href="/practice?review=1"
          className={buttonStyles({ variant: "secondary" })}
        >
          开始复习 {due} 道到期题 <ArrowRight aria-hidden="true" />
        </Link>
      ) : null}

      <section className="rounded-xl border border-border bg-surface">
        <div className="border-b border-border p-5 sm:p-6">
          <h2 className="text-base font-semibold">方向能力信号</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            只根据你的显式学习标记计算；样本少于 3 题时不输出强结论。
          </p>
        </div>
        <div className="divide-y divide-border">
          {signals.map(signal => (
            <div
              key={signal.id}
              className="grid gap-3 p-4 sm:grid-cols-[12rem_1fr_auto] sm:items-center sm:px-6"
            >
              <div>
                <p className="text-sm font-medium">{signal.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  已练 {signal.attempted} / 当前题集 {signal.catalogSize}
                </p>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{
                    width: `${signal.attempted >= 3 ? signal.score : 0}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                  {signal.attempted >= 3 ? `${signal.score}% 掌握` : "样本不足"}
                </span>
                <Link
                  href={`/practice?track=${signal.id}`}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  去练习
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5 sm:p-6">
          <div>
            <h2 className="text-base font-semibold">模拟面试记录</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              仅保存在当前浏览器；系统提示词与原始简历不会显示在这里。
            </p>
          </div>
          <Link
            href="/interview"
            className={buttonStyles({ variant: "secondary", size: "sm" })}
          >
            新建模拟面试
          </Link>
        </div>
        {interviewSessions.length ? (
          <div className="divide-y divide-border">
            {interviewSessions.slice(0, 5).map(session => (
              <details key={session.id} className="group p-4 sm:px-6">
                <summary className="cursor-pointer list-none text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {getTrack(session.trackId).label}
                      {session.role ? ` · ${session.role}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat("zh-CN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(session.completedAt))}
                    </span>
                  </span>
                </summary>
                <div className="mt-4 space-y-3 border-l-2 border-border pl-4">
                  {session.messages
                    .filter(message => message.role !== "system")
                    .map((message, index) => (
                      <div key={`${message.role}-${index}`}>
                        <p className="text-xs font-semibold text-muted-foreground">
                          {message.role === "user" ? "候选人" : "面试官"}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                          {message.content}
                        </p>
                      </div>
                    ))}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className="p-5 text-sm text-muted-foreground sm:p-6">
            还没有完成的模拟面试。
          </p>
        )}
      </section>

      {!attempted && isReady ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-center">
          <h2 className="text-sm font-semibold">还没有足够的学习记录</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            完成一轮 10 题热身，画像就会开始呈现真实信号。
          </p>
          <Link
            href="/practice"
            className={buttonStyles({ className: "mt-4" })}
          >
            开始热身 <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof History;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
