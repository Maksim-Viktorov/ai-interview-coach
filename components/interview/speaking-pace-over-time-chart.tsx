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

export type PaceChartPoint = { time: number; wpm: number };

type SpeakingPaceOverTimeChartProps = {
  data: PaceChartPoint[];
};

export function SpeakingPaceOverTimeChart({
  data,
}: SpeakingPaceOverTimeChartProps) {
  if (data.length === 0) {
    return null;
  }

  const sorted = [...data].sort((a, b) => a.time - b.time);
  const wpmVals = sorted.map((d) => d.wpm);
  const minWpm = Math.min(...wpmVals, 130);
  const maxWpm = Math.max(...wpmVals, 170);
  const pad = Math.max(12, (maxWpm - minWpm) * 0.1);
  const yMin = Math.max(0, Math.floor(minWpm - pad));
  const yMax = Math.ceil(maxWpm + pad);

  const xDomain: [number, number] | ['dataMin', 'dataMax'] =
    sorted.length === 1
      ? [
          Math.max(0, sorted[0].time - 4),
          sorted[0].time + 4,
        ]
      : ['dataMin', 'dataMax'];

  return (
    <div className="mt-6 w-full min-w-0">
      <h4 className="text-sm font-semibold tracking-tight text-gray-950 dark:text-white">
        Speaking Pace Over Time
      </h4>
      <div className="mt-3 h-64 w-full text-gray-800 dark:text-gray-200">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={sorted}
            margin={{ top: 10, right: 10, left: 2, bottom: 4 }}
          >
            <ReferenceArea
              y1={130}
              y2={170}
              fill="#22c55e"
              fillOpacity={0.1}
              stroke="none"
              ifOverflow="visible"
            />
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-gray-200 dark:stroke-gray-600"
              opacity={0.45}
            />
            <XAxis
              dataKey="time"
              type="number"
              domain={xDomain}
              tickFormatter={(v) => `${v}s`}
              tick={{ fontSize: 11 }}
              stroke="currentColor"
              className="text-gray-500 dark:text-gray-400"
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 11 }}
              stroke="currentColor"
              className="text-gray-500 dark:text-gray-400"
              width={48}
              label={{
                value: 'WPM',
                angle: -90,
                position: 'insideLeft',
                offset: 2,
                style: { fontSize: 11, fill: 'currentColor' },
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
                backgroundColor: 'rgb(17 24 39)',
                border: '1px solid rgb(75 85 99)',
                color: 'rgb(243 244 246)',
              }}
            />
            <Line
              type="monotone"
              dataKey="wpm"
              stroke="rgb(96 165 250)"
              strokeWidth={2}
              dot={{ r: 3, fill: 'rgb(96 165 250)' }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
