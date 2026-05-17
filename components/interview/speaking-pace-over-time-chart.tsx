'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { colors } from '@/lib/design-tokens';
import type { PacingWindowPoint } from '@/lib/deepgram-analytics';

const IDEAL_PACE_WPM_MIN = 180;
const IDEAL_PACE_WPM_MAX = 230;

function chooseTickInterval(maxSeconds: number): number {
  if (maxSeconds <= 30) return 5;
  if (maxSeconds <= 60) return 10;
  if (maxSeconds <= 120) return 20;
  if (maxSeconds <= 300) return 30;
  return 60;
}

type SpeakingPaceOverTimeChartProps = {
  pacingWindows: PacingWindowPoint[];
};

export function SpeakingPaceOverTimeChart({
  pacingWindows,
}: SpeakingPaceOverTimeChartProps) {
  if (pacingWindows.length === 0) {
    return null;
  }

  const sorted = [...pacingWindows].sort((a, b) => a.midTime - b.midTime);
  const wpmVals = sorted.map((d) => d.wpm);
  const minWpm = Math.min(...wpmVals, IDEAL_PACE_WPM_MIN);
  const maxWpm = Math.max(...wpmVals, IDEAL_PACE_WPM_MAX);
  const pad = Math.max(12, (maxWpm - minWpm) * 0.1);
  const yMin = Math.max(0, Math.floor(minWpm - pad));
  const yMax = Math.ceil(maxWpm + pad);

  const maxSeconds = Math.max(...sorted.map((w) => w.midTime));
  const tickInterval = chooseTickInterval(maxSeconds);
  const ticks: number[] = [];
  for (let t = 0; t <= maxSeconds; t += tickInterval) {
    ticks.push(t);
  }

  return (
    <div className="w-full min-w-0 rounded-2xl border border-border bg-surface p-3">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart
          data={sorted}
          margin={{ top: 10, right: 15, bottom: 5, left: 20 }}
        >
          <ReferenceArea
            y1={IDEAL_PACE_WPM_MIN}
            y2={IDEAL_PACE_WPM_MAX}
            fill={colors.scoreGood}
            fillOpacity={0.15}
            stroke="none"
            ifOverflow="visible"
          />
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={colors.border}
            opacity={0.45}
          />
          <XAxis
            dataKey="midTime"
            type="number"
            domain={[0, maxSeconds]}
            ticks={ticks}
            tickFormatter={(value) => `${value}s`}
            tick={{ fontSize: 11, fill: colors.textSecondary }}
            stroke={colors.textSecondary}
            fontFamily="var(--font-inter)"
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 11, fill: colors.textSecondary }}
            stroke={colors.textSecondary}
            width={48}
            label={{
              value: 'WPM',
              angle: -90,
              position: 'insideLeft',
              offset: 10,
              style: {
                fontSize: 12,
                fill: colors.textSecondary,
                fontFamily: 'var(--font-inter)',
              },
            }}
          />
          <Tooltip
            formatter={(value) => {
              if (value == null || value === '') {
                return ['', 'WPM'];
              }
              return [`${Math.round(Number(value))} WPM`, 'WPM'];
            }}
            labelFormatter={(label) => `${Number(label).toFixed(0)}s`}
            contentStyle={{
              borderRadius: '8px',
              fontSize: '13px',
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              color: colors.textPrimary,
              fontFamily: 'var(--font-inter)',
            }}
          />
          <Line
            type="monotone"
            dataKey="wpm"
            stroke={colors.brand}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, fill: colors.brand }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
