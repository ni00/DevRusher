import {
  getQuestionTypeLabel,
  getDifficultyLabel,
  isCoreQuestion,
  type Difficulty,
  type Question,
  type QuestionType,
  type TrackId,
} from "../domain/question";

export interface QuestionFilters {
  scope: "core" | "all";
  search: string;
  trackId: TrackId | "all";
  topicId: string;
  difficulty: Difficulty | "all";
  questionType: QuestionType | "all";
  favoritesOnly: boolean;
}

export function filterQuestions(
  questions: Question[],
  filters: QuestionFilters,
  favoriteIds: ReadonlySet<string>
): Question[] {
  const search = filters.search.trim().toLocaleLowerCase("zh-CN");

  return questions.filter(question => {
    if (filters.scope === "core" && !isCoreQuestion(question)) return false;
    if (filters.trackId !== "all" && question.trackId !== filters.trackId) {
      return false;
    }
    if (filters.topicId !== "all" && question.topicId !== filters.topicId) {
      return false;
    }
    if (
      filters.difficulty !== "all" &&
      question.difficulty !== filters.difficulty
    ) {
      return false;
    }
    if (
      filters.questionType !== "all" &&
      question.questionType !== filters.questionType
    ) {
      return false;
    }
    if (filters.favoritesOnly && !favoriteIds.has(question.id)) return false;
    if (!search) return true;

    return [
      question.prompt,
      question.topicLabel,
      getDifficultyLabel(question.difficulty),
      getQuestionTypeLabel(question.questionType),
      ...question.tags,
      ...question.occurrences.map(occurrence => occurrence.originalPrompt),
    ].some(value => value?.toLocaleLowerCase("zh-CN").includes(search));
  });
}

export function getTopicOptions(
  questions: Question[],
  trackId: TrackId | "all"
): Array<{ id: string; label: string }> {
  const topics = new Map<string, string>();

  for (const question of questions) {
    if (trackId === "all" || question.trackId === trackId) {
      topics.set(question.topicId, question.topicLabel);
    }
  }

  return Array.from(topics, ([id, label]) => ({ id, label })).sort((a, b) =>
    a.label.localeCompare(b.label, "zh-CN")
  );
}
