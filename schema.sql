CREATE TABLE students (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  address TEXT
);

CREATE TABLE teachers (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT,
  first_name TEXT,
  last_name TEXT
);

CREATE TABLE courses (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  created_by INT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  price INT
);

CREATE TABLE lessons (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  created_by INT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE courses_lessons (
  id SERIAL PRIMARY KEY,
  course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  lesson_order INT NOT NULL
);

CREATE TABLE students_lessons (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lesson_id INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  start_date TIMESTAMP NOT NULL DEFAULT now(),
  end_date TIMESTAMP
);

CREATE TABLE courses_students (
  id SERIAL PRIMARY KEY,
  course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  is_complete BOOLEAN NOT NULL DEFAULT false,
  start_date TIMESTAMP NOT NULL DEFAULT now(),
  end_date TIMESTAMP
);

CREATE TABLE assessments (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  created_by INT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE
);

CREATE TABLE courses_assessments (
  id SERIAL PRIMARY KEY,
  course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  assessment_id INT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE
);

CREATE TABLE assessment_questions (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  question TEXT NOT NULL,
  description TEXT,
  answer TEXT NOT NULL,
  created_by INT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE
);

CREATE TABLE assessments_assessment_questions (
  id SERIAL PRIMARY KEY,
  assessment_question_id INT NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
  assessment_id INT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE
);

CREATE TABLE assessment_records (
  id SERIAL PRIMARY KEY,
  assessment_id INT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  score INT,
  status TEXT,
  start_date TIMESTAMP NOT NULL DEFAULT now(),
  end_date TIMESTAMP
);

CREATE TABLE assessment_evalutation (
  id SERIAL PRIMARY KEY,
  assessment_record_id INT NOT NULL REFERENCES assessment_records(id) ON DELETE CASCADE,
  teacher_id INT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT
);
