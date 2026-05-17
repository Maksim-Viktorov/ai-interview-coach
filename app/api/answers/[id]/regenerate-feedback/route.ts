import { NextResponse } from 'next/server';
import { requireAuthUser } from '@/lib/auth-api';
import { generateMetricAwareFeedback } from '@/lib/feedback-llm';
import {
  isValidDeepgramAnalytics,
  isValidScorecard,
} from '@/lib/session-summary';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireAuthUser();
  if ('error' in auth) {
    return auth.error;
  }
  const { supabase } = auth;

  const { id } = await context.params;

  const { data: row, error: fetchError } = await supabase
    .from('interview_answers')
    .select(
      'id, question, answer, delivery_scorecard, delivery_analytics',
    )
    .eq('id', id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json({ error: 'Answer not found' }, { status: 404 });
  }

  if (
    !isValidScorecard(row.delivery_scorecard) ||
    !isValidDeepgramAnalytics(row.delivery_analytics)
  ) {
    return NextResponse.json(
      { error: 'Cannot regenerate feedback for answer without scorecard' },
      { status: 400 },
    );
  }

  const { feedbackPayload, parsed, parseFailed } =
    await generateMetricAwareFeedback(
      row.question,
      row.answer,
      row.delivery_scorecard,
      row.delivery_analytics,
    );

  const { error: updateError } = await supabase
    .from('interview_answers')
    .update({ feedback: feedbackPayload })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    feedback: feedbackPayload,
    parsed,
    parseFailed,
  });
}
