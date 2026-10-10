/* Learn: the server marks course quizzes and remembers who passed, because volunteers
   must have passed the Intermediate courses before they can sign in (see misc.js). */
import { Router } from 'express';
import { requireClient } from '../auth.js';
import { KW } from '../shared.js';
import { badRequest, nowIso } from '../http.js';

// Same rule as the browser: two-thirds right, e.g. 2 of 3.
export const passMark = course => Math.ceil(course.quiz.length * 2 / 3);

/* Courses a volunteer must pass before signing in. */
export const VOLUNTEER_COURSES = KW.COURSES.filter(c => c.level === 'Intermediate');

export function passedCourses(db, clientId) {
  return db.prepare('SELECT course_id FROM course_passes WHERE client_id = ?').all(clientId).map(r => r.course_id);
}

export default function learnRouter({ db }) {
  const r = Router();

  /* Body: { course, answers: [option index per question] }. Reply: { score, total, passed }. */
  r.post('/quiz', requireClient, (req, res) => {
    const b = req.body || {};
    const course = KW.COURSES.find(c => c.id === b.course);
    if (!course) throw badRequest('Unknown course');
    if (!Array.isArray(b.answers) || b.answers.length !== course.quiz.length) {
      throw badRequest(`answers must list one choice for each of the ${course.quiz.length} questions`);
    }
    const score = course.quiz.filter((q, i) => b.answers[i] === q.answer).length;
    const passed = score >= passMark(course);
    if (passed) {
      db.prepare(`INSERT INTO course_passes (client_id, course_id, score, passed_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (client_id, course_id) DO UPDATE SET score = MAX(score, excluded.score)`)
        .run(req.clientId, course.id, score, nowIso());
    }
    res.json({ score, total: course.quiz.length, passed });
  });

  r.get('/passes', requireClient, (req, res) => res.json(passedCourses(db, req.clientId)));

  return r;
}
