// =====================================================================
// QuizMaster: Quiz Engine (Pure, Testable Functions)
// File: js/quizEngine.js
// Description:
//   Contains validation, answer normalization, objective auto-grading,
//   score calculation, and countdown timer logic.
// =====================================================================

/**
 * Validates a single question object.
 * Returns { valid: boolean, error: string | null }
 */
export function validateQuestion(q) {
  if (!q) {
    return { valid: false, error: "Question cannot be empty." };
  }

  // 1. Check question prompt
  if (!q.prompt || typeof q.prompt !== "string" || q.prompt.trim().length === 0) {
    return { valid: false, error: "Question prompt text is required." };
  }

  // 2. Check marks (must be a positive number)
  const marks = Number(q.marks);
  if (isNaN(marks) || marks <= 0) {
    return { valid: false, error: "Marks must be a positive number greater than 0." };
  }

  // 3. Validate based on question type
  const allowedTypes = ["mcq", "true_false", "short_answer", "descriptive"];
  if (!allowedTypes.includes(q.type)) {
    return { valid: false, error: `Invalid question type: ${q.type}` };
  }

  if (q.type === "mcq") {
    // MCQ requires an array of options with at least 2 non-empty items
    if (!Array.isArray(q.options) || q.options.length < 2) {
      return { valid: false, error: "Multiple choice questions require at least 2 options." };
    }
    const hasEmptyOption = q.options.some((opt) => !opt || opt.trim().length === 0);
    if (hasEmptyOption) {
      return { valid: false, error: "All MCQ options must contain non-empty text." };
    }
    // Correct answer key must be selected and match one of the options
    if (q.answer_key === undefined || q.answer_key === null || String(q.answer_key).trim() === "") {
      return { valid: false, error: "Please select the correct option for the MCQ." };
    }
    if (!q.options.includes(q.answer_key)) {
      return { valid: false, error: "Selected correct answer must match one of the options." };
    }
  }

  if (q.type === "true_false") {
    // True/False requires a valid boolean key
    const validKeys = [true, false, "true", "false"];
    if (!validKeys.includes(q.answer_key)) {
      return { valid: false, error: "Please select True or False as the correct answer." };
    }
  }

  if (q.type === "short_answer") {
    // Short answer requires a non-empty expected answer string
    if (!q.answer_key || String(q.answer_key).trim().length === 0) {
      return { valid: false, error: "Please provide the expected correct short answer." };
    }
  }

  if (q.type === "descriptive") {
    // Descriptive questions don't require an exact match, but marks must be specified
    // An optional marking guide can be stored in answer_key
  }

  return { valid: true, error: null };
}

/**
 * Validates an entire exam before saving or publishing.
 * Returns { valid: boolean, error: string | null, totalMarks: number }
 */
export function validateExam(exam, questions = []) {
  if (!exam.title || exam.title.trim().length === 0) {
    return { valid: false, error: "Exam title is required.", totalMarks: 0 };
  }

  const duration = Number(exam.duration_minutes);
  if (isNaN(duration) || duration <= 0) {
    return { valid: false, error: "Duration must be greater than 0 minutes.", totalMarks: 0 };
  }

  if (!exam.class_id) {
    return { valid: false, error: "Please select a target class for this exam.", totalMarks: 0 };
  }

  // Publishing requires at least 1 question
  if (exam.status === "published") {
    if (!questions || questions.length === 0) {
      return { valid: false, error: "Cannot publish an exam with no questions. Add at least one question.", totalMarks: 0 };
    }

    // Validate each question in the paper
    for (let i = 0; i < questions.length; i++) {
      const qResult = validateQuestion(questions[i]);
      if (!qResult.valid) {
        return {
          valid: false,
          error: `Question ${i + 1} is incomplete: ${qResult.error}`,
          totalMarks: 0,
        };
      }
    }
  }

  // Calculate total marks across all questions
  const totalMarks = questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);

  return { valid: true, error: null, totalMarks };
}

/**
 * Normalizes student answers for consistent comparison.
 */
export function normalizeAnswer(type, rawAnswer) {
  if (rawAnswer === undefined || rawAnswer === null) {
    return "";
  }

  if (type === "true_false") {
    if (typeof rawAnswer === "boolean") return rawAnswer;
    return String(rawAnswer).toLowerCase().trim() === "true";
  }

  if (type === "short_answer") {
    // Case-insensitive, trimmed comparison
    return String(rawAnswer).trim().toLowerCase();
  }

  if (type === "mcq") {
    return String(rawAnswer).trim();
  }

  // Descriptive
  return String(rawAnswer).trim();
}

/**
 * Grades an objective question (MCQ, True/False, Short Answer).
 * Returns { isGraded, isCorrect, awardedMarks, isPending }
 */
export function gradeObjectiveQuestion(question, studentAnswer) {
  const maxMarks = Number(question.marks) || 0;

  // 1. Long descriptive answer: always pending teacher manual grading
  if (question.type === "descriptive") {
    return {
      isGraded: false,
      isCorrect: null,
      awardedMarks: 0,
      maxMarks,
      isPending: true,
    };
  }

  // If student did not provide an answer
  if (studentAnswer === undefined || studentAnswer === null || String(studentAnswer).trim() === "") {
    return {
      isGraded: true,
      isCorrect: false,
      awardedMarks: 0,
      maxMarks,
      isPending: false,
    };
  }

  // 2. MCQ Question
  if (question.type === "mcq") {
    const studentChoice = normalizeAnswer("mcq", studentAnswer);
    const correctChoice = normalizeAnswer("mcq", question.answer_key);
    const isCorrect = studentChoice === correctChoice;
    return {
      isGraded: true,
      isCorrect,
      awardedMarks: isCorrect ? maxMarks : 0,
      maxMarks,
      isPending: false,
    };
  }

  // 3. True / False Question
  if (question.type === "true_false") {
    const studentBool = normalizeAnswer("true_false", studentAnswer);
    const correctBool = normalizeAnswer("true_false", question.answer_key);
    const isCorrect = studentBool === correctBool;
    return {
      isGraded: true,
      isCorrect,
      awardedMarks: isCorrect ? maxMarks : 0,
      maxMarks,
      isPending: false,
    };
  }

  // 4. Short Answer Question (Exact match, case-insensitive)
  if (question.type === "short_answer") {
    const studentText = normalizeAnswer("short_answer", studentAnswer);
    const correctText = normalizeAnswer("short_answer", question.answer_key);
    const isCorrect = studentText === correctText;
    return {
      isGraded: true,
      isCorrect,
      awardedMarks: isCorrect ? maxMarks : 0,
      maxMarks,
      isPending: false,
    };
  }

  // Fallback
  return {
    isGraded: false,
    isCorrect: null,
    awardedMarks: 0,
    maxMarks,
    isPending: true,
  };
}

/**
 * Calculates total score and overall percentage from an array of answers.
 */
export function calculateAttemptScore(answers = [], questions = []) {
  let totalAwarded = 0;
  let totalPossible = 0;
  let hasPending = false;

  const questionMap = new Map();
  questions.forEach((q) => questionMap.set(q.id, q));

  answers.forEach((ans) => {
    const q = questionMap.get(ans.question_id);
    const maxMarks = q ? Number(q.marks) : 0;
    totalPossible += maxMarks;

    const awarded = Number(ans.awarded_marks) || 0;
    totalAwarded += awarded;

    if (ans.is_correct === null || ans.is_correct === undefined) {
      if (q && q.type === "descriptive") {
        hasPending = true;
      }
    }
  });

  const percentage = totalPossible > 0 ? (totalAwarded / totalPossible) * 100 : 0;

  return {
    score: totalAwarded,
    totalPossible,
    percentage: Math.round(percentage * 10) / 10,
    hasPending,
  };
}

/**
 * Computes remaining time for an exam attempt.
 * Notice: Browser timer is a UX indicator; server-side timestamp can also be verified.
 */
export function calculateRemainingTime(startedAt, durationMinutes) {
  const start = new Date(startedAt).getTime();
  const durationMs = Number(durationMinutes) * 60 * 1000;
  const end = start + durationMs;
  const now = Date.now();

  const diffMs = end - now;

  if (diffMs <= 0) {
    return {
      minutes: 0,
      seconds: 0,
      totalSecondsRemaining: 0,
      isExpired: true,
    };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return {
    minutes,
    seconds,
    totalSecondsRemaining: totalSeconds,
    isExpired: false,
  };
}

/**
 * Helper to format seconds into "MM:SS" string.
 */
export function formatTime(totalSeconds) {
  if (totalSeconds <= 0) return "00:00";
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

