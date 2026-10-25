// =====================================================================
// QuizMaster: Main Application Controller
// File: js/app.js
// Description:
//   Connects the UI with authentication, teacher tools, student tools,
//   and the quiz engine. Written in neat, beginner-friendly JavaScript
//   with clear function names and comments.
// =====================================================================

import { supabase } from "./supabaseClient.js";
import {
  signUpStudent,
  signInUser,
  signOutUser,
  getCurrentUserProfile,
  onAuthStateChange,
} from "./auth.js";
import {
  validateQuestion,
  validateExam,
  calculateRemainingTime,
  formatTime,
} from "./quizEngine.js";
import {
  currentBuilderExam,
  loadTeacherOverview,
  loadTeacherClasses,
  createClass,
  resetBuilderExam,
  addQuestionToBuilder,
  removeQuestionFromBuilder,
  saveExam,
  loadExamIntoBuilder,
  loadTeacherExamAttempts,
  loadAttemptForGrading,
  saveManualGrading,
  releaseExamResults,
} from "./teacher.js";
import {
  activeAttempt,
  loadStudentDashboard,
  joinClassByCode,
  startOrResumeExam,
  recordAnswer,
  submitExam,
  loadStudentAttemptReview,
} from "./student.js";

// =====================================================================
// GLOBAL APP STATE
// =====================================================================
let currentUser = null;
let currentProfile = null;
let currentAttemptGrading = null; // Used during manual teacher grading

// DOM Elements
const contextBadge = document.getElementById("context-badge");
const headerUserActions = document.getElementById("header-user-actions");
const userDisplayName = document.getElementById("user-display-name");
const userRolePill = document.getElementById("user-role-pill");
const btnSignOut = document.getElementById("btn-sign-out");

// Top-level Views
const viewAuth = document.getElementById("view-auth");
const viewTeacher = document.getElementById("view-teacher");
const viewStudent = document.getElementById("view-student");
const viewAttempt = document.getElementById("view-attempt");

// =====================================================================
// 1. INITIALIZATION & AUTH STATE LISTENER
// =====================================================================
document.addEventListener("DOMContentLoaded", async () => {
  setupAuthTabs();
  setupTeacherNavigation();
  setupStudentNavigation();
  setupModals();
  setupFormListeners();

  // Listen for Supabase session changes
  onAuthStateChange(async (event, session) => {
    if (session?.user) {
      await loadSessionUser();
    } else {
      showAuthScreen();
    }
  });

  // Check initial user profile
  await loadSessionUser();
});

/**
 * Loads current user from session and routes to the right workspace.
 */
async function loadSessionUser() {
  try {
    const userProfile = await getCurrentUserProfile();

    if (!userProfile || !userProfile.user) {
      showAuthScreen();
      return;
    }

    currentUser = userProfile.user;
    currentProfile = userProfile.profile;

    // Update Header
    headerUserActions.style.display = "flex";
    userDisplayName.textContent = currentProfile.display_name || "User";
    userRolePill.textContent = currentProfile.role.toUpperCase();
    userRolePill.className = `role-pill ${currentProfile.role}`;

    // Route based on role loaded securely from database
    if (currentProfile.role === "teacher") {
      showTeacherWorkspace();
    } else {
      showStudentWorkspace();
    }
  } catch (err) {
    console.error("Failed to load user profile:", err);
    showAuthScreen();
  }
}

// =====================================================================
// 2. VIEW ROUTING FUNCTIONS
// =====================================================================

function showAuthScreen() {
  currentUser = null;
  currentProfile = null;
  headerUserActions.style.display = "none";
  contextBadge.textContent = "/ LOGIN";

  viewAuth.style.display = "flex";
  viewTeacher.style.display = "none";
  viewStudent.style.display = "none";
  viewAttempt.style.display = "none";
}

function showTeacherWorkspace() {
  contextBadge.textContent = "/ TEACHER";

  viewAuth.style.display = "none";
  viewTeacher.style.display = "flex";
  viewStudent.style.display = "none";
  viewAttempt.style.display = "none";

  // Switch to Overview tab by default
  switchTeacherTab("overview");
}

function showStudentWorkspace() {
  contextBadge.textContent = "/ STUDENT";

  viewAuth.style.display = "none";
  viewTeacher.style.display = "none";
  viewStudent.style.display = "flex";
  viewAttempt.style.display = "none";

  // Switch to Available Exams tab by default
  switchStudentTab("exams");
}

function showAttemptScreen() {
  contextBadge.textContent = "/ EXAM IN PROGRESS";

  viewAuth.style.display = "none";
  viewTeacher.style.display = "none";
  viewStudent.style.display = "none";
  viewAttempt.style.display = "flex";
}

// =====================================================================
// 3. AUTHENTICATION CONTROLLER
// =====================================================================

function setupAuthTabs() {
  const tabSignIn = document.getElementById("tab-btn-signin");
  const tabSignUp = document.getElementById("tab-btn-signup");
  const formSignIn = document.getElementById("form-signin");
  const formSignUp = document.getElementById("form-signup");
  const alertBox = document.getElementById("auth-alert-box");
  const signupRole = document.getElementById("signup-role");
  const teacherInvitationGroup = document.getElementById("teacher-invitation-group");
  const teacherInvitationInput = document.getElementById("signup-teacher-code");

  tabSignIn.addEventListener("click", () => {
    tabSignIn.classList.add("active");
    tabSignUp.classList.remove("active");
    formSignIn.style.display = "block";
    formSignUp.style.display = "none";
    alertBox.innerHTML = "";
  });

  tabSignUp.addEventListener("click", () => {
    tabSignUp.classList.add("active");
    tabSignIn.classList.remove("active");
    formSignUp.style.display = "block";
    formSignIn.style.display = "none";
    alertBox.innerHTML = "";
  });

  signupRole?.addEventListener("change", () => {
    const isTeacher = signupRole.value === "teacher";
    teacherInvitationGroup.style.display = isTeacher ? "block" : "none";
    teacherInvitationInput.required = isTeacher;
    if (!isTeacher) teacherInvitationInput.value = "";
  });

  // Demo buttons
  document.getElementById("btn-fill-demo-teacher")?.addEventListener("click", () => {
    document.getElementById("signin-portal-type").value = "teacher";
    document.getElementById("signin-email").value = "teacher@quizmaster.edu";
    document.getElementById("signin-password").value = "Teacher123!";
  });

  document.getElementById("btn-fill-demo-student")?.addEventListener("click", () => {
    document.getElementById("signin-portal-type").value = "student";
    document.getElementById("signin-email").value = "student@quizmaster.edu";
    document.getElementById("signin-password").value = "Student123!";
  });

  // Sign out button
  btnSignOut.addEventListener("click", async () => {
    try {
      await signOutUser();
      showAuthScreen();
    } catch (err) {
      alert("Error signing out: " + err.message);
    }
  });
}

function showAuthAlert(message, type = "error") {
  const alertBox = document.getElementById("auth-alert-box");
  alertBox.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
}

// Handle Sign In submission
document.getElementById("form-signin")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("signin-email").value.trim();
  const password = document.getElementById("signin-password").value;
  const portalType = document.getElementById("signin-portal-type").value;
  const submitBtn = document.getElementById("btn-submit-signin");

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing In...";

    await signInUser(email, password);
    const userProfile = await getCurrentUserProfile();

    if (!userProfile) {
      throw new Error("Unable to fetch user profile after sign-in.");
    }

    // Role check
    if (portalType === "teacher" && userProfile.profile.role !== "teacher") {
      showAuthAlert("Note: This account is registered as a Student. Accessing Student Workspace.", "info");
    }

    await loadSessionUser();
  } catch (err) {
    showAuthAlert(err.message || "Failed to sign in. Please verify credentials.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Sign In to Workspace";
  }
});

// Handle Sign Up submission
document.getElementById("form-signup")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("signup-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const role = document.getElementById("signup-role").value;
  const invitationCode = document.getElementById("signup-teacher-code").value.trim();
  const submitBtn = document.getElementById("btn-submit-signup");

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating Account...";

    const signupResult = await signUpStudent(email, password, name, role, invitationCode);
    if (signupResult.session) {
      await loadSessionUser();
      return;
    }

    showAuthAlert(
      "Account created successfully. Confirm your email, then sign in to open your workspace.",
      "success"
    );

    // Switch back to sign in tab
    document.getElementById("tab-btn-signin").click();
    document.getElementById("signin-email").value = email;
  } catch (err) {
    showAuthAlert(err.message || "Sign-up failed.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Account";
  }
});

// =====================================================================
// 4. TEACHER WORKSPACE CONTROLLER
// =====================================================================

function setupTeacherNavigation() {
  const navButtons = document.querySelectorAll("[data-teacher-tab]");
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabName = btn.getAttribute("data-teacher-tab");
      switchTeacherTab(tabName);
    });
  });

  // "+ New Assessment" button on overview
  document.getElementById("btn-new-assessment-top")?.addEventListener("click", () => {
    resetBuilderExam();
    renderBuilderUI();
    switchTeacherTab("builder");
  });
}

async function switchTeacherTab(tabName) {
  // Update sidebar active classes
  document.querySelectorAll("[data-teacher-tab]").forEach((btn) => {
    if (btn.getAttribute("data-teacher-tab") === tabName) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Hide all panes
  document.getElementById("pane-teacher-overview").style.display = "none";
  document.getElementById("pane-teacher-classes").style.display = "none";
  document.getElementById("pane-teacher-builder").style.display = "none";
  document.getElementById("pane-teacher-results").style.display = "none";
  document.getElementById("pane-teacher-settings").style.display = "none";

  // Show selected pane and load its data
  if (tabName === "overview") {
    contextBadge.textContent = "/ TEACHER";
    document.getElementById("pane-teacher-overview").style.display = "block";
    await refreshTeacherOverview();
  } else if (tabName === "classes") {
    contextBadge.textContent = "/ CLASSES";
    document.getElementById("pane-teacher-classes").style.display = "block";
    await refreshTeacherClasses();
  } else if (tabName === "builder") {
    contextBadge.textContent = "/ BUILDER";
    document.getElementById("pane-teacher-builder").style.display = "block";
    await prepareBuilderClassDropdown();
    renderBuilderUI();
  } else if (tabName === "results") {
    contextBadge.textContent = "/ RESULTS";
    document.getElementById("pane-teacher-results").style.display = "block";
    await refreshTeacherResults();
  } else if (tabName === "settings") {
    contextBadge.textContent = "/ SETTINGS";
    document.getElementById("pane-teacher-settings").style.display = "block";
  }
}

// ---------------------------------------------------------------------
// Teacher: Overview Tab
// ---------------------------------------------------------------------
async function refreshTeacherOverview() {
  if (!currentUser) return;
  const overview = await loadTeacherOverview(currentUser.id);

  // Update stat cards
  document.getElementById("stat-active-exams").textContent = String(overview.activeExamsCount).padStart(2, "0");
  document.getElementById("stat-submissions").textContent = String(overview.submissionsCount).padStart(2, "0");
  document.getElementById("stat-avg-score").textContent = `${overview.avgScore}%`;

  // Render recent assessments table
  const tbody = document.getElementById("teacher-recent-exams-table");
  if (!overview.exams || overview.exams.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No assessments created yet. Click "+ New Assessment" to create one.</td></tr>`;
    return;
  }

  tbody.innerHTML = overview.exams
    .map((exam) => {
      const badgeClass =
        exam.status === "published"
          ? "badge-published"
          : exam.status === "closed"
          ? "badge-closed"
          : "badge-draft";

      return `
        <tr>
          <td><strong>${escapeHtml(exam.title)}</strong></td>
          <td><span class="badge ${badgeClass}">${exam.status.toUpperCase()}</span></td>
          <td>${exam.duration_minutes} mins</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="window.editExam('${exam.id}')">
              Edit / Manage
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

// Window helper for editing an existing exam
window.editExam = async (examId) => {
  try {
    await loadExamIntoBuilder(examId, currentUser.id);
    switchTeacherTab("builder");
  } catch (err) {
    alert("Failed to load exam: " + err.message);
  }
};

// ---------------------------------------------------------------------
// Teacher: Classes Tab
// ---------------------------------------------------------------------
async function refreshTeacherClasses() {
  if (!currentUser) return;
  const classes = await loadTeacherClasses(currentUser.id);
  const tbody = document.getElementById("teacher-classes-table");

  if (!classes || classes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No classes created yet. Use the form above to add a class.</td></tr>`;
    return;
  }

  tbody.innerHTML = classes
    .map(
      (c) => `
      <tr>
        <td><strong>${escapeHtml(c.name)}</strong></td>
        <td>
          <code style="font-weight: 700; color: var(--primary); background: var(--primary-light); padding: 4px 8px; border-radius: 4px;">
            ${escapeHtml(c.join_code)}
          </code>
        </td>
        <td>${c.student_count || 0} students</td>
        <td>${new Date(c.created_at).toLocaleDateString()}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="window.copyJoinCode('${c.join_code}')">
            Copy Code
          </button>
        </td>
      </tr>
    `
    )
    .join("");
}

window.copyJoinCode = (code) => {
  navigator.clipboard.writeText(code);
  alert(`Join code "${code}" copied to clipboard! Share this with your students.`);
};

// Handle create class form
document.getElementById("form-create-class")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("class-name").value.trim();
  const customCode = document.getElementById("class-code").value.trim();
  const submitBtn = document.getElementById("btn-save-class");

  try {
    submitBtn.disabled = true;
    await createClass(currentUser.id, name, customCode);
    alert(`Class "${name}" created successfully!`);
    document.getElementById("form-create-class").reset();
    await refreshTeacherClasses();
  } catch (err) {
    alert("Failed to create class: " + err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------
// Teacher: Exam Builder Tab
// ---------------------------------------------------------------------
async function prepareBuilderClassDropdown() {
  if (!currentUser) return;
  const classes = await loadTeacherClasses(currentUser.id);
  const select = document.getElementById("builder-class");

  select.innerHTML = '<option value="">Select a class...</option>';
  classes.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.join_code})`;
    if (currentBuilderExam.class_id === c.id) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

function renderBuilderUI() {
  // Sync form inputs
  document.getElementById("builder-title").value = currentBuilderExam.title || "";
  document.getElementById("builder-duration").value = currentBuilderExam.duration_minutes || 30;
  document.getElementById("builder-instructions").value = currentBuilderExam.instructions || "";
  document.getElementById("builder-status").value = currentBuilderExam.status || "draft";
  if (currentBuilderExam.class_id) {
    document.getElementById("builder-class").value = currentBuilderExam.class_id;
  }

  // Builder stats
  const totalQuestions = currentBuilderExam.questions.length;
  const totalMarks = currentBuilderExam.questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
  document.getElementById("builder-stat-q-count").textContent = totalQuestions;
  document.getElementById("builder-stat-marks").textContent = totalMarks;

  // Questions list container
  const container = document.getElementById("builder-questions-list");
  if (totalQuestions === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px; color: var(--text-muted); background: var(--bg-subtle); border-radius: var(--radius-sm);">
        No questions added yet. Click "+ Add Question" to start building your assessment.
      </div>
    `;
    return;
  }

  container.innerHTML = currentBuilderExam.questions
    .map((q, idx) => {
      let typeLabel = "MCQ";
      if (q.type === "true_false") typeLabel = "True / False";
      if (q.type === "short_answer") typeLabel = "Short Answer";
      if (q.type === "descriptive") typeLabel = "Descriptive";

      return `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 14px 18px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-surface);">
          <div>
            <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
              <span style="font-weight: 700; color: var(--primary);">Q${idx + 1}</span>
              <span class="badge badge-draft">${typeLabel}</span>
              <span style="font-size: 0.825rem; color: var(--text-muted);">${q.marks} mark${q.marks > 1 ? "s" : ""}</span>
            </div>
            <div style="font-size: 0.95rem; font-weight: 500; color: var(--text-main);">
              ${escapeHtml(q.prompt)}
            </div>
          </div>
          <div>
            <button class="btn btn-danger btn-sm" onclick="window.removeBuilderQuestion(${idx})">
              Remove
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

window.removeBuilderQuestion = (index) => {
  if (confirm("Remove this question?")) {
    removeQuestionFromBuilder(index);
    renderBuilderUI();
  }
};

// Builder Save Draft & Publish
document.getElementById("btn-save-draft")?.addEventListener("click", async () => {
  await handleSaveExam("draft");
});

document.getElementById("btn-publish-exam")?.addEventListener("click", async () => {
  // Confirm publishing
  if (confirm("Are you sure you want to publish this assessment? Enrolled students will immediately be able to take it.")) {
    await handleSaveExam("published");
  }
});

async function handleSaveExam(targetStatus) {
  // Collect latest inputs from form into builder state
  currentBuilderExam.title = document.getElementById("builder-title").value.trim();
  currentBuilderExam.class_id = document.getElementById("builder-class").value;
  currentBuilderExam.duration_minutes = Number(document.getElementById("builder-duration").value) || 30;
  currentBuilderExam.instructions = document.getElementById("builder-instructions").value.trim();
  currentBuilderExam.status = targetStatus;

  // Validate exam
  const validation = validateExam(currentBuilderExam, currentBuilderExam.questions);
  if (!validation.valid) {
    alert("Validation Error: " + validation.error);
    return;
  }

  try {
    await saveExam(currentUser.id, targetStatus);
    alert(
      targetStatus === "published"
        ? "Assessment successfully published to students!"
        : "Assessment saved as draft."
    );
    switchTeacherTab("overview");
  } catch (err) {
    alert("Failed to save assessment: " + err.message);
  }
}

// ---------------------------------------------------------------------
// Teacher: Results & Manual Grading Tab
// ---------------------------------------------------------------------
async function refreshTeacherResults() {
  if (!currentUser) return;

  const attempts = await loadTeacherExamAttempts(currentUser.id);
  const tbody = document.getElementById("teacher-submissions-table");

  if (!attempts || attempts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No student attempts found yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = attempts
    .map((att) => {
      const studentName = att.profiles?.display_name || "Student " + att.student_id.substring(0, 5);
      const examTitle = att.exams?.title || "Assessment";
      const isGraded = att.status === "graded";
      const statusBadge = isGraded
        ? `<span class="badge badge-graded">GRADED</span>`
        : `<span class="badge badge-pending">NEEDS GRADING</span>`;

      return `
        <tr>
          <td><strong>${escapeHtml(studentName)}</strong></td>
          <td>${escapeHtml(examTitle)}</td>
          <td>
            <span style="font-weight: 700;">${att.score !== null ? att.score : "—"} marks</span>
          </td>
          <td>${statusBadge}</td>
          <td>${att.submitted_at ? new Date(att.submitted_at).toLocaleString() : "In Progress"}</td>
          <td>
            <button class="btn btn-primary btn-sm" onclick="window.openGradingModal('${att.id}')">
              Review & Grade
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

// Open grading modal for a student attempt
window.openGradingModal = async (attemptId) => {
  try {
    const data = await loadAttemptForGrading(attemptId);
    if (!data) return;

    currentAttemptGrading = data;

    const studentName = data.attempt.profiles?.display_name || "Student";
    const examTitle = data.attempt.exams?.title || "Exam";

    document.getElementById("grading-modal-title").textContent = `Review: ${examTitle}`;
    document.getElementById("grading-modal-student").textContent = `Student: ${studentName}`;

    const container = document.getElementById("grading-questions-container");
    container.innerHTML = data.gradedItems
      .map((item, idx) => {
        const q = item.question;
        const studentAns = item.studentAnswer !== null && item.studentAnswer !== undefined
          ? String(item.studentAnswer)
          : "<em>(No answer submitted)</em>";
        const isDescriptive = q.type === "descriptive";

        return `
          <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; background: var(--bg-surface);">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="font-weight: 700; color: var(--primary);">Q${idx + 1} (${q.type.toUpperCase()})</span>
              <span class="badge badge-draft">Max Marks: ${q.marks}</span>
            </div>
            <div style="font-size: 0.95rem; font-weight: 600; margin-bottom: 12px;">
              ${escapeHtml(q.prompt)}
            </div>

            <div style="background: var(--bg-subtle); padding: 10px 14px; border-radius: var(--radius-sm); margin-bottom: 10px;">
              <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Student Answer:</div>
              <div style="font-size: 0.925rem; margin-top: 4px;">${escapeHtml(studentAns)}</div>
            </div>

            ${
              q.answer_key
                ? `
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px 14px; border-radius: var(--radius-sm); margin-bottom: 10px;">
                <div style="font-size: 0.8rem; font-weight: 700; color: #166534; text-transform: uppercase;">Expected Answer / Rubric:</div>
                <div style="font-size: 0.9rem; color: #14532d; margin-top: 4px;">${escapeHtml(String(q.answer_key))}</div>
              </div>`
                : ""
            }

            <div style="display: flex; gap: 16px; align-items: flex-end; margin-top: 12px; flex-wrap: wrap;">
              <div style="width: 140px;">
                <label style="font-size: 0.8rem; font-weight: 600; display: block; margin-bottom: 4px;">Award Marks</label>
                <input type="number" 
                       class="form-control grading-mark-input" 
                       data-index="${idx}" 
                       min="0" 
                       max="${q.marks}" 
                       step="0.5" 
                       value="${item.awardedMarks !== null ? item.awardedMarks : 0}">
              </div>
              <div style="flex: 1; min-width: 250px;">
                <label style="font-size: 0.8rem; font-weight: 600; display: block; margin-bottom: 4px;">Teacher Feedback</label>
                <input type="text" 
                       class="form-control grading-feedback-input" 
                       data-index="${idx}" 
                       placeholder="Add constructive comments..." 
                       value="${escapeHtml(item.feedback || "")}">
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    updateGradingModalTotal();

    // Attach mark input change listeners
    document.querySelectorAll(".grading-mark-input").forEach((input) => {
      input.addEventListener("input", updateGradingModalTotal);
    });

    // Open modal
    openModal("modal-grading");
  } catch (err) {
    alert("Failed to load attempt for grading: " + err.message);
  }
};

function updateGradingModalTotal() {
  let totalAwarded = 0;
  let totalPossible = 0;

  if (!currentAttemptGrading) return;

  const inputs = document.querySelectorAll(".grading-mark-input");
  inputs.forEach((input) => {
    const idx = Number(input.getAttribute("data-index"));
    const maxMarks = Number(currentAttemptGrading.gradedItems[idx]?.question.marks) || 0;
    let val = Number(input.value) || 0;

    // Constrain marks between 0 and max
    if (val < 0) val = 0;
    if (val > maxMarks) val = maxMarks;
    input.value = val;

    totalAwarded += val;
    totalPossible += maxMarks;
  });

  document.getElementById("grading-modal-total-score").textContent = `${totalAwarded} / ${totalPossible} marks`;
}

// Save grading submission
document.getElementById("btn-save-grades-submit")?.addEventListener("click", async () => {
  if (!currentAttemptGrading) return;

  try {
    const updates = currentAttemptGrading.gradedItems.map((item, idx) => {
      const markInput = document.querySelector(`.grading-mark-input[data-index="${idx}"]`);
      const feedbackInput = document.querySelector(`.grading-feedback-input[data-index="${idx}"]`);

      return {
        answerId: item.answer?.id,
        awardedMarks: Number(markInput.value) || 0,
        maxMarks: item.question.marks,
        feedback: feedbackInput ? feedbackInput.value : "",
      };
    });

    await saveManualGrading(currentAttemptGrading.attempt.id, currentUser.id, updates);
    alert("Grading saved successfully!");
    closeModal("modal-grading");
    await refreshTeacherResults();
  } catch (err) {
    alert("Failed to save grading: " + err.message);
  }
});

// Release results to student
document.getElementById("btn-release-results-action")?.addEventListener("click", async () => {
  if (!currentAttemptGrading) return;

  if (confirm("Release results to students? Students will immediately be able to view their scores, correct answers, and feedback.")) {
    try {
      await releaseExamResults(currentAttemptGrading.attempt.exam_id, currentUser.id);
      alert("Results released to students successfully!");
      closeModal("modal-grading");
      await refreshTeacherResults();
    } catch (err) {
      alert("Failed to release results: " + err.message);
    }
  }
});

// =====================================================================
// 5. STUDENT WORKSPACE CONTROLLER
// =====================================================================

function setupStudentNavigation() {
  const navButtons = document.querySelectorAll("[data-student-tab]");
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabName = btn.getAttribute("data-student-tab");
      switchStudentTab(tabName);
    });
  });
}

async function switchStudentTab(tabName) {
  // Update sidebar active classes
  document.querySelectorAll("[data-student-tab]").forEach((btn) => {
    if (btn.getAttribute("data-student-tab") === tabName) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Hide all student panes
  document.getElementById("pane-student-exams").style.display = "none";
  document.getElementById("pane-student-join").style.display = "none";
  document.getElementById("pane-student-results").style.display = "none";

  if (tabName === "exams") {
    contextBadge.textContent = "/ STUDENT";
    document.getElementById("pane-student-exams").style.display = "block";
    await refreshStudentExams();
  } else if (tabName === "join") {
    contextBadge.textContent = "/ JOIN CLASS";
    document.getElementById("pane-student-join").style.display = "block";
    await refreshStudentEnrolledClasses();
  } else if (tabName === "results") {
    contextBadge.textContent = "/ RESULTS";
    document.getElementById("pane-student-results").style.display = "block";
    await refreshStudentResults();
  }
}

// ---------------------------------------------------------------------
// Student: Available Exams
// ---------------------------------------------------------------------
async function refreshStudentExams() {
  if (!currentUser) return;
  const dashboard = await loadStudentDashboard(currentUser.id);
  const grid = document.getElementById("student-exams-grid");

  if (!dashboard.exams || dashboard.exams.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: var(--bg-surface); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
        <p style="font-size: 1.1rem; font-weight: 600; color: var(--text-main);">No exams available yet</p>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 6px;">
          Join a class with your instructor's code to view assigned assessments.
        </p>
        <button class="btn btn-primary" style="margin-top: 16px;" onclick="document.querySelector('[data-student-tab=\\'join\\']').click()">
          Join a Class
        </button>
      </div>
    `;
    return;
  }

  // Map of student's completed attempts
  const attemptMap = new Map();
  dashboard.myAttempts.forEach((a) => attemptMap.set(a.exam_id, a));

  grid.innerHTML = dashboard.exams
    .map((exam) => {
      const attempt = attemptMap.get(exam.id);
      const isSubmitted = attempt && (attempt.status === "submitted" || attempt.status === "graded");

      return `
        <div class="content-card" style="display: flex; flex-direction: column; justify-content: space-between; margin-bottom: 0;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
              <span class="badge badge-published">${escapeHtml(exam.classes?.name || "Class")}</span>
              <span style="font-size: 0.85rem; color: var(--text-muted);">${exam.duration_minutes} Minutes</span>
            </div>
            <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
              ${escapeHtml(exam.title)}
            </h3>
            <p style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 16px;">
              ${escapeHtml(exam.instructions || "Standard examination. Answer all questions.")}
            </p>
          </div>

          <div>
            ${
              isSubmitted
                ? `<button class="btn btn-secondary" style="width: 100%;" disabled>Already Submitted</button>`
                : `<button class="btn btn-primary" style="width: 100%;" onclick="window.startExamAttempt('${exam.id}')">Start Assessment</button>`
            }
          </div>
        </div>
      `;
    })
    .join("");
}

// ---------------------------------------------------------------------
// Student: Join Class
// ---------------------------------------------------------------------
async function refreshStudentEnrolledClasses() {
  if (!currentUser) return;
  const dashboard = await loadStudentDashboard(currentUser.id);
  const list = document.getElementById("student-enrolled-classes-list");

  if (!dashboard.classes || dashboard.classes.length === 0) {
    list.innerHTML = `<li style="color: var(--text-muted); font-size: 0.9rem;">You are not enrolled in any classes yet.</li>`;
    return;
  }

  list.innerHTML = dashboard.classes
    .map(
      (c) => `
      <li style="padding: 10px 14px; background: var(--bg-subtle); border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center;">
        <strong>${escapeHtml(c.name)}</strong>
        <span class="badge badge-draft">Joined</span>
      </li>
    `
    )
    .join("");
}

document.getElementById("form-student-join")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = document.getElementById("input-join-code").value.trim();
  const btn = document.getElementById("btn-join-class-submit");

  try {
    btn.disabled = true;
    await joinClassByCode(currentUser.id, code);
    alert("Successfully joined class!");
    document.getElementById("form-student-join").reset();
    await refreshStudentEnrolledClasses();
    await refreshStudentExams();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
});

// ---------------------------------------------------------------------
// Student: My Results
// ---------------------------------------------------------------------
async function refreshStudentResults() {
  if (!currentUser) return;
  const dashboard = await loadStudentDashboard(currentUser.id);
  const tbody = document.getElementById("student-results-table");

  if (!dashboard.myAttempts || dashboard.myAttempts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No attempts recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = dashboard.myAttempts
    .map((att) => {
      const isReleased = Boolean(att.exams?.results_released_at);
      const examTitle = att.exams?.title || "Exam";
      const submittedDate = att.submitted_at ? new Date(att.submitted_at).toLocaleDateString() : "In progress";

      let statusBadge = `<span class="badge badge-pending">PENDING RELEASE</span>`;
      let scoreDisplay = "Pending";
      let actionBtn = `<button class="btn btn-secondary btn-sm" disabled>Pending Release</button>`;

      if (isReleased) {
        statusBadge = `<span class="badge badge-published">RELEASED</span>`;
        scoreDisplay = `<strong>${att.score !== null ? att.score : 0} marks</strong>`;
        actionBtn = `
          <button class="btn btn-primary btn-sm" onclick="window.viewReleasedResult('${att.id}')">
            View Answer Review
          </button>
        `;
      }

      return `
        <tr>
          <td><strong>${escapeHtml(examTitle)}</strong></td>
          <td>${submittedDate}</td>
          <td>${statusBadge}</td>
          <td>${scoreDisplay}</td>
          <td>${actionBtn}</td>
        </tr>
      `;
    })
    .join("");
}

// Student Review Modal
window.viewReleasedResult = async (attemptId) => {
  try {
    const data = await loadStudentAttemptReview(attemptId, currentUser.id);
    if (!data || !data.isReleased) {
      alert("Results have not yet been released by your instructor.");
      return;
    }

    document.getElementById("student-review-modal-title").textContent = `Review: ${data.attempt.exams?.title || "Exam"}`;
    document.getElementById("student-review-score-summary").textContent = `Total Score: ${data.attempt.score} marks`;

    const container = document.getElementById("student-review-container");
    container.innerHTML = data.reviewItems
      .map((item, idx) => {
        const isCorrect = item.is_correct;
        const badge =
          isCorrect === true
            ? `<span class="badge badge-published">Correct (+${item.awarded_marks})</span>`
            : isCorrect === false
            ? `<span class="badge badge-draft" style="color: var(--danger);">Incorrect (0/${item.marks})</span>`
            : `<span class="badge badge-pending">Awarded: ${item.awarded_marks}/${item.marks}</span>`;

        return `
          <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px; background: var(--bg-surface);">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="font-weight: 700; color: var(--primary);">Question ${idx + 1}</span>
              ${badge}
            </div>

            <div style="font-weight: 600; margin-bottom: 12px; font-size: 1rem;">
              ${escapeHtml(item.prompt)}
            </div>

            <div style="background: var(--bg-subtle); padding: 10px 14px; border-radius: var(--radius-sm); margin-bottom: 8px;">
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Your Answer:</span>
              <p style="margin-top: 4px; font-size: 0.95rem;">${escapeHtml(item.student_answer !== null ? String(item.student_answer) : "(No answer provided)")}</p>
            </div>

            ${
              item.answer_key
                ? `
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px 14px; border-radius: var(--radius-sm); margin-bottom: 8px;">
                <span style="font-size: 0.8rem; font-weight: 700; color: #166534; text-transform: uppercase;">Correct Answer:</span>
                <p style="margin-top: 4px; font-size: 0.95rem; color: #14532d;">${escapeHtml(String(item.answer_key))}</p>
              </div>`
                : ""
            }

            ${
              item.feedback
                ? `
              <div style="background: var(--info-bg); border: 1px solid #bae6fd; padding: 10px 14px; border-radius: var(--radius-sm); margin-top: 8px;">
                <span style="font-size: 0.8rem; font-weight: 700; color: #0369a1; text-transform: uppercase;">Teacher Feedback:</span>
                <p style="margin-top: 4px; font-size: 0.9rem; color: #075985;">${escapeHtml(item.feedback)}</p>
              </div>`
                : ""
            }
          </div>
        `;
      })
      .join("");

    openModal("modal-student-review");
  } catch (err) {
    alert("Could not load review: " + err.message);
  }
};

// =====================================================================
// 6. FOCUSED EXAM ATTEMPT RUNNER
// =====================================================================

window.startExamAttempt = async (examId) => {
  if (!confirm("Start assessment now? Once started, your timer will begin.")) {
    return;
  }

  try {
    const attemptData = await startOrResumeExam(currentUser.id, examId);
    showAttemptScreen();
    initializeAttemptView(attemptData);
  } catch (err) {
    alert("Could not start exam: " + err.message);
  }
};

function initializeAttemptView(attemptData) {
  document.getElementById("attempt-exam-title").textContent = attemptData.exam.title;
  renderQuestionNavBar();
  renderCurrentQuestion();
  startCountdownTimer();
}

function startCountdownTimer() {
  if (activeAttempt.timerInterval) {
    clearInterval(activeAttempt.timerInterval);
  }

  const timerBox = document.getElementById("attempt-timer-box");
  const timerDigits = document.getElementById("attempt-timer-digits");

  function updateTimer() {
    const time = calculateRemainingTime(activeAttempt.startedAt, activeAttempt.exam.duration_minutes);
    timerDigits.textContent = formatTime(time.totalSecondsRemaining);

    // Warning styling when less than 5 minutes remain
    if (time.totalSecondsRemaining < 300) {
      timerBox.classList.add("warning");
    } else {
      timerBox.classList.remove("warning");
    }

    // Auto-submit when time expires
    if (time.isExpired) {
      clearInterval(activeAttempt.timerInterval);
      alert("Time has expired! Submitting your exam automatically...");
      finishExamAttempt(true);
    }
  }

  updateTimer();
  activeAttempt.timerInterval = setInterval(updateTimer, 1000);
}

function renderQuestionNavBar() {
  const navBar = document.getElementById("attempt-nav-bar");
  navBar.innerHTML = activeAttempt.questions
    .map((q, idx) => {
      const isCurrent = idx === activeAttempt.currentQuestionIndex;
      const isAnswered =
        activeAttempt.answers[q.id] !== undefined &&
        activeAttempt.answers[q.id] !== null &&
        String(activeAttempt.answers[q.id]).trim().length > 0;

      let classes = "nav-q-btn";
      if (isCurrent) classes += " current";
      if (isAnswered) classes += " answered";

      return `
        <button class="${classes}" onclick="window.goToAttemptQuestion(${idx})">
          ${idx + 1}
        </button>
      `;
    })
    .join("");
}

window.goToAttemptQuestion = (index) => {
  activeAttempt.currentQuestionIndex = index;
  renderQuestionNavBar();
  renderCurrentQuestion();
};

function renderCurrentQuestion() {
  const total = activeAttempt.questions.length;
  const idx = activeAttempt.currentQuestionIndex;
  const q = activeAttempt.questions[idx];

  // Progress pill
  document.getElementById("attempt-q-progress").textContent = `Question ${idx + 1} of ${total}`;
  document.getElementById("attempt-q-number").textContent = `Question ${idx + 1}`;
  document.getElementById("attempt-q-marks").textContent = `${q.marks} Mark${q.marks > 1 ? "s" : ""}`;
  document.getElementById("attempt-q-prompt").textContent = q.prompt;

  // Render question controls
  const controls = document.getElementById("attempt-answer-controls");
  const currentVal = activeAttempt.answers[q.id];

  if (q.type === "mcq") {
    const options = Array.isArray(q.options) ? q.options : [];
    controls.innerHTML = `
      <div class="option-group">
        ${options
          .map(
            (opt, i) => `
          <label class="option-item ${currentVal === opt ? "selected" : ""}">
            <input type="radio" name="opt-${q.id}" value="${escapeHtml(opt)}" ${currentVal === opt ? "checked" : ""}>
            <span>${escapeHtml(opt)}</span>
          </label>
        `
          )
          .join("")}
      </div>
    `;

    controls.querySelectorAll('input[type="radio"]').forEach((radio) => {
      radio.addEventListener("change", (e) => {
        recordAnswer(q.id, e.target.value);
        renderQuestionNavBar();
        renderCurrentQuestion();
      });
    });
  } else if (q.type === "true_false") {
    controls.innerHTML = `
      <div style="display: flex; gap: 16px;">
        <label class="option-item ${currentVal === true || currentVal === "true" ? "selected" : ""}" style="flex: 1;">
          <input type="radio" name="tf-${q.id}" value="true" ${currentVal === true || currentVal === "true" ? "checked" : ""}>
          <strong>True</strong>
        </label>
        <label class="option-item ${currentVal === false || currentVal === "false" ? "selected" : ""}" style="flex: 1;">
          <input type="radio" name="tf-${q.id}" value="false" ${currentVal === false || currentVal === "false" ? "checked" : ""}>
          <strong>False</strong>
        </label>
      </div>
    `;

    controls.querySelectorAll('input[type="radio"]').forEach((radio) => {
      radio.addEventListener("change", (e) => {
        recordAnswer(q.id, e.target.value === "true");
        renderQuestionNavBar();
        renderCurrentQuestion();
      });
    });
  } else if (q.type === "short_answer") {
    controls.innerHTML = `
      <div class="form-group">
        <input type="text" class="form-control" id="short-ans-input" placeholder="Type your answer here..." value="${escapeHtml(currentVal || "")}">
      </div>
    `;
    const input = document.getElementById("short-ans-input");
    input.addEventListener("input", (e) => {
      recordAnswer(q.id, e.target.value);
      renderQuestionNavBar();
    });
  } else if (q.type === "descriptive") {
    controls.innerHTML = `
      <div class="form-group">
        <textarea class="form-control" id="desc-ans-input" rows="5" placeholder="Write your full explanatory answer here...">${escapeHtml(currentVal || "")}</textarea>
      </div>
    `;
    const textarea = document.getElementById("desc-ans-input");
    textarea.addEventListener("input", (e) => {
      recordAnswer(q.id, e.target.value);
      renderQuestionNavBar();
    });
  }

  // Prev / Next button states
  document.getElementById("btn-attempt-prev").disabled = idx === 0;
  document.getElementById("btn-attempt-next").disabled = idx === total - 1;
}

// Attempt buttons
document.getElementById("btn-attempt-prev")?.addEventListener("click", () => {
  if (activeAttempt.currentQuestionIndex > 0) {
    activeAttempt.currentQuestionIndex--;
    renderQuestionNavBar();
    renderCurrentQuestion();
  }
});

document.getElementById("btn-attempt-next")?.addEventListener("click", () => {
  if (activeAttempt.currentQuestionIndex < activeAttempt.questions.length - 1) {
    activeAttempt.currentQuestionIndex++;
    renderQuestionNavBar();
    renderCurrentQuestion();
  }
});

document.getElementById("btn-attempt-submit")?.addEventListener("click", async () => {
  // Check for unanswered questions
  let unansweredCount = 0;
  activeAttempt.questions.forEach((q) => {
    const ans = activeAttempt.answers[q.id];
    if (ans === undefined || ans === null || String(ans).trim().length === 0) {
      unansweredCount++;
    }
  });

  let message = "Are you sure you want to finish and submit your exam?";
  if (unansweredCount > 0) {
    message = `You have ${unansweredCount} unanswered question(s). Are you sure you want to submit?`;
  }

  if (confirm(message)) {
    await finishExamAttempt(false);
  }
});

async function finishExamAttempt(autoSubmitted = false) {
  try {
    const res = await submitExam(currentUser.id, autoSubmitted);
    alert("Exam submitted successfully!");
    showStudentWorkspace();
    switchStudentTab("results");
  } catch (err) {
    alert("Submission error: " + err.message);
  }
}

// =====================================================================
// 7. MODALS & FORMS HELPER
// =====================================================================

function setupModals() {
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modalId = btn.getAttribute("data-close-modal");
      closeModal(modalId);
    });
  });

  // Open Add Question modal
  document.getElementById("btn-open-add-q-modal")?.addEventListener("click", () => {
    resetAddQuestionForm();
    openModal("modal-add-question");
  });

  // Dynamic question type selector in modal
  document.getElementById("q-type")?.addEventListener("change", (e) => {
    renderDynamicQuestionTypeFields(e.target.value);
  });
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = "flex";
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = "none";
}

function resetAddQuestionForm() {
  document.getElementById("form-add-question").reset();
  document.getElementById("q-type").value = "mcq";
  renderDynamicQuestionTypeFields("mcq");
}

function renderDynamicQuestionTypeFields(type) {
  const container = document.getElementById("q-dynamic-type-fields");

  if (type === "mcq") {
    container.innerHTML = `
      <div class="form-group">
        <label>Options & Select Correct Answer *</label>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${[0, 1, 2, 3]
            .map(
              (i) => `
            <div style="display: flex; align-items: center; gap: 10px;">
              <input type="radio" name="mcq-correct-choice" value="${i}" ${i === 0 ? "checked" : ""} title="Mark as correct answer">
              <input type="text" class="form-control mcq-option-input" placeholder="Option ${i + 1}" required>
            </div>
          `
            )
            .join("")}
        </div>
        <div class="form-help">Select the radio button next to the option that is the correct answer.</div>
      </div>
    `;
  } else if (type === "true_false") {
    container.innerHTML = `
      <div class="form-group">
        <label>Correct Answer *</label>
        <div style="display: flex; gap: 20px;">
          <label style="display: flex; align-items: center; gap: 6px;">
            <input type="radio" name="tf-correct-choice" value="true" checked> True
          </label>
          <label style="display: flex; align-items: center; gap: 6px;">
            <input type="radio" name="tf-correct-choice" value="false"> False
          </label>
        </div>
      </div>
    `;
  } else if (type === "short_answer") {
    container.innerHTML = `
      <div class="form-group">
        <label for="short-correct-key">Expected Correct Answer *</label>
        <input type="text" id="short-correct-key" class="form-control" placeholder="e.g. HyperText Markup Language" required>
        <div class="form-help">Evaluated with case-insensitive exact matching.</div>
      </div>
    `;
  } else if (type === "descriptive") {
    container.innerHTML = `
      <div class="form-group">
        <label for="desc-rubric">Marking Rubric / Key Points</label>
        <textarea id="desc-rubric" class="form-control" rows="3" placeholder="Key concepts or keywords students should include to earn full marks."></textarea>
      </div>
    `;
  }
}

function setupFormListeners() {
  // Add question form submit
  document.getElementById("form-add-question")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const type = document.getElementById("q-type").value;
    const prompt = document.getElementById("q-prompt").value.trim();
    const marks = Number(document.getElementById("q-marks").value) || 1;
    const explanation = document.getElementById("q-explanation").value.trim();

    let options = null;
    let answer_key = null;

    if (type === "mcq") {
      const optionInputs = document.querySelectorAll(".mcq-option-input");
      options = Array.from(optionInputs).map((input) => input.value.trim());

      const selectedRadio = document.querySelector('input[name="mcq-correct-choice"]:checked');
      const selectedIndex = selectedRadio ? Number(selectedRadio.value) : 0;
      answer_key = options[selectedIndex];
    } else if (type === "true_false") {
      const selectedRadio = document.querySelector('input[name="tf-correct-choice"]:checked');
      answer_key = selectedRadio ? selectedRadio.value === "true" : true;
    } else if (type === "short_answer") {
      answer_key = document.getElementById("short-correct-key").value.trim();
    } else if (type === "descriptive") {
      answer_key = document.getElementById("desc-rubric")?.value.trim() || null;
    }

    try {
      addQuestionToBuilder({
        type,
        prompt,
        marks,
        options,
        answer_key,
        explanation,
      });

      renderBuilderUI();
      closeModal("modal-add-question");
    } catch (err) {
      alert("Validation failed: " + err.message);
    }
  });
}

/**
 * Escapes HTML characters to prevent XSS.
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
