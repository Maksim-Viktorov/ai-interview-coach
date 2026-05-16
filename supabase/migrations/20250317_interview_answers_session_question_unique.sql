-- Prerequisite: no duplicate (session_id, question_id) pairs with non-null question_id.
-- select session_id, question_id, count(*)
-- from interview_answers
-- where question_id is not null
-- group by session_id, question_id
-- having count(*) > 1;

alter table interview_answers
  add constraint interview_answers_session_question_unique
  unique (session_id, question_id);
