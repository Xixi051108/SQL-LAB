export const schemaDescription = `教学库（MySQL 8.0）\n学生 students：id INT 主键，name VARCHAR(40) 非空，major VARCHAR(40) 非空，age INT 可空\n课程 courses：id INT 主键，name VARCHAR(60) 非空，credits INT 非空\n选课 enrollments：student_id INT、course_id INT 联合主键，score INT 可空；外键分别关联 students.id 和 courses.id\n旧记录 old_records：id INT 主键，note VARCHAR(80) 可空\n建表题新表名：study_notes（初始不存在）。不同测试数据中数量、年龄、专业和成绩可能不同，不要硬编码结果。`;
export const initialTables = [
  "courses",
  "enrollments",
  "old_records",
  "students",
];
export const targets = [...initialTables, "study_notes"];
export function fixtureStatements(variant = 0) {
  return [
    "CREATE TABLE students (id INT PRIMARY KEY, name VARCHAR(40) NOT NULL, major VARCHAR(40) NOT NULL, age INT NULL)",
    "CREATE TABLE courses (id INT PRIMARY KEY, name VARCHAR(60) NOT NULL, credits INT NOT NULL)",
    "CREATE TABLE enrollments (student_id INT, course_id INT, score INT NULL, PRIMARY KEY(student_id,course_id), CONSTRAINT fk_student FOREIGN KEY(student_id) REFERENCES students(id), CONSTRAINT fk_course FOREIGN KEY(course_id) REFERENCES courses(id))",
    "CREATE TABLE old_records (id INT PRIMARY KEY, note VARCHAR(80) NULL)",
    variant === 0
      ? "INSERT INTO students VALUES (1,'林晨','计算机',20),(2,'陈雨','软件工程',19),(3,'周宁','计算机',22),(4,'许禾','数据科学',NULL)"
      : "INSERT INTO students VALUES (1,'李一','数学',18),(2,'刘二','计算机',23),(3,'王三','计算机',23),(4,'赵四','软件工程',NULL),(5,'钱五','计算机',20)",
    "INSERT INTO courses VALUES (1,'数据库原理',3),(2,'程序设计',4),(3,'离散数学',3)",
    variant === 0
      ? "INSERT INTO enrollments VALUES (1,1,88),(1,2,95),(2,1,76),(3,1,88),(4,3,NULL)"
      : "INSERT INTO enrollments VALUES (1,1,60),(2,1,92),(2,2,92),(3,1,92),(4,3,NULL),(5,2,0)",
    "INSERT INTO old_records VALUES (1,'历史导入记录'),(2,'待清理记录')",
  ];
}
export const seedQuestions = [
  {
    title: "查询计算机专业的学生",
    type: "select",
    prompt: "查询计算机专业学生的 id、name、age，按 id 升序排列。",
    reference_sql:
      "SELECT id,name,age FROM students WHERE major='计算机' ORDER BY id",
    target_table: "students",
    ordered: true,
    explanation: "WHERE 筛选专业，SELECT 决定输出列，ORDER BY id 保证顺序。",
  },
  {
    title: "新增一名学生",
    type: "insert",
    prompt:
      "新增学生：id 为 100，姓名为“新同学”，专业为“软件工程”，年龄为 20。",
    reference_sql:
      "INSERT INTO students(id,name,major,age) VALUES(100,'新同学','软件工程',20)",
    target_table: "students",
    explanation: "显式指定列名，保证插入的值与目标字段对应。",
  },
  {
    title: "更新数据库课程成绩",
    type: "update",
    prompt:
      "将 enrollments 中 course_id=1 且 score<80 的成绩增加 5 分，其余记录保持不变。",
    reference_sql:
      "UPDATE enrollments SET score=score+5 WHERE course_id=1 AND score<80",
    target_table: "enrollments",
    explanation: "使用两个筛选条件限制更新范围；NULL 不满足 score<80。",
  },
  {
    title: "删除指定旧记录",
    type: "delete",
    prompt: "删除 old_records 中 id=1 的记录，保留其他记录。",
    reference_sql: "DELETE FROM old_records WHERE id=1",
    target_table: "old_records",
    explanation: "DELETE 配合 WHERE 精确删除指定记录。",
  },
  {
    title: "创建学习笔记表",
    type: "create_table",
    prompt:
      "创建 study_notes 表，按顺序包含：id INT 主键；student_id INT NOT NULL，外键关联 students(id)；content VARCHAR(200) NOT NULL。不添加其他列、约束或默认值。约束名称不限。",
    reference_sql:
      "CREATE TABLE study_notes (id INT PRIMARY KEY,student_id INT NOT NULL,content VARCHAR(200) NOT NULL,FOREIGN KEY(student_id) REFERENCES students(id))",
    target_table: "study_notes",
    explanation:
      "主键唯一标识笔记，外键约束学生编号；NOT NULL 防止必要信息缺失。",
  },
  {
    title: "为学生表增加邮箱",
    type: "alter_table",
    prompt:
      "在 students 表末尾新增 email VARCHAR(100) NULL 列，默认值为 NULL，并添加 email 唯一约束，其他结构和数据保持不变。约束名称不限。",
    reference_sql:
      "ALTER TABLE students ADD COLUMN email VARCHAR(100) NULL DEFAULT NULL, ADD UNIQUE (email)",
    target_table: "students",
    explanation: "ADD COLUMN 增加可空列，UNIQUE 阻止重复的非空邮箱。",
  },
  {
    title: "移除旧记录表",
    type: "drop_table",
    prompt: "删除 old_records 表，其他表的结构和数据保持不变。",
    reference_sql: "DROP TABLE old_records",
    target_table: "old_records",
    explanation: "DROP TABLE 删除整个表；DELETE 只删除表中的行。",
  },
];
