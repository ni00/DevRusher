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
      occurrenceCount: z.number().int().nonnegative(),
      topicCount: z.number().int().nonnegative(),
    })
  ),
});

export type ContentManifest = z.infer<typeof manifestSchema>;

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`内容加载失败（${response.status}）`);
  return response.json() as Promise<unknown>;
}

export async function loadContentManifest(
  signal?: AbortSignal
): Promise<ContentManifest> {
  const parsed = manifestSchema.safeParse(
    await fetchJson("/content/manifest.json", signal)
  );
  if (!parsed.success) throw new Error("内容清单不符合预期格式");
  return parsed.data;
}

export async function loadQuestionCatalog(
  signal?: AbortSignal,
  requestedTracks?: TrackId[]
): Promise<Question[]> {
  const manifest = await loadContentManifest(signal);
  const selected = requestedTracks?.length
    ? manifest.tracks.filter(track => requestedTracks.includes(track.id))
    : manifest.tracks;
  const packs = await Promise.all(
    selected.map(async track => {
      const parsed = z
        .array(questionSchema)
        .safeParse(await fetchJson(track.file, signal));
      if (!parsed.success || parsed.data.length !== track.count) {
        throw new Error(`${track.id} 题包不符合内容清单`);
      }
      return parsed.data;
    })
  );

  return packs.flat();
}
