// =====================================================================
// QuizMaster: Test Suite for Quiz Engine
// File: tests/quizEngine.test.js
// =====================================================================

import {
  validateQuestion,
  validateExam,
  normalizeAnswer,
  gradeObjectiveQuestion,
  calculateAttemptScore,
  calculateRemainingTime,
  formatTime,
} from "../js/quizEngine.js";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log("\n========================================================");
console.log("RUNNING QUIZ ENGINE UNIT TESTS");
console.log("========================================================\n");

// 1. QUESTION VALIDATION TESTS
console.log("1. Testing Question Validation...");

// Valid MCQ
const validMcq = {
  type: "mcq",
  prompt: "Which keyword defines a constant in JavaScript?",
  marks: 2,
  options: ["var", "let", "const", "def"],
  answer_key: "const",
};
assert(validateQuestion(validMcq).valid === true, "Valid MCQ passes validation");

// Invalid MCQ (missing answer_key)
const invalidMcq = {
  type: "mcq",
  prompt: "What is 2 + 2?",
  marks: 1,
  options: ["3", "4", "5"],
  answer_key: "",
};
assert(validateQuestion(invalidMcq).valid === false, "MCQ with missing answer_key fails validation");

// Invalid MCQ (answer_key not in options)
const mismatchMcq = {
  type: "mcq",
  prompt: "Select fruit",
  marks: 1,
  options: ["Apple", "Banana"],
  answer_key: "Orange",
};
assert(validateQuestion(mismatchMcq).valid === false, "MCQ with answer_key not in options fails");

// Valid True/False
const validTf = {
  type: "true_false",
  prompt: "Is JavaScript single-threaded?",
  marks: 1,
  answer_key: true,
};
assert(validateQuestion(validTf).valid === true, "Valid True/False passes validation");

// Valid Short Answer
const validShort = {
  type: "short_answer",
  prompt: "What does DOM stand for?",
  marks: 3,
  answer_key: "Document Object Model",
};
assert(validateQuestion(validShort).valid === true, "Valid Short Answer passes validation");

// Valid Descriptive
const validDesc = {
  type: "descriptive",
  prompt: "Explain event delegation in JavaScript and why it is useful.",
  marks: 5,
};
assert(validateQuestion(validDesc).valid === true, "Valid Descriptive question passes validation");

// Invalid marks (zero or negative)
const badMarks = {
  type: "mcq",
  prompt: "Test",
  marks: 0,
  options: ["A", "B"],
  answer_key: "A",
};
assert(validateQuestion(badMarks).valid === false, "Question with 0 marks fails validation");

// 2. EXAM VALIDATION TESTS
console.log("\n2. Testing Exam Validation...");
const sampleExam = {
  title: "Midterm JavaScript Exam",
  duration_minutes: 45,
  class_id: "class-123",
  status: "published",
};

const examQuestions = [validMcq, validTf, validShort, validDesc];
const examResult = validateExam(sampleExam, examQuestions);
assert(examResult.valid === true, "Complete exam passes validation");
assert(examResult.totalMarks === 11, `Total marks calculated correctly (expected 11, got ${examResult.totalMarks})`);

// Published exam with 0 questions fails
assert(validateExam({ ...sampleExam }, []).valid === false, "Published exam with 0 questions fails validation");

// 3. NORMALIZATION & GRADING TESTS
console.log("\n3. Testing Normalization & Auto-Grading...");

// MCQ Correct
const mcqGradeCorrect = gradeObjectiveQuestion(validMcq, "const");
assert(mcqGradeCorrect.isCorrect === true && mcqGradeCorrect.awardedMarks === 2, "MCQ correct choice awards full marks (2/2)");

// MCQ Wrong
const mcqGradeWrong = gradeObjectiveQuestion(validMcq, "var");
assert(mcqGradeWrong.isCorrect === false && mcqGradeWrong.awardedMarks === 0, "MCQ incorrect choice awards 0 marks");

// True/False Correct
const tfGradeCorrect = gradeObjectiveQuestion(validTf, true);
assert(tfGradeCorrect.isCorrect === true && tfGradeCorrect.awardedMarks === 1, "True/False correct answer awards 1 mark");

// Short Answer (Case-insensitive & trimmed)
const shortGradeCorrect = gradeObjectiveQuestion(validShort, "  document object model  ");
assert(shortGradeCorrect.isCorrect === true && shortGradeCorrect.awardedMarks === 3, "Short answer case-insensitive match awards full marks (3/3)");

// Descriptive (Stays pending for teacher review)
const descGrade = gradeObjectiveQuestion(validDesc, "Event delegation uses event bubbling to handle events at a parent element.");
assert(descGrade.isPending === true && descGrade.awardedMarks === 0, "Descriptive question remains pending manual grading");

// 4. TIMER & FORMATTING TESTS
console.log("\n4. Testing Countdown Timer & Formatting...");
assert(formatTime(125) === "02:05", "formatTime formats 125 seconds as '02:05'");
assert(formatTime(0) === "00:00", "formatTime formats 0 seconds as '00:00'");

const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
const remaining = calculateRemainingTime(fiveMinsAgo, 10);
assert(!remaining.isExpired, "Exam with 5 mins elapsed out of 10 is not expired");
assert(remaining.minutes === 4 || remaining.minutes === 5, "Remaining minutes approximately 5 mins");

console.log("\n========================================================");
console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log("========================================================\n");

if (failed > 0) {
  process.exit(1);
}

