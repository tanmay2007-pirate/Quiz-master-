-- =====================================================================
-- QuizMaster: Complete Database Schema & Row Level Security (RLS)
-- File: supabase/schema.sql
-- Description:
--   Complete PostgreSQL schema with UUID keys, CHECK constraints,
--   indexes, auto-profile trigger, least-privilege RLS policies,
--   and secure RPC functions to protect answer keys from students.
-- =====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 2. TABLES DEFINITION
-- =====================================================================

-- Table: profiles
-- Linked 1-to-1 with Supabase Auth users.
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('teacher', 'student')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: classes
-- Created and managed by teachers.
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    join_code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: class_members
-- Many-to-many relationship mapping students to enrolled classes.
CREATE TABLE IF NOT EXISTS public.class_members (
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (class_id, student_id)
);

-- Table: exams
-- Assessment configuration and state.
CREATE TABLE IF NOT EXISTS public.exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    instructions TEXT,
    duration_minutes INT NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    results_released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: questions
-- Question content, types, options, and answer keys.
CREATE TABLE IF NOT EXISTS public.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    position INT NOT NULL DEFAULT 1,
    type TEXT NOT NULL CHECK (type IN ('mcq', 'true_false', 'short_answer', 'descriptive')),
    prompt TEXT NOT NULL,
    marks INT NOT NULL DEFAULT 1 CHECK (marks > 0),
    options JSONB,        -- Array of options for MCQ e.g. ["Option A", "Option B"]
    answer_key JSONB,     -- Teacher's correct answer or marking rubric
    explanation TEXT,     -- Shown only after results are released
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: attempts
-- Represents a single student's attempt at an exam.
CREATE TABLE IF NOT EXISTS public.attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    submitted_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'graded')),
    score NUMERIC(5,2) DEFAULT 0 CHECK (score >= 0),
    graded_at TIMESTAMPTZ,
    UNIQUE (exam_id, student_id)
);

-- Table: answers
-- Individual student response to an exam question.
CREATE TABLE IF NOT EXISTS public.answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES public.attempts(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    answer JSONB,                -- Student's submitted answer
    awarded_marks NUMERIC(5,2) DEFAULT 0 CHECK (awarded_marks >= 0),
    is_correct BOOLEAN,          -- TRUE, FALSE, or NULL (for pending manual grading)
    feedback TEXT,               -- Teacher feedback for descriptive answers
    graded_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (attempt_id, question_id)
);

-- =====================================================================
-- 3. INDEXES FOR PERFORMANCE
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON public.classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_members_student ON public.class_members(student_id);
CREATE INDEX IF NOT EXISTS idx_exams_teacher ON public.exams(teacher_id);
CREATE INDEX IF NOT EXISTS idx_exams_class ON public.exams(class_id);
CREATE INDEX IF NOT EXISTS idx_questions_exam ON public.questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_attempts_exam ON public.attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_attempts_student ON public.attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_answers_attempt ON public.answers(attempt_id);

-- =====================================================================
-- 4. PROFILE TRIGGER
-- Public sign-up defaults to student. Teacher sign-up requires the
-- private invitation code checked below.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  requested_role TEXT;
  invitation_code TEXT;
  assigned_role TEXT;
BEGIN
  requested_role := COALESCE(new.raw_user_meta_data->>'requested_role', 'student');
  invitation_code := new.raw_user_meta_data->>'teacher_invitation_code';

  IF requested_role = 'teacher' AND invitation_code IS DISTINCT FROM 'Quiz-master' THEN
    RAISE EXCEPTION 'A valid teacher invitation code is required.';
  END IF;

  assigned_role := CASE
    WHEN requested_role = 'teacher' AND invitation_code = 'Quiz-master' THEN 'teacher'
    ELSE 'student'
  END;

  INSERT INTO public.profiles (id, display_name, role)
  VALUES (
    new.id,
    COALESCE(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1)
    ),
    assigned_role
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- =====================================================================
-- 5. HELPER FUNCTIONS
-- =====================================================================

-- Check if authenticated user is a teacher
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'teacher'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RPC: Create a class for the authenticated teacher
CREATE OR REPLACE FUNCTION public.create_teacher_class(
  p_name TEXT,
  p_join_code TEXT
)
RETURNS public.classes
AS $$
DECLARE
  created_class public.classes;
BEGIN
  IF NOT public.is_teacher() THEN
    RAISE EXCEPTION 'Only teacher accounts can create classes.';
  END IF;

  IF NULLIF(TRIM(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Class name is required.';
  END IF;

  IF NULLIF(TRIM(p_join_code), '') IS NULL THEN
    RAISE EXCEPTION 'Join code is required.';
  END IF;

  INSERT INTO public.classes (teacher_id, name, join_code)
  VALUES (auth.uid(), TRIM(p_name), UPPER(TRIM(p_join_code)))
  RETURNING * INTO created_class;

  RETURN created_class;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- RPC: Join class using join_code
CREATE OR REPLACE FUNCTION public.join_class(code TEXT)
RETURNS jsonb AS $$
DECLARE
  v_class_id UUID;
  v_class_name TEXT;
BEGIN
  SELECT id, name INTO v_class_id, v_class_name
  FROM public.classes
  WHERE UPPER(join_code) = UPPER(TRIM(code));

  IF v_class_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid join code. Class not found.');
  END IF;

  INSERT INTO public.class_members (class_id, student_id)
  VALUES (v_class_id, auth.uid())
  ON CONFLICT (class_id, student_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'class_id', v_class_id, 'class_name', v_class_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 6. ANSWER KEY SECURITY DESIGN
-- =====================================================================
-- Direct table policy on `questions` allows SELECT ONLY to the exam's teacher.
-- Students CANNOT query the `questions` table directly.
-- Instead, students fetch questions via `get_student_exam_questions()`
-- which strictly excludes `answer_key` and `explanation`.
-- When results are released, students fetch review data via `get_student_exam_review()`.

-- RPC: Fetch questions for student attempt (PROTECTS ANSWER KEY)
CREATE OR REPLACE FUNCTION public.get_student_exam_questions(p_exam_id UUID)
RETURNS TABLE (
  id UUID,
  exam_id UUID,
  "position" INT,
  type TEXT,
  prompt TEXT,
  marks INT,
  options JSONB
) AS $$
BEGIN
  -- Verify student is enrolled in class and exam is published
  IF NOT EXISTS (
    SELECT 1 FROM public.exams e
    JOIN public.class_members cm ON cm.class_id = e.class_id
    WHERE e.id = p_exam_id
      AND cm.student_id = auth.uid()
      AND e.status IN ('published', 'closed')
  ) THEN
    RAISE EXCEPTION 'Not authorized to view questions for this exam.';
  END IF;

  RETURN QUERY
  SELECT q.id, q.exam_id, q.position, q.type, q.prompt, q.marks, q.options
  FROM public.questions q
  WHERE q.exam_id = p_exam_id
  ORDER BY q.position ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Fetch exam review for student (ONLY AFTER RESULTS RELEASED)
CREATE OR REPLACE FUNCTION public.get_student_exam_review(p_attempt_id UUID)
RETURNS TABLE (
  question_id UUID,
  "position" INT,
  type TEXT,
  prompt TEXT,
  marks INT,
  options JSONB,
  student_answer JSONB,
  awarded_marks NUMERIC(5,2),
  is_correct BOOLEAN,
  feedback TEXT,
  answer_key JSONB,
  explanation TEXT,
  results_released BOOLEAN
) AS $$
DECLARE
  v_released_at TIMESTAMPTZ;
  v_student_id UUID;
BEGIN
  SELECT a.student_id, e.results_released_at
  INTO v_student_id, v_released_at
  FROM public.attempts a
  JOIN public.exams e ON e.id = a.exam_id
  WHERE a.id = p_attempt_id;

  IF v_student_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied. You can only view your own exam attempt.';
  END IF;

  RETURN QUERY
  SELECT
    q.id AS question_id,
    q.position,
    q.type,
    q.prompt,
    q.marks,
    q.options,
    ans.answer AS student_answer,
    ans.awarded_marks,
    ans.is_correct,
    ans.feedback,
    -- Answer key & explanation are ONLY revealed if teacher released results!
    CASE WHEN v_released_at IS NOT NULL THEN q.answer_key ELSE NULL END AS answer_key,
    CASE WHEN v_released_at IS NOT NULL THEN q.explanation ELSE NULL END AS explanation,
    (v_released_at IS NOT NULL) AS results_released
  FROM public.questions q
  LEFT JOIN public.answers ans ON ans.question_id = q.id AND ans.attempt_id = p_attempt_id
  JOIN public.attempts att ON att.id = p_attempt_id
  WHERE q.exam_id = att.exam_id
  ORDER BY q.position ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- RLS: profiles
-- ---------------------------------------------------------------------
CREATE POLICY "Profiles readable by authenticated users"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can update their own display name"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  -- Prevents changing one's own role from client
  AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
);

-- ---------------------------------------------------------------------
-- RLS: classes
-- ---------------------------------------------------------------------
CREATE POLICY "Teachers can do all operations on their own classes"
ON public.classes FOR ALL
TO authenticated
USING (teacher_id = auth.uid())
WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Students can view classes they belong to"
ON public.classes FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.class_members
    WHERE class_members.class_id = classes.id
      AND class_members.student_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------
-- RLS: class_members
-- ---------------------------------------------------------------------
CREATE POLICY "Students can view their class memberships"
ON public.class_members FOR SELECT
TO authenticated
USING (student_id = auth.uid());

CREATE POLICY "Teachers can view members in their classes"
ON public.class_members FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.classes
    WHERE classes.id = class_members.class_id
      AND classes.teacher_id = auth.uid()
  )
);

CREATE POLICY "Students can insert their own class membership"
ON public.class_members FOR INSERT
TO authenticated
WITH CHECK (student_id = auth.uid());

-- ---------------------------------------------------------------------
-- RLS: exams
-- ---------------------------------------------------------------------
CREATE POLICY "Teachers can manage their own exams"
ON public.exams FOR ALL
TO authenticated
USING (teacher_id = auth.uid())
WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Students can view published exams for their enrolled classes"
ON public.exams FOR SELECT
TO authenticated
USING (
  status IN ('published', 'closed')
  AND EXISTS (
    SELECT 1 FROM public.class_members
    WHERE class_members.class_id = exams.class_id
      AND class_members.student_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------
-- RLS: questions
-- Note: Answer key is kept secret: ONLY the teacher can SELECT questions table!
-- Students read safe questions through get_student_exam_questions() RPC.
-- ---------------------------------------------------------------------
CREATE POLICY "Teachers can manage questions for their exams"
ON public.questions FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.exams
    WHERE exams.id = questions.exam_id
      AND exams.teacher_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.exams
    WHERE exams.id = questions.exam_id
      AND exams.teacher_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------
-- RLS: attempts
-- ---------------------------------------------------------------------
CREATE POLICY "Teachers can view attempts on their exams"
ON public.attempts FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.exams
    WHERE exams.id = attempts.exam_id
      AND exams.teacher_id = auth.uid()
  )
);

CREATE POLICY "Students can view their own attempts"
ON public.attempts FOR SELECT
TO authenticated
USING (student_id = auth.uid());

CREATE POLICY "Students can insert their own attempts"
ON public.attempts FOR INSERT
TO authenticated
WITH CHECK (
  student_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.exams e
    JOIN public.class_members cm ON cm.class_id = e.class_id
    WHERE e.id = attempts.exam_id
      AND cm.student_id = auth.uid()
      AND e.status = 'published'
  )
);

CREATE POLICY "Students can update their own attempt on submission"
ON public.attempts FOR UPDATE
TO authenticated
USING (student_id = auth.uid())
WITH CHECK (student_id = auth.uid());

CREATE POLICY "Teachers can update attempts (for grading)"
ON public.attempts FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.exams
    WHERE exams.id = attempts.exam_id
      AND exams.teacher_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------
-- RLS: answers
-- ---------------------------------------------------------------------
CREATE POLICY "Teachers can view answers for their exams"
ON public.answers FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.attempts att
    JOIN public.exams ex ON ex.id = att.exam_id
    WHERE att.id = answers.attempt_id
      AND ex.teacher_id = auth.uid()
  )
);

CREATE POLICY "Students can view their own answers"
ON public.answers FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.attempts att
    WHERE att.id = answers.attempt_id
      AND att.student_id = auth.uid()
  )
);

CREATE POLICY "Students can insert answers for their own attempts"
ON public.answers FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.attempts att
    WHERE att.id = answers.attempt_id
      AND att.student_id = auth.uid()
      AND att.status = 'in_progress'
  )
);

CREATE POLICY "Students can update answers for their own in_progress attempts"
ON public.answers FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.attempts att
    WHERE att.id = answers.attempt_id
      AND att.student_id = auth.uid()
      AND att.status = 'in_progress'
  )
);

CREATE POLICY "Teachers can grade answers for their exams"
ON public.answers FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.attempts att
    JOIN public.exams ex ON ex.id = att.exam_id
    WHERE att.id = answers.attempt_id
      AND ex.teacher_id = auth.uid()
  )
);

-- =====================================================================
-- 8. DEMO PROMOTION HELPER (Execute after signing up demo teacher)
-- =====================================================================
-- To promote any account to teacher, run this in Supabase SQL Editor:
--
--   UPDATE public.profiles
--   SET role = 'teacher'
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'teacher@example.com');
--
-- =====================================================================
