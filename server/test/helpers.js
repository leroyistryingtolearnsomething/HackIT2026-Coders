/* Shared by the API tests (node --test runs this file too; it has no tests of its own). */
import { KW } from '../src/shared.js';

export const INTERMEDIATE = KW.COURSES.filter(c => c.level === 'Intermediate');

/* Takes a resident through the volunteer steps (demo identity check, then the Intermediate
   quizzes answered correctly) and signs them in. `call` is the test file's request helper. */
export async function becomeVolunteer(call, { name = 'Mei', client } = {}) {
  await call('POST', '/volunteer/verify', { body: { name }, client });
  for (const c of INTERMEDIATE) {
    await call('POST', '/learn/quiz', { body: { course: c.id, answers: c.quiz.map(q => q.answer) }, client });
  }
  return call('POST', '/volunteer/login', { body: { role: 'RC Volunteer', area: 'Tampines' }, client });
}
