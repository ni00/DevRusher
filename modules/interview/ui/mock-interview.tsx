"use client";

import Link from "next/link";
import {
  LoaderCircle,
  RotateCcw,
  Send,
  Settings,
  Square,
  Upload,
} from "lucide-react";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  streamCompatibleChat,
  type ChatMessage,
} from "@/modules/ai/infrastructure/openai-compatible-browser-client";
import { isAiEndpointReady } from "@/modules/ai/domain/settings";
import { useAiSettings } from "@/modules/ai/ui/use-ai-settings";
import {
  getTrack,
  trackDefinitions,
  type TrackId,
} from "@/modules/catalog/domain/question";
import { parseResume } from "../infrastructure/resume-parser";
import { saveInterviewSession } from "../infrastructure/session-repository";

type Phase = "setup" | "interview" | "complete";
type GenerationKind = "question" | "assessment";

interface PendingGeneration {
  kind: GenerationKind;
  messages: ChatMessage[];
}

interface InterviewSetup {
  trackId: TrackId;
  role: string;
  rounds: 5 | 10;
}

const defaultSetup: InterviewSetup = {
  trackId: "frontend",
  role: "",
  rounds: 5,
};

export function MockInterview() {
  const { settings, isReady } = useAiSettings();
  const [phase, setPhase] = useState<Phase>("setup");
  const [setup, setSetup] = useState(defaultSetup);
  const [resumeText, setResumeText] = useState("");
  const [resumeConfirmed, setResumeConfirmed] = useState(false);
  const [resumeInfo, setResumeInfo] = useState("");
  const [isParsingResume, setIsParsingResume] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [answer, setAnswer] = useState("");
  const [round, setRound] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [pendingGeneration, setPendingGeneration] = useState<
    PendingGeneration | undefined
  >();
  const abortController = useRef<AbortController | undefined>(undefined);

  const handleResume = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsParsingResume(true);
    setError("");
    setResumeConfirmed(false);
    try {
      const parsed = await parseResume(file);
      setResumeText(parsed.text);
      setResumeInfo(
        [
          file.name,
          parsed.pageCount ? `${parsed.pageCount} 页` : undefined,
          parsed.truncated ? "已截取前 5 万字" : undefined,
        ]
          .filter(Boolean)
          .join(" · ")
      );
    } catch (parseError) {
      setError(
        parseError instanceof Error ? parseError.message : "简历解析失败"
      );
    } finally {
      setIsParsingResume(false);
    }
  };

  const generate = async (nextMessages: ChatMessage[]): Promise<string> => {
    const controller = new AbortController();
    abortController.current = controller;
    setIsGenerating(true);
    setError("");
    setMessages([...nextMessages, { role: "assistant", content: "" }]);

    try {
      const result = await streamCompatibleChat({
        settings,
        messages: nextMessages,
        signal: controller.signal,
        onText: text =>
          setMessages([...nextMessages, { role: "assistant", content: text }]),
      });
      if (!result.trim()) throw new Error("模型返回了空内容");
      return result;
    } catch (generationError) {
      if (controller.signal.aborted) {
        setError("已停止生成，你可以从当前上下文重试。");
        setMessages(nextMessages);
        return "";
      }
      const message =
        generationError instanceof Error
          ? generationError.message
          : "模型生成失败";
      setError(message);
      setMessages(nextMessages);
      return "";
    } finally {
      setIsGenerating(false);
      abortController.current = undefined;
    }
  };

  const runGeneration = async (pending: PendingGeneration) => {
    setPendingGeneration(pending);
    const result = await generate(pending.messages);
    if (!result) return;

    setPendingGeneration(undefined);
    if (pending.kind !== "assessment") return;

    const completedMessages: ChatMessage[] = [
      ...pending.messages,
      { role: "assistant", content: result },
    ];
    setMessages(completedMessages);
    setPhase("complete");
    try {
      await saveInterviewSession({
        id: crypto.randomUUID(),
        trackId: setup.trackId,
        role: setup.role,
        startedAt: startedAt || new Date().toISOString(),
        completedAt: new Date().toISOString(),
        messages: completedMessages.filter(
          message => message.role !== "system"
        ),
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? `总结已生成，但本地记录保存失败：${saveError.message}`
          : "总结已生成，但本地记录保存失败"
      );
    }
  };

  const startInterview = async (event: FormEvent) => {
    event.preventDefault();
    if (!isAiEndpointReady(settings)) {
      setError("请先在设置中配置模型 API Key");
      return;
    }
    if (resumeText && !resumeConfirmed) {
      setError("请确认简历提取文本后再开始");
      return;
    }

    const startTime = new Date().toISOString();
    setStartedAt(startTime);
    setPhase("interview");
    setRound(0);

    const context = [
      settings.systemPrompt,
      `目标方向：${getTrack(setup.trackId).label}`,
      setup.role ? `目标岗位：${setup.role}` : "",
      resumeText
        ? `以下是候选人确认发送的简历文本，只能据此提问，不得补充不存在的经历：\n${resumeText}`
        : "候选人没有提供简历，请从目标方向的通用能力开始。",
    ]
      .filter(Boolean)
      .join("\n\n");

    const initialMessages: ChatMessage[] = [
      { role: "system", content: context },
      {
        role: "user",
        content: `开始一场 ${setup.rounds} 轮的文字模拟面试。先简短说明规则，然后只提出第一道题。`,
      },
    ];
    await runGeneration({ kind: "question", messages: initialMessages });
  };

  const submitAnswer = async (event: FormEvent) => {
    event.preventDefault();
    const content = answer.trim();
    if (!content || isGenerating) return;

    const withoutPlaceholder = messages.filter(
      message => message.role !== "assistant" || message.content
    );
    const answeredMessages: ChatMessage[] = [
      ...withoutPlaceholder,
      { role: "user", content },
    ];
    const nextRound = round + 1;
    setRound(nextRound);
    setAnswer("");

    if (nextRound >= setup.rounds) {
      const assessmentRequest: ChatMessage[] = [
        ...answeredMessages,
        {
          role: "system",
          content:
            "面试轮次已结束。不要再提新问题；请按优势、事实错误或缺口、表达建议、下一步复习清单给出简洁总结。",
        },
      ];
      await runGeneration({
        kind: "assessment",
        messages: assessmentRequest,
      });
      return;
    }

    await runGeneration({
      kind: "question",
      messages: [
        ...answeredMessages,
        {
          role: "system",
          content: `这是第 ${nextRound} 轮回答。先给一句具体反馈，再根据回答追问或进入下一题；一次只问一个问题。`,
        },
      ],
    });
  };

  if (!isReady) {
    return (
      <div className="grid min-h-64 place-items-center rounded-lg border border-border bg-surface">
        <LoaderCircle
          className="size-5 animate-spin text-primary"
          aria-label="正在读取模型设置"
        />
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <form
        onSubmit={startInterview}
        className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <section className="rounded-xl border border-border bg-surface p-5 sm:p-7">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="grid gap-2">
              <Label htmlFor="interview-track">面试方向</Label>
              <select
                id="interview-track"
                value={setup.trackId}
                onChange={event =>
                  setSetup(current => ({
                    ...current,
                    trackId: event.target.value as TrackId,
                  }))
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"
              >
                {trackDefinitions.map(track => (
                  <option key={track.id} value={track.id}>
                    {track.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <Label htmlFor="target-role">目标岗位（可选）</Label>
              <Input
                id="target-role"
                value={setup.role}
                placeholder="例如：3–5 年后端开发工程师"
                onChange={event =>
                  setSetup(current => ({
                    ...current,
                    role: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <fieldset className="mt-5">
            <legend className="text-sm font-medium">面试轮次</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {([5, 10] as const).map(value => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={setup.rounds === value}
                  onClick={() =>
                    setSetup(current => ({ ...current, rounds: value }))
                  }
                  className={`rounded-md border px-4 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    setup.rounds === value
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  <span className="font-semibold">{value} 轮</span>
                  <span className="ml-2 text-xs opacity-70">
                    {value === 5 ? "快速检验" : "完整模拟"}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-6 border-t border-border pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Label htmlFor="resume">简历上下文（可选）</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  支持 PDF、MD、TXT；文件只在浏览器本地解析。
                </p>
              </div>
              <label
                className={buttonStyles({ variant: "secondary", size: "sm" })}
              >
                {isParsingResume ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : (
                  <Upload aria-hidden="true" />
                )}
                选择文件
                <input
                  id="resume"
                  type="file"
                  accept="application/pdf,.pdf,.md,.markdown,.txt,text/markdown,text/plain"
                  className="sr-only"
                  onChange={handleResume}
                />
              </label>
            </div>
            {resumeText ? (
              <div className="mt-4">
                <p className="mb-2 text-xs text-muted-foreground">
                  {resumeInfo}
                </p>
                <Textarea
                  value={resumeText}
                  onChange={event => {
                    setResumeText(event.target.value);
                    setResumeConfirmed(false);
                  }}
                  className="min-h-56 text-xs leading-5"
                  aria-label="本地提取的简历文本"
                />
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-5 text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={resumeConfirmed}
                    onChange={event => setResumeConfirmed(event.target.checked)}
                    className="mt-0.5 size-4 accent-[hsl(var(--primary))]"
                  />
                  我已检查并同意将上方文本发送给我配置的模型服务商。
                </label>
              </div>
            ) : null}
          </div>

          {error ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button
            className="mt-6 w-full sm:w-auto"
            type="submit"
            disabled={isParsingResume}
          >
            开始文字模拟面试 <Send aria-hidden="true" />
          </Button>
        </section>

        <aside className="space-y-4">
          {!isAiEndpointReady(settings) ? (
            <div className="rounded-xl border border-primary/30 bg-primary-soft p-5 text-foreground">
              <h2 className="text-sm font-semibold">需要先配置模型</h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                DevRusher 不提供共享密钥，也不会代理你的模型请求。
              </p>
              <Link
                href="/settings"
                className={buttonStyles({
                  variant: "secondary",
                  size: "sm",
                  className: "mt-4",
                })}
              >
                <Settings aria-hidden="true" /> 打开设置
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-sm font-semibold">当前模型</h2>
              <p className="mt-2 break-all text-xs text-muted-foreground">
                {settings.model}
              </p>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {settings.baseUrl}
              </p>
            </div>
          )}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold">隐私检查点</h2>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
              <li>文件不会上传到 DevRusher。</li>
              <li>只有你确认的提取文本会进入模型上下文。</li>
              <li>面试记录保存在当前浏览器，不含原始简历文件。</li>
            </ul>
          </div>
        </aside>
      </form>
    );
  }

  const visibleMessages = messages.filter(message => message.role !== "system");
  const awaitingRecovery = Boolean(error && pendingGeneration);

  return (
    <div className="mx-auto max-w-4xl">
      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
          <div>
            <p className="text-sm font-semibold">
              {getTrack(setup.trackId).label}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {phase === "complete"
                ? "面试总结"
                : `已回答 ${round} / ${setup.rounds} 轮`}
            </p>
          </div>
          {isGenerating ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => abortController.current?.abort()}
            >
              <Square aria-hidden="true" /> 停止生成
            </Button>
          ) : null}
        </header>

        <div
          className="max-h-[58dvh] space-y-4 overflow-y-auto p-4 sm:p-6"
          aria-live="polite"
        >
          {visibleMessages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[92%] rounded-lg px-4 py-3 text-sm leading-6 sm:max-w-[82%] ${
                message.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "border border-border bg-background"
              }`}
            >
              {message.content ? (
                <div className="whitespace-pre-wrap">{message.content}</div>
              ) : (
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                  面试官正在思考
                </span>
              )}
            </div>
          ))}
        </div>

        {phase === "interview" ? (
          <form
            onSubmit={submitAnswer}
            className="border-t border-border p-4 sm:p-6"
          >
            <Label htmlFor="candidate-answer">你的回答</Label>
            <Textarea
              id="candidate-answer"
              value={answer}
              disabled={isGenerating || awaitingRecovery}
              onChange={event => setAnswer(event.target.value)}
              placeholder="像真实面试一样组织回答；可用 Ctrl / Cmd + Enter 提交。"
              className="mt-2 min-h-32"
              onKeyDown={event => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            {error ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
                {pendingGeneration ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isGenerating}
                    onClick={() => void runGeneration(pendingGeneration)}
                  >
                    <RotateCcw aria-hidden="true" /> 重试生成
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div className="mt-3 flex justify-end">
              <Button
                type="submit"
                disabled={!answer.trim() || isGenerating || awaitingRecovery}
              >
                提交回答 <Send aria-hidden="true" />
              </Button>
            </div>
          </form>
        ) : (
          <div className="border-t border-border p-4 sm:p-6">
            {error ? (
              <p className="mb-3 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-3">
              <Link
                href="/profile"
                className={buttonStyles({ variant: "secondary" })}
              >
                查看能力画像
              </Link>
              <Button
                onClick={() => {
                  setPhase("setup");
                  setMessages([]);
                  setRound(0);
                  setAnswer("");
                  setError("");
                  setPendingGeneration(undefined);
                }}
              >
                再来一场
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
