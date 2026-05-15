/**
 * Pure gaze / face-detection helpers (shared by useGazeTracking and tools).
 */

export const DEFAULT_YAW_THRESHOLD = 15;
export const DEFAULT_PITCH_THRESHOLD = 12;
export const DEFAULT_IRIS_H_TOLERANCE = 0.12;
export const DEFAULT_IRIS_DOWN_TOLERANCE = 0.1;
export const DEFAULT_IRIS_UP_TOLERANCE = 0.18;

export const ROLLING_N = 30;
export const MIN_FRAMES_FOR_EYE_CONTACT_RATIO = 30;
export const BASELINE_SAMPLE_COUNT = 30;
export const BLINK_EAR_THRESHOLD = 0.18;
export const UI_FLUSH_MS = 100;
export const DEBOUNCE_MS = 150;

/** MediaPipe face landmark indices for iris, lids, and horizontal corners. */
export const LANDMARK_INDICES = {
  rightIris: 468,
  leftIris: 473,
  rightInner: 133,
  rightOuter: 33,
  leftInner: 362,
  leftOuter: 263,
  rightTopLid: 159,
  rightBottomLid: 145,
  leftTopLid: 386,
  leftBottomLid: 374,
} as const;

/**
 * Yaw/pitch signs follow MediaPipe's convention; thresholds use Math.abs.
 */
export function extractHeadPose(matrix: Float32Array | number[]): {
  yaw: number;
  pitch: number;
  roll: number;
} {
  const m13 = matrix[2]!;
  const m21 = matrix[4]!;
  const m22 = matrix[5]!;
  const m23 = matrix[6]!;
  const m33 = matrix[10]!;

  const pitch = Math.asin(-m23) * (180 / Math.PI);
  const yaw = Math.atan2(m13, m33) * (180 / Math.PI);
  const roll = Math.atan2(m21, m22) * (180 / Math.PI);
  return { yaw, pitch, roll };
}

export function irisHorizontalRatio(
  iris: { x: number },
  innerCorner: { x: number },
  outerCorner: { x: number },
): number {
  const eyeWidth = outerCorner.x - innerCorner.x;
  if (Math.abs(eyeWidth) < 1e-6) return 0.5;
  return (iris.x - innerCorner.x) / eyeWidth;
}

export function irisVerticalRatio(
  iris: { y: number },
  topLid: { y: number },
  bottomLid: { y: number },
): number {
  const eyeHeight = bottomLid.y - topLid.y;
  if (Math.abs(eyeHeight) < 1e-6) return 0.5;
  return (iris.y - topLid.y) / eyeHeight;
}

export function eyeAspectRatio(
  top: { y: number },
  bottom: { y: number },
  inner: { x: number },
  outer: { x: number },
): number {
  const height = Math.abs(bottom.y - top.y);
  const width = Math.abs(outer.x - inner.x);
  if (width < 1e-6) return 0;
  return height / width;
}

export function isFullyValidDetection(result: {
  faceLandmarks?: { x: number; y: number; z?: number }[][];
  facialTransformationMatrixes?: { data: Float32Array | number[] }[];
}): boolean {
  if (!result.faceLandmarks?.length) return false;
  const lm = result.faceLandmarks[0];
  if (!lm) return false;
  const matrix = result.facialTransformationMatrixes?.[0]?.data;
  if (!matrix || matrix.length < 16) return false;
  const idx = Object.values(LANDMARK_INDICES);
  for (const i of idx) {
    const p = lm[i];
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return false;
  }
  return true;
}
