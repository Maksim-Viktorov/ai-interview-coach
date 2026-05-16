-- Already applied in Supabase; recorded here for repo history.
create policy "Users can update own answers"
  on interview_answers for update
  using (auth.uid() = user_id);
