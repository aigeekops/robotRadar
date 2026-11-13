export interface Question {
  id: string;
  options: readonly string[];
  correctOption: number;
}
export interface QuizResult {
  correct: number;
  total: number;
  answered: number;
  percentage: number;
  results: { id: string; correct: boolean; answered: boolean }[];
}
export function scoreQuiz(
  questions: readonly Question[],
  answers: Record<string, number>,
): QuizResult {
  if (new Set(questions.map((q) => q.id)).size !== questions.length)
    throw new Error("Duplicate question IDs");
  const results = questions.map((question) => {
    if (
      !question.options.length ||
      !Number.isInteger(question.correctOption) ||
      question.correctOption < 0 ||
      question.correctOption >= question.options.length
    )
      throw new Error(`Invalid question ${question.id}`);
    const answer = Object.prototype.hasOwnProperty.call(answers, question.id)
      ? answers[question.id]
      : undefined;
    const answered =
      Number.isInteger(answer) &&
      answer! >= 0 &&
      answer! < question.options.length;
    return {
      id: question.id,
      answered,
      correct: answered && answer === question.correctOption,
    };
  });
  const correct = results.filter((result) => result.correct).length;
  return {
    correct,
    total: questions.length,
    answered: results.filter((result) => result.answered).length,
    percentage: questions.length
      ? Math.round((correct / questions.length) * 100)
      : 0,
    results,
  };
}
