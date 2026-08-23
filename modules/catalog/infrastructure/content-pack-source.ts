import { z } from "zod";
import {
  questionSourceKinds,
  questionTypes,
  trackIds,
  type Question,
  type TrackId,
} from "../domain/question";

const questionSchema = z.object({
  id: z.string().min(1),
  trackId: z.enum(trackIds),
  topicId: z.string().min(1),
  topicLabel: z.string().min(1),
  prompt: z.string().min(4),
  questionType: z.enum(questionTypes),
  difficulty: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  tags: z.array(z.string()),
  collectionIds: z.array(z.string().min(1)),
  occurrences: z
    .array(
      z.object({
        id: z.string().min(1),
        sourceId: z.string().min(1),
        sourceKind: z.enum(questionSourceKinds),
        sourceTitle: z.string().min(1),
        sourceUrl: z.string().url(),
        originalPrompt: z.string().min(2),
        publishedAt: z.string().optional(),
      })
    )
    .min(1),
  collectedAt: z.string().optional(),
});

const manifestSchema = z.object({
  schemaVersion: z.literal(2),
  contentVersion: z.string().min(1),
  generatedAt: z.string(),
  totalQuestions: z.number().int().nonnegative(),
  coreQuestions: z.number().int().nonnegative(),
  totalOccurrences: z.number().int().nonnegative(),
  collections: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      description: z.string().min(1),
      questionCount: z.number().int().nonnegative(),
    })
  ),
  tracks: z.array(
    z.object({
      id: z.enum(trackIds),
      count: z.number().int().nonnegative(),
      file: z.string().startsWith("/content/packs/"),
      checksum: z.string().length(64),
      coreCount: z.number().int().nonnegative(),
      coreFile: z.string().startsWith("/content/packs/"),
      coreChecksum: z.string().length(64),
      occurrenceCount: z.number().int().nonnegative(),
      topicCount: z.number().int().nonnegative(),
    })
  ),
});

export type ContentManifest = z.infer<typeof manifestSchema>;
export type QuestionCatalogScope = "core" | "all";

const manifestUrl = "/content/manifest.json";
let manifestRequest: Promise<ContentManifest> | undefined;
const packRequests = new Map<string, Promise<Question[]>>();

async function fetchJson(url: string, cache: RequestCache): Promise<unknown> {
  const response = await fetch(url, { cache });
  if (!response.ok) throw new Error(`内容加载失败（${response.status}）`);
  return response.json() as Promise<unknown>;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("操作已取消", "AbortError");
}

function waitForSignal<Value>(
  request: Promise<Value>,
  signal?: AbortSignal
): Promise<Value> {
  if (!signal) return request;
  if (signal.aborted) return Promise.reject(abortReason(signal));

  return new Promise((resolve, reject) => {
    const abort = () => reject(abortReason(signal));
    signal.addEventListener("abort", abort, { once: true });
    request.then(
      value => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      error => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
}

function getManifestRequest(): Promise<ContentManifest> {
  if (!manifestRequest) {
    const request = fetchJson(manifestUrl, "no-cache")
      .then(value => {
        const parsed = manifestSchema.safeParse(value);
        if (!parsed.success) throw new Error("内容清单不符合预期格式");
        return parsed.data;
      })
      .catch(error => {
        if (manifestRequest === request) manifestRequest = undefined;
        throw error;
      });
    manifestRequest = request;
  }

  return manifestRequest;
}

function getPackRequest(
  url: string,
  expectedCount: number,
  trackId: TrackId
): Promise<Question[]> {
  const cached = packRequests.get(url);
  if (cached) return cached;

  const request = fetchJson(url, "force-cache")
    .then(value => {
      const parsed = z.array(questionSchema).safeParse(value);
      if (!parsed.success || parsed.data.length !== expectedCount) {
        throw new Error(`${trackId} 题包不符合内容清单`);
      }
      return parsed.data;
    })
    .catch(error => {
      if (packRequests.get(url) === request) packRequests.delete(url);
      throw error;
    });
  packRequests.set(url, request);
  return request;
}

export async function loadContentManifest(
  signal?: AbortSignal
): Promise<ContentManifest> {
  return waitForSignal(getManifestRequest(), signal);
}

export async function loadQuestionCatalog(
  signal?: AbortSignal,
  requestedTracks?: TrackId[],
  scope: QuestionCatalogScope = "all"
): Promise<Question[]> {
  const manifest = await loadContentManifest(signal);
  const selected = requestedTracks?.length
    ? manifest.tracks.filter(track => requestedTracks.includes(track.id))
    : manifest.tracks;
  const packs = await waitForSignal(
    Promise.all(
      selected.map(track =>
        getPackRequest(
          scope === "core" ? track.coreFile : track.file,
          scope === "core" ? track.coreCount : track.count,
          track.id
        )
      )
    ),
    signal
  );

  return packs.flat();
}
