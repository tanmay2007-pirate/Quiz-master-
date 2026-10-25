// =====================================================================
// QuizMaster: Teacher Module
// File: js/teacher.js
// Description:
//   Handles teacher workspace: Dashboard statistics, class creation,
//   exam builder with questions, manual grading of written answers,
//   and releasing exam results to students.
// =====================================================================

import { supabase } from "./supabaseClient.js";
import { validateExam, validateQuestion } from "./quizEngine.js";

// Local state for the exam currently being built or edited
export let currentBuilderExam = {
  id: null,
  title: "",
  instructions: "",
  duration_minutes: 30,
  class_id: "",
  status: "draft",
  questions: [],
};

// =====================================================================
// 1. TEACHER DASHBOARD & STATS
// =====================================================================

/**
 * Loads teacher overview data: active exams count, total submissions, average score,
 * and recent assessment activity.
 */
export async function loadTeacherOverview(teacherId) {
  if (!supabase) return getMockTeacherStats();

  try {
    // 1. Fetch teacher's exams
    const { data: exams, error: examErr } = await supabase
      .from("exams")
      .select("id, title, status, duration_minutes, created_at, results_released_at")
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false });

    if (examErr) throw examErr;

    const examList = exams || [];
    const examIds = examList.map((e) => e.id);

    // 2. Fetch attempts for these exams
    let submissionsCount = 0;
    let avgScore = 0;
    let attemptsList = [];

    if (examIds.length > 0) {
      const { data: attempts, error: attErr } = await supabase
        .from("attempts")
        .select("id, exam_id, score, status, submitted_at")
        .in("exam_id", examIds);

      if (!attErr && attempts) {
        attemptsList = attempts;
        const completedAttempts = attempts.filter((a) => a.submitted_at);
        submissionsCount = completedAttempts.length;

        if (submissionsCount > 0) {
          const totalScore = completedAttempts.reduce((sum, a) => sum + (Number(a.score) || 0), 0);
          avgScore = Math.round(totalScore / submissionsCount);
        }
      }
    }

    const activeExamsCount = examList.filter((e) => e.status === "published").length;

    return {
      activeExamsCount,
      submissionsCount,
      avgScore,
      exams: examList,
      recentAttempts: attemptsList.slice(0, 5),
    };
  } catch (err) {
    console.warn("Using mock stats due to database connection:", err.message);
    return getMockTeacherStats();
  }
}

function getMockTeacherStats() {
  return {
    activeExamsCount: 4,
    submissionsCount: 28,
    avgScore: 78,
    exams: [
      { id: "mock-1", title: "JavaScript Essentials Quiz", status: "published", duration_minutes: 30 },
      { id: "mock-2", title: "Fundamentals Test", status: "published", duration_minutes: 45 },
      { id: "mock-3", title: "Practice Paper", status: "draft", duration_minutes: 20 },
    ],
    recentAttempts: [],
  };
}

// =====================================================================
// 2. CLASS MANAGEMENT
// =====================================================================

/**
 * Loads classes created by the teacher.
 */
export async function loadTeacherClasses(teacherId) {
  if (!supabase) return [];

  const { data: classes, error } = await supabase
    .from("classes")
    .select("id, name, join_code, created_at, class_members(count)")
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading classes:", error);
    return [];
  }

  return (classes || []).map((c) => ({
    ...c,
    student_count: c.class_members?.[0]?.count || 0,
  }));
}

/**
 * Creates a new class with a name and unique join code.
 */
export async function createClass(teacherId, name, customCode = "") {
  if (!supabase) throw new Error("Supabase is not connected.");

  const cleanName = name.trim();
  if (!cleanName) throw new Error("Class name is required.");

  // Generate a random 6-character code if not provided
  const joinCode = customCode.trim()
    ? customCode.trim().toUpperCase()
    : Math.random().toString(36).substring(2, 8).toUpperCase();

  const { data, error } = await supabase.rpc("create_teacher_class", {
    p_name: cleanName,
    p_join_code: joinCode,
  });

  if (error) throw error;
  return data;
}

// =====================================================================
// 3. EXAM BUILDER & QUESTIONS
// =====================================================================

/**
 * Resets or initializes the in-memory builder exam.
 */
export function resetBuilderExam(classId = "") {
  currentBuilderExam = {
    id: null,
    title: "",
    instructions: "",
    duration_minutes: 30,
    class_id: classId,
    status: "draft",
    questions: [],
  };
  return currentBuilderExam;
}

/**
 * Adds a new question to the builder.
 */
export function addQuestionToBuilder(questionData) {
  const validation = validateQuestion(questionData);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const newQuestion = {
    ...questionData,
    id: questionData.id || "temp-" + Date.now(),
    position: currentBuilderExam.questions.length + 1,
    marks: Number(questionData.marks) || 1,
  };

  currentBuilderExam.questions.push(newQuestion);
  return newQuestion;
}

/**
 * Removes a question from the builder by its array index.
 */
export function removeQuestionFromBuilder(index) {
  if (index >= 0 && index < currentBuilderExam.questions.length) {
    currentBuilderExam.questions.splice(index, 1);
    // Recalculate position numbers
    currentBuilderExam.questions.forEach((q, i) => {
      q.position = i + 1;
    });
  }
}

/**
 * Loads an existing exam into the builder for editing.
 */
export async function loadExamIntoBuilder(examId, teacherId) {
  if (!supabase) return null;

  // 1. Fetch exam metadata
  const { data: exam, error: examErr } = await supabase
    .from("exams")
    .select("*")
    .eq("id", examId)
    .eq("teacher_id", teacherId)
    .single();

  if (examErr) throw examErr;

  // 2. Fetch questions for this exam
  const { data: questions, error: qErr } = await supabase
    .from("questions")
    .select("*")
    .eq("exam_id", examId)
    .order("position", { ascending: true });

  if (qErr) throw qErr;

  currentBuilderExam = {
    ...exam,
    questions: questions || [],
  };

  return currentBuilderExam;
}

/**
 * Saves or updates an exam and its questions in Supabase.
 */
export async function saveExam(teacherId, statusToSave = null) {
  if (!supabase) throw new Error("Supabase is not connected.");

  if (statusToSave) {
    currentBuilderExam.status = statusToSave;
  }

  // Validate the whole exam
  const validation = validateExam(currentBuilderExam, currentBuilderExam.questions);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const examPayload = {
    teacher_id: teacherId,
    class_id: currentBuilderExam.class_id,
    title: currentBuilderExam.title.trim(),
    instructions: currentBuilderExam.instructions?.trim() || "",
    duration_minutes: Number(currentBuilderExam.duration_minutes) || 30,
    status: currentBuilderExam.status,
  };

  let savedExamId = currentBuilderExam.id;

  if (savedExamId) {
    // Update existing exam
    const { error } = await supabase
      .from("exams")
      .update(examPayload)
      .eq("id", savedExamId)
      .eq("teacher_id", teacherId);

    if (error) throw error;
  } else {
    // Insert new exam
    const { data, error } = await supabase
      .from("exams")
      .insert([examPayload])
      .select("id")
      .single();

    if (error) throw error;
    savedExamId = data.id;
    currentBuilderExam.id = savedExamId;
  }

  // Upsert questions
  if (currentBuilderExam.questions.length > 0) {
    // Delete old questions if updating
    await supabase.from("questions").delete().eq("exam_id", savedExamId);

    const questionsToInsert = currentBuilderExam.questions.map((q, idx) => ({
      exam_id: savedExamId,
      position: idx + 1,
      type: q.type,
      prompt: q.prompt.trim(),
      marks: Number(q.marks) || 1,
      options: q.options || null,
      answer_key: q.answer_key !== undefined ? q.answer_key : null,
      explanation: q.explanation?.trim() || null,
    }));

    const { error: qError } = await supabase.from("questions").insert(questionsToInsert);
    if (qError) throw qError;
  }

  return currentBuilderExam;
}

// =====================================================================
// 4. RESULTS & MANUAL GRADING
// =====================================================================

/**
 * Loads all student attempts for a teacher's exams.
 */
export async function loadTeacherExamAttempts(teacherId, examIdFilter = null) {
  if (!supabase) return [];

  let query = supabase
    .from("attempts")
    .select(`
      id,
      exam_id,
      student_id,
      started_at,
      submitted_at,
      status,
      score,
      graded_at,
      exams!inner (
        id,
        title,
        teacher_id,
        results_released_at
      ),
      profiles (
        id,
        display_name
      )
    `)
    .eq("exams.teacher_id", teacherId)
    .order("submitted_at", { ascending: false });

  if (examIdFilter) {
    query = query.eq("exam_id", examIdFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error loading exam attempts:", error);
    return [];
  }

  return data || [];
}

/**
 * Loads the complete question-by-question breakdown for a specific attempt
 * so the teacher can review and manually grade descriptive answers.
 */
export async function loadAttemptForGrading(attemptId) {
  if (!supabase) return null;

  // 1. Fetch attempt info
  const { data: attempt, error: attErr } = await supabase
    .from("attempts")
    .select(`
      id,
      exam_id,
      student_id,
      started_at,
      submitted_at,
      status,
      score,
      exams (
        id,
        title,
        results_released_at
      ),
      profiles (
        id,
        display_name
      )
    `)
    .eq("id", attemptId)
    .single();

  if (attErr) throw attErr;

  // 2. Fetch questions for the exam
  const { data: questions, error: qErr } = await supabase
    .from("questions")
    .select("*")
    .eq("exam_id", attempt.exam_id)
    .order("position", { ascending: true });

  if (qErr) throw qErr;

  // 3. Fetch student's submitted answers
  const { data: answers, error: ansErr } = await supabase
    .from("answers")
    .select("*")
    .eq("attempt_id", attemptId);

  if (ansErr) throw ansErr;

  // Map answers to questions
  const answersMap = new Map();
  (answers || []).forEach((ans) => {
    answersMap.set(ans.question_id, ans);
  });

  const gradedItems = (questions || []).map((q) => {
    const studentAns = answersMap.get(q.id);
    return {
      question: q,
      answer: studentAns || null,
      studentAnswer: studentAns ? studentAns.answer : null,
      awardedMarks: studentAns ? studentAns.awarded_marks : 0,
      feedback: studentAns ? studentAns.feedback : "",
      isCorrect: studentAns ? studentAns.is_correct : null,
    };
  });

  return {
    attempt,
    gradedItems,
  };
}

/**
 * Saves manual grading marks and feedback for a student attempt.
 */
export async function saveManualGrading(attemptId, teacherId, gradingUpdates) {
  if (!supabase) throw new Error("Supabase is not connected.");

  let totalScore = 0;
  let allGraded = true;

  for (const item of gradingUpdates) {
    const awarded = Math.max(0, Math.min(Number(item.awardedMarks) || 0, Number(item.maxMarks)));
    totalScore += awarded;

    const isCorrect = awarded === Number(item.maxMarks) ? true : awarded === 0 ? false : null;

    if (item.answerId) {
      await supabase
        .from("answers")
        .update({
          awarded_marks: awarded,
          is_correct: isCorrect,
          feedback: item.feedback?.trim() || null,
          graded_by: teacherId,
        })
        .eq("id", item.answerId);
    }
  }

  // Update overall attempt score and status
  const { error } = await supabase
    .from("attempts")
    .update({
      score: totalScore,
      status: "graded",
      graded_at: new Date().toISOString(),
    })
    .eq("id", attemptId);

  if (error) throw error;

  return { totalScore, status: "graded" };
}

/**
 * Releases exam results so students can view their scores, feedback, and answers.
 */
export async function releaseExamResults(examId, teacherId) {
  if (!supabase) throw new Error("Supabase is not connected.");

  const { data, error } = await supabase
    .from("exams")
    .update({
      results_released_at: new Date().toISOString(),
    })
    .eq("id", examId)
    .eq("teacher_id", teacherId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
