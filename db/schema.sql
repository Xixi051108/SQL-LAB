CREATE TABLE IF NOT EXISTS users (
 id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
 username VARCHAR(32) NOT NULL UNIQUE,
 name VARCHAR(40) NOT NULL,
 password_hash VARCHAR(200) NOT NULL,
 role ENUM('teacher','student') NOT NULL DEFAULT 'student',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS questions (
 id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
 title VARCHAR(160) NOT NULL,
 type ENUM('select','insert','update','delete','create_table','alter_table','drop_table') NOT NULL,
 prompt TEXT NOT NULL,
 reference_sql TEXT NOT NULL,
 explanation TEXT NOT NULL,
 target_table VARCHAR(64) NOT NULL,
 ordered BOOLEAN NOT NULL DEFAULT FALSE,
 source ENUM('manual','deepseek') NOT NULL DEFAULT 'manual',
 status ENUM('draft','approved') NOT NULL DEFAULT 'draft',
 created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS exams (
 id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
 title VARCHAR(160) NOT NULL,
 starts_at DATETIME(3) NOT NULL,
 ends_at DATETIME(3) NOT NULL,
 status ENUM('draft','published') NOT NULL DEFAULT 'draft',
 created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 CONSTRAINT ck_exam_window CHECK (ends_at > starts_at),
 FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS exam_questions (
 id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
 exam_id BIGINT UNSIGNED NOT NULL,
 question_id BIGINT UNSIGNED NULL,
 position INT UNSIGNED NOT NULL,
 points INT UNSIGNED NOT NULL,
 snapshot JSON NOT NULL,
 CONSTRAINT ck_points CHECK (points BETWEEN 1 AND 100),
 UNIQUE KEY uq_position (exam_id,position),
 UNIQUE KEY uq_question (exam_id,question_id),
 FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
 FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS attempts (
 id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
 exam_id BIGINT UNSIGNED NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL,
 status ENUM('active','queued','grading','graded','error') NOT NULL DEFAULT 'active',
 started_at DATETIME(3) NOT NULL,
 submitted_at DATETIME(3) NULL,
 score INT UNSIGNED NULL,
 error_message VARCHAR(300) NULL,
 UNIQUE KEY uq_attempt (exam_id,user_id),
 KEY ix_pending (status),
 FOREIGN KEY (exam_id) REFERENCES exams(id),
 FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS answers (
 id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
 attempt_id BIGINT UNSIGNED NOT NULL,
 exam_question_id BIGINT UNSIGNED NOT NULL,
 sql_text TEXT NOT NULL,
 saved_at DATETIME(3) NOT NULL,
 score INT UNSIGNED NULL,
 verdict ENUM('correct','wrong','blank','error') NULL,
 feedback TEXT NULL,
 UNIQUE KEY uq_answer (attempt_id,exam_question_id),
 FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE,
 FOREIGN KEY (exam_question_id) REFERENCES exam_questions(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS sessions (
 sid VARCHAR(128) PRIMARY KEY,
 data JSON NOT NULL,
 expires_at DATETIME(3) NOT NULL,
 KEY ix_expiry (expires_at)
) ENGINE=InnoDB;
