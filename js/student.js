// =====================================================================
// QuizMaster: Student Module
// File: js/student.js
// Description:
//   Handles student workspace: Joining classes with join code,
//   browsing assigned exams, taking timed exam attempts,
//   submitting answers with client auto-grading of objective questions,
//   and viewing released exam results with feedback.
// =====================================================================

import { supabase } from "./supabaseClient.js";
import { gradeObjectiveQuestion, calculateRemainingTime, formatTime } from "./quizEngine.js";

// Active in-memory attempt state
export let activeAttempt = {
  attemptId: null,
  exam: null,
  questions: [],
  answers: {}, // questionId -> answer value
  currentQuestionIndex: 0,
  timerInterval: null,
  startedAt: null,
};

// =====================================================================
// 1. STUDENT DASHBOARD & CLASS JOINING
// =====================================================================

/**
 * Loads student's enrolled classes and available exams.
 */
export async function loadStudentDashboard(studentId) {
  if (!supabase) return { classes: [], exams: [], myAttempts: [] };

  try {
    // 1. Fetch classes the student has joined
    const { data: memberClasses, error: clsErr } = await supabase
      .from("class_members")
      .select(`
        class_id,
        joined_at,
        classes (
          id,
          name,
          join_code
        )
      `)
      .eq("student_id", studentId);

    if (clsErr) console.warn("Error fetching student classes:", clsErr);

    const enrolledClasses = (memberClasses || []).map((m) => m.classes).filter(Boolean);
    const classIds = enrolledClasses.map((c) => c.id);

    // 2. Fetch published exams for these enrolled classes
    let availableExams = [];
    if (classIds.length > 0) {
      const { data: exams, error: exErr } = await supabase
        .from("exams")
        .select(`
          id,
          title,
          instructions,
          duration_minutes,
          status,
          class_id,
          results_released_at,
          created_at,
          classes (
            id,
            name
          )
        `)
        .in("class_id", classIds)
        .in("status", ["published", "closed"])
        .order("created_at", { ascending: false });

      if (exErr) console.warn("Error fetching exams:", exErr);
      availableExams = exams || [];
    }

    // 3. Fetch student's existing attempts
    const { data: attempts, error: attErr } = await supabase
      .from("attempts")
      .select(`
        id,
        exam_id,
        started_at,
        submitted_at,
        status,
        score,
        exams (
          id,
          title,
          duration_minutes,
          results_released_at
        )
      `)
      .eq("student_id", studentId);

    if (attErr) console.warn("Error fetching attempts:", attErr);

    return {
      classes: enrolledClasses,
      exams: availableExams,
      myAttempts: attempts || [],
    };
  } catch (err) {
    console.error("Dashboard load failed:", err);
    return { classes: [], exams: [], myAttempts: [] };
  }
}

/**
 * Allows a student to join a class using a join code.
 */
export async function joinClassByCode(studentId, joinCode) {
  if (!supabase) throw new Error("Supabase is not connected.");

  const cleanCode = joinCode.trim().toUpperCase();

  // Try the secure RPC first
  const { data: rpcData, error: rpcErr } = await supabase.rpc("join_class", {
    code: cleanCode,
  });

  if (!rpcErr && rpcData) {
    if (rpcData.success) return rpcData;
    throw new Error(rpcData.message || "Failed to join class.");
  }

  // Fallback direct table query if RPC is not installed yet
  const { data: classRecord, error: findErr } = await supabase
    .from("classes")
    .select("id, name, join_code")
    .ilike("join_code", cleanCode)
    .single();

  if (findErr || !classRecord) {
    throw new Error("Invalid join code. Please check with your teacher.");
  }

  const { error: joinErr } = await supabase.from("class_members").insert([
    {
      class_id: classRecord.id,
      student_id: studentId,
    },
  ]);

  if (joinErr && !joinErr.message?.includes("duplicate")) {
    throw joinErr;
  }

  return { success: true, class_name: classRecord.name };
}

// =====================================================================
// 2. EXAM ATTEMPT & TIMER
// =====================================================================

/**
 * Starts or resumes an exam attempt for the student.
 * Fetches questions without answer keys to protect test integrity.
 */
export async function startOrResumeExam(studentId, examId) {
  if (!supabase) throw new Error("Supabase is not connected.");

  // 1. Fetch exam metadata
  const { data: exam, error: examErr } = await supabase
    .from("exams")
    .select("id, title, instructions, duration_minutes, status, class_id")
    .eq("id", examId)
    .single();

  if (examErr || !exam) throw new Error("Could not find exam details.");

  // 2. Check if student already has an attempt
  let { data: attempt, error: attErr } = await supabase
    .from("attempts")
    .select("*")
    .eq("exam_id", examId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (!attempt) {
    // Insert new attempt
    const { data: newAttempt, error: createErr } = await supabase
      .from("attempts")
      .insert([
        {
          exam_id: examId,
          student_id: studentId,
          status: "in_progress",
          started_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (createErr) throw createErr;
    attempt = newAttempt;
  } else if (attempt.status === "submitted" || attempt.status === "graded") {
    throw new Error("You have already submitted this exam.");
  }

  // 3. Fetch questions safely (WITHOUT answer keys)
  // Try secure RPC first
  let questions = [];
  const { data: rpcQuestions, error: rpcQErr } = await supabase.rpc("get_student_exam_questions", {
    p_exam_id: examId,
  });

  if (!rpcQErr && rpcQuestions && rpcQuestions.length > 0) {
    questions = rpcQuestions;
  } else {
    // Direct table fallback: explicitly omit answer_key and explanation
    const { data: directQ, error: directQErr } = await supabase
      .from("questions")
      .select("id, exam_id, position, type, prompt, marks, options")
      .eq("exam_id", examId)
      .order("position", { ascending: true });

    if (directQErr) throw directQErr;
    questions = directQ || [];
  }

  if (questions.length === 0) {
    throw new Error("This exam has no questions available.");
  }

  // 4. Load any existing saved answers
  const { data: savedAnswers } = await supabase
    .from("answers")
    .select("question_id, answer")
    .eq("attempt_id", attempt.id);

  const answerMap = {};
  (savedAnswers || []).forEach((a) => {
    answerMap[a.question_id] = a.answer;
  });

  activeAttempt = {
    attemptId: attempt.id,
    exam,
    questions,
    answers: answerMap,
    currentQuestionIndex: 0,
    startedAt: attempt.started_at,
    timerInterval: null,
  };

  return activeAttempt;
}

/**
 * Saves an answer into memory and optionally writes to Supabase.
 */
export function recordAnswer(questionId, value) {
  activeAttempt.answers[questionId] = value;
}

/**
 * Submits the exam attempt, auto-grading objective questions and
 * setting descriptive questions to pending teacher review.
 */
export async function submitExam(studentId, onAutoSubmitted = false) {
  if (!supabase || !activeAttempt.attemptId) {
    throw new Error("No active exam to submit.");
  }

  // Clear countdown timer
  if (activeAttempt.timerInterval) {
    clearInterval(activeAttempt.timerInterval);
    activeAttempt.timerInterval = null;
  }

  const attemptId = activeAttempt.attemptId;
  const examId = activeAttempt.exam.id;

  const answerPayload = activeAttempt.questions.map((q) => ({
    question_id: q.id,
    answer: activeAttempt.answers[q.id] !== undefined ? activeAttempt.answers[q.id] : null,
  }));

  const { data: gradingResult, error: gradingError } = await supabase.rpc("grade_exam_attempt", {
    p_attempt_id: attemptId,
    p_answers: answerPayload,
  });

  if (gradingError) throw gradingError;

  const result = Array.isArray(gradingResult) ? gradingResult[0] : gradingResult;

  return {
    success: true,
    status: result.status,
    score: result.score,
    autoSubmitted: onAutoSubmitted,
  };
}

// =====================================================================
// 3. STUDENT RESULTS & REVIEW (ONLY AFTER RELEASE)
// =====================================================================

/**
 * Loads exam results for student.
 * If released by teacher, loads full question breakdown with feedback and answers.
 */
export async function loadStudentAttemptReview(attemptId, studentId) {
  if (!supabase) return null;

  // 1. Fetch attempt and exam status
  const { data: attempt, error: attErr } = await supabase
    .from("attempts")
    .select(`
      id,
      score,
      status,
      started_at,
      submitted_at,
      graded_at,
      exams (
        id,
        title,
        results_released_at
      )
    `)
    .eq("id", attemptId)
    .eq("student_id", studentId)
    .single();

  if (attErr || !attempt) throw new Error("Attempt record not found.");

  const isReleased = Boolean(attempt.exams?.results_released_at);

  // If not released yet, return attempt header only
  if (!isReleased) {
    return {
      attempt,
      isReleased: false,
      reviewItems: [],
    };
  }

  // 2. If released, call secure RPC to fetch review
  const { data: rpcReview, error: rpcErr } = await supabase.rpc("get_student_exam_review", {
    p_attempt_id: attemptId,
  });

  if (!rpcErr && rpcReview) {
    return {
      attempt,
      isReleased: true,
      reviewItems: rpcReview,
    };
  }

  // Fallback: fetch questions and answers safely
  const { data: questions } = await supabase
    .from("questions")
    .select("*")
    .eq("exam_id", attempt.exams.id)
    .order("position", { ascending: true });

  const { data: answers } = await supabase
    .from("answers")
    .select("*")
    .eq("attempt_id", attemptId);

  const answerMap = new Map();
  (answers || []).forEach((a) => answerMap.set(a.question_id, a));

  const reviewItems = (questions || []).map((q) => {
    const ans = answerMap.get(q.id);
    return {
      question_id: q.id,
      position: q.position,
      type: q.type,
      prompt: q.prompt,
      marks: q.marks,
      options: q.options,
      student_answer: ans ? ans.answer : null,
      awarded_marks: ans ? ans.awarded_marks : 0,
      is_correct: ans ? ans.is_correct : null,
      feedback: ans ? ans.feedback : null,
      answer_key: q.answer_key,
      explanation: q.explanation,
      results_released: true,
    };
  });

  return {
    attempt,
    isReleased: true,
    reviewItems,
  };
}
