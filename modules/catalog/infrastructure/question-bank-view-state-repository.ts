import { z } from "zod";
import type { QuestionFilters } from "../application/filter-questions";
import { questionTypes, trackIds } from "../domain/question";
import {
  getRecord,
  localStores,
  putRecord,
} from "@/modules/local-data/infrastructure/database";

const VIEW_STATE_KEY = "question-bank-view-state";

export interface QuestionBankViewState {
  filters: QuestionFilters;
  page: number;
}

interface StoredQuestionBankViewState {
  key: typeof VIEW_STATE_KEY;
  value: QuestionBankViewState;
}

const filtersSchema = z.object({
  scope: z.enum(["core", "all"]),
  search: z.string().max(500),
  trackId: z.union([z.literal("all"), z.enum(trackIds)]),
  topicId: z.string().min(1).max(200),
  difficulty: z.union([
    z.literal("all"),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  questionType: z.union([z.literal("all"), z.enum(questionTypes)]),
  favoritesOnly: z.boolean(),
});

const viewStateSchema = z.object({
  filters: filtersSchema,
  page: z.number().int().positive().max(100_000),
});

export const defaultQuestionBankViewState: QuestionBankViewState = {
  filters: {
    scope: "core",
    search: "",
    trackId: "all",
    topicId: "all",
    difficulty: "all",
    questionType: "all",
    favoritesOnly: false,
  },
  page: 1,
};

export async function getQuestionBankViewState(): Promise<QuestionBankViewState> {
  const stored = await getRecord<StoredQuestionBankViewState>(
    localStores.settings,
    VIEW_STATE_KEY
  );
  const parsed = viewStateSchema.safeParse(stored?.value);
  return parsed.success ? parsed.data : defaultQuestionBankViewState;
}

export function saveQuestionBankViewState(
  value: QuestionBankViewState
): Promise<void> {
  return putRecord<StoredQuestionBankViewState>(localStores.settings, {
    key: VIEW_STATE_KEY,
    value: viewStateSchema.parse(value),
  });
}
