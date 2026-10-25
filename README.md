Site url :- https://quiz-master-ap35.onrender.com


# QuizMaster — Teacher-Student Examination & Quiz Management System

A lightweight, production-ready educational SaaS mini-project built with **HTML5, Modern CSS, and Vanilla JavaScript**, powered by **Supabase PostgreSQL & Supabase Auth** with robust **Row Level Security (RLS)**.

---

## 🌟 Key Features

- **Role-Based Workspaces**: Distinct teacher and student dashboards with database-enforced roles (`teacher` vs `student`).
- **Class & Enrollment System**: Teachers create classes and generate unique join codes; students join classes seamlessly.
- **Assessment Builder**:
  - Multiple question formats: **Single-choice MCQ**, **True/False**, **Short Answer**, and **Long Descriptive**.
  - Real-time question and total marks calculator.
  - Draft vs Published status controls with pre-flight validation preventing publishing invalid or incomplete questions.
- **Distraction-Free Exam Attempt Runner**:
  - Focused layout with question navigator, progress indicator, and answer selection.
  - Active countdown timer with low-time warning and automatic submission upon expiration.
  - Submit confirmation dialog warning of any unanswered questions.
- **Hybrid Auto & Manual Grading Engine**:
  - **Objective Auto-Grading**: MCQ, True/False, and case-insensitive Short Answer questions are auto-graded immediately.
  - **Teacher Manual Grading**: Teachers review student descriptive answers question-by-question, award marks within the question maximum, and leave personalized constructive feedback.
  - **Controlled Result Release**: Answer keys and explanations remain strictly hidden from students until the teacher explicitly releases the exam results.

---

## 📂 Project Architecture

```
Quiz-master/
├── index.html                  # Single-page application layout with accessible tab-switching
├── css/
│   └── style.css               # Clean SaaS design (Navy #0f172a, Royal Blue #2563eb, Neutral #f8fafc)
├── js/
│   ├── config.js               # Supabase project URL & publishable key
│   ├── supabaseClient.js       # Supabase JS client initializer
│   ├── auth.js                 # Authentication service & role resolution from PostgreSQL
│   ├── quizEngine.js           # Pure testable functions (validation, grading, normalization, timer)
│   ├── teacher.js              # Teacher overview stats, class management, exam builder & grading
│   ├── student.js              # Student dashboard, joining classes, exam attempt & review
│   └── app.js                  # Main controller, tab switching, and modal listeners
├── supabase/
│   └── schema.sql              # Complete PostgreSQL DDL: tables, indexes, trigger, RPCs & RLS policies
├── tests/
│   └── quizEngine.test.js      # Automated unit tests for quizEngine functions
└── README.md                   # Documentation & Render deployment guide
```

---

## 🚀 Quick Local Setup

1. **Clone or Open the Folder** in VS Code:
   ```bash
   cd Quiz-master
   ```
2. **Run with Live Server**:
   - Right-click `index.html` in VS Code and select **"Open with Live Server"**.
   - Or start any static server:
     ```bash
     npx serve .
     ```
3. Open your browser at `http://localhost:5500` or `http://localhost:3000`.

---

## 🗄️ Supabase Database Setup

The project is pre-configured to connect to your Supabase project:
- **Project URL**: `https://zrulwcmhdgidgdjcvler.supabase.co`
- **Publishable Key**: Configured in `js/config.js`

### Step 1: Run the Database Schema
1. Open your [Supabase Dashboard](https://zrulwcmhdgidgdjcvler.supabase.co).
2. Navigate to **SQL Editor** in the left sidebar.
3. Open the file `supabase/schema.sql` from this repository, copy its entire contents, paste it into the SQL Editor, and click **Run**.
4. Confirm in the **Table Editor** that the following tables exist:
   - `profiles`
   - `classes`
   - `class_members`
   - `exams`
   - `questions`
   - `attempts`
   - `answers`

### Step 2: Configure Authentication Settings
1. Go to **Authentication** > **Providers** > **Email**.
2. For testing convenience, you can disable "Confirm email" so test users can log in immediately upon sign-up.

### Step 3: Create Teacher & Student Accounts
1. In the app, switch to **Create Account** and choose either **Teacher** or **Student**.
2. Teacher sign-ups require the private invitation code configured in `supabase/schema.sql`; student sign-ups do not require a code.
3. Existing accounts can still be promoted manually with this query in the **Supabase SQL Editor**:
   ```sql
   UPDATE public.profiles
   SET role = 'teacher'
   WHERE id = (SELECT id FROM auth.users WHERE email = 'teacher@example.com');
   ```

---

## 🎬 End-to-End Demo Script (Milestone 8)

1. **Teacher Sign-In**:
   - Select **Teacher Portal**, enter `teacher@example.com`, and sign in.
   - Go to **My Classes** tab and click **Create Class** (e.g. `CS101: Web Basics`). Note the generated Join Code (e.g. `WEB101`).
2. **Build & Publish Exam**:
   - Go to **Exam Builder** tab.
   - Enter title: `JavaScript Essentials Quiz`, select `CS101`, and set duration to `15` minutes.
   - Click **+ Add Question** and add:
     - **Q1 (MCQ, 2 marks)**: "Which keyword declares a block-scoped constant?" -> Options: `var`, `let`, `const`, `def` -> Mark `const` as correct.
     - **Q2 (True/False, 1 mark)**: "JavaScript is executed in a single-threaded event loop." -> Select `True`.
     - **Q3 (Short Answer, 2 marks)**: "What does DOM stand for?" -> Expected: `Document Object Model`.
     - **Q4 (Descriptive, 5 marks)**: "Explain the difference between let, const, and var." -> Rubric: `let and const are block scoped, var is function scoped`.
   - Click **Publish Exam**.
3. **Student Attempt**:
   - Sign out and sign in with `student@example.com` via **Student Portal**.
   - In **Join a Class** tab, enter code `WEB101` and click **Join Class**.
   - In **Available Exams**, find `JavaScript Essentials Quiz` and click **Start Assessment**.
   - Notice the focused attempt interface, question navigation pills, and active countdown timer.
   - Answer the questions and click **Submit Exam**.
4. **Teacher Evaluation**:
   - Sign back in as `teacher@example.com` and go to **Results & Grading** tab.
   - Find the student's submission (Status: `NEEDS GRADING`).
   - Click **Review & Grade**:
     - Notice Q1, Q2, and Q3 are already auto-graded!
     - Review Q4 (Descriptive answer), enter awarded marks (e.g. `4.5 / 5`), and provide feedback.
     - Click **Save Grading**.
     - Click **Release Results to Student**.
5. **Student View Results**:
   - Sign back in as student and open **My Results** tab.
   - Notice the status is now `RELEASED`.
   - Click **View Answer Review** to see the full breakdown: student answers, correct answer keys, teacher feedback, and final percentage!

---

## 🛡️ Security & Integrity (Milestone 7 Pass)

| Security Requirement | Implementation |
|---|---|
| **Answer Key Protection** | RLS policy on `questions` table restricts direct `SELECT` to the exam's teacher only. Students fetch questions via secure RPC `get_student_exam_questions()`, which completely excludes `answer_key` and `explanation`. |
| **Tamper-Proof Roles** | Roles are stored in `public.profiles` with RLS preventing clients from updating their own `role` column. Public sign-up trigger always defaults to `student`. |
| **Attempt Isolation** | Students can only read and write their own attempt records (`auth.uid() = student_id`). |
| **Score Protection** | Students cannot modify `score`, `awarded_marks`, or `is_correct` in the database. |
| **Timer Limitation** | As noted in project guidelines, the browser timer is a UX feature for responsive pacing; authoritative completion timestamps are recorded on the server via `submitted_at`. |

---

## 🌐 Render Deployment Guide (Step-by-Step)

Render provides free static site hosting with global CDN, custom domains, and automatic HTTPS.

### Step 1: Push Code to GitHub
1. Initialize Git in the project directory:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: QuizMaster mini project"
   ```
2. Create a new repository on [GitHub](https://github.com) named `quizmaster`.
3. Push your repository:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/quizmaster.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Deploy on Render
1. Log in to [Render](https://render.com).
2. Click **New +** > **Static Site**.
3. Connect your GitHub account and select the `quizmaster` repository.
4. Fill in the Static Site details:
   - **Name**: `quizmaster-app` (or any unique name)
   - **Branch**: `main`
   - **Build Command**: *(Leave empty - this is a pure Vanilla JS/HTML static app)*
   - **Publish Directory**: `.` (dot, representing the root directory containing `index.html`)
5. Click **Create Static Site**.
6. Render will publish your site in seconds and provide a live URL (e.g. `https://quizmaster-app.onrender.com`).

### Step 3: Update Supabase Authentication Redirect URLs
1. Open your [Supabase Dashboard](https://zrulwcmhdgidgdjcvler.supabase.co).
2. Go to **Authentication** > **URL Configuration**.
3. In **Site URL**, paste your Render live URL:
   ```
   https://quizmaster-app.onrender.com
   ```
4. In **Redirect URLs**, add:
   ```
   https://quizmaster-app.onrender.com/*
   http://localhost:5500/*
   http://localhost:3000/*
   ```
5. Click **Save Changes**. Your QuizMaster application is now fully deployed and functional worldwide!

---

## 🧪 Testing

To run the automated test suite for the quiz engine:
```bash
node tests/quizEngine.test.js
```
All 19 test assertions will run and report status in the terminal.
