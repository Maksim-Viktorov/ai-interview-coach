'use client';

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { useEffect, useRef, useState } from 'react';

const DEFAULT_YAW_THRESHOLD = 15;
const DEFAULT_PITCH_THRESHOLD = 12;
const DEFAULT_IRIS_TOLERANCE = 0.15;

const ROLLING_N = 30;
const MIN_FRAMES_FOR_EYE_CONTACT_RATIO = 30;
const UI_FLUSH_MS = 100;
const DEBOUNCE_MS = 150;

const IRIS_IDX = {
  rightIris: 468,
  leftIris: 473,
  rightInner: 133,
  rightOuter: 33,
  leftInner: 362,
  leftOuter: 263,
} as const;

/**
 * Yaw/pitch signs follow MediaPipe's convention and may feel inverted vs intuition;
 * thresholds use Math.abs so behavior does not depend on sign.
 */
function extractHeadPose(matrix: Float32Array | number[]): {
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

function irisRatio(
  iris: { x: number },
  innerCorner: { x: number },
  outerCorner: { x: number },
): number {
  const eyeWidth = outerCorner.x - innerCorner.x;
  if (Math.abs(eyeWidth) < 1e-6) return 0.5;
  return (iris.x - innerCorner.x) / eyeWidth;
}

function isFullyValidDetection(result: {
  faceLandmarks?: { x: number; y: number; z?: number }[][];
  facialTransformationMatrixes?: { data: Float32Array | number[] }[];
}): boolean {
  if (!result.faceLandmarks?.length) return false;
  const lm = result.faceLandmarks[0];
  if (!lm) return false;
  const matrix = result.facialTransformationMatrixes?.[0]?.data;
  if (!matrix || matrix.length < 16) return false;
  const idx = Object.values(IRIS_IDX);
  for (const i of idx) {
    const p = lm[i];
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return false;
  }
  return true;
}

type ThrottledUi = {
  fps: string;
  detection: string;
  yaw: string;
  pitch: string;
  roll: string;
  irisRight: string;
  irisLeft: string;
  irisAvg: string;
  indicator: 'gray' | 'green' | 'red';
  indicatorLabel: string;
  eyeContact: string;
  lookAwayEvents: number;
  lookAwayMs: number;
  totalFaceSec: string;
};

export default function GazePrototypePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const initInProgressRef = useRef(false);
  const hasLoggedRef = useRef(false);
  const totalFramesRef = useRef(0);
  const frameTimestampsRef = useRef<number[]>([]);

  const yawThresholdRef = useRef(DEFAULT_YAW_THRESHOLD);
  const pitchThresholdRef = useRef(DEFAULT_PITCH_THRESHOLD);
  const irisToleranceRef = useRef(DEFAULT_IRIS_TOLERANCE);

  const debouncedLookingRef = useRef(false);
  const pendingSinceRef = useRef<number | null>(null);
  const pendingRawRef = useRef<boolean | null>(null);
  const prevDebouncedLookingRef = useRef(false);

  const framesFaceDetectedRef = useRef(0);
  const framesLookingWhileFaceRef = useRef(0);
  const lookAwayEventsRef = useRef(0);
  const lookAwayMsRef = useRef(0);
  const totalFaceMsRef = useRef(0);

  const lastTickTimeRef = useRef<number | null>(null);
  const lastUiFlushRef = useRef(0);
  const pendingUiRef = useRef<ThrottledUi | null>(null);

  const [cameraStatus, setCameraStatus] = useState('Requesting permission...');
  const [mediaPipeStatus, setMediaPipeStatus] = useState('Waiting...');

  const [cameraReady, setCameraReady] = useState(false);
  const [landmarkerReady, setLandmarkerReady] = useState(false);
  const [videoHasFrameData, setVideoHasFrameData] = useState(false);

  const [yawThreshold, setYawThreshold] = useState(DEFAULT_YAW_THRESHOLD);
  const [pitchThreshold, setPitchThreshold] = useState(DEFAULT_PITCH_THRESHOLD);
  const [irisTolerance, setIrisTolerance] = useState(DEFAULT_IRIS_TOLERANCE);

  const [throttledUi, setThrottledUi] = useState<ThrottledUi>({
    fps: 'Measuring...',
    detection: 'Waiting...',
    yaw: '—',
    pitch: '—',
    roll: '—',
    irisRight: '—',
    irisLeft: '—',
    irisAvg: '—',
    indicator: 'gray',
    indicatorLabel: 'No face detected',
    eyeContact: '—',
    lookAwayEvents: 0,
    lookAwayMs: 0,
    totalFaceSec: '0.0',
  });

  useEffect(() => {
    yawThresholdRef.current = yawThreshold;
  }, [yawThreshold]);

  useEffect(() => {
    pitchThresholdRef.current = pitchThreshold;
  }, [pitchThreshold]);

  useEffect(() => {
    irisToleranceRef.current = irisTolerance;
  }, [irisTolerance]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    const video = videoRef.current;

    void queueMicrotask(() => {
      setCameraStatus('Requesting permission...');
      setVideoHasFrameData(false);
    });

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
        mediaStreamRef.current = stream;
        if (video) {
          video.srcObject = stream;
        }
        setCameraStatus('Active');
        setCameraReady(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setCameraStatus(`Denied: ${msg}`);
        setCameraReady(false);
      }
    })();

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      if (video) {
        video.srcObject = null;
      }
      setCameraReady(false);
      setVideoHasFrameData(false);
    };
  }, []);

  useEffect(() => {
    if (!cameraReady) {
      return;
    }

    let cancelled = false;
    initInProgressRef.current = true;

    void queueMicrotask(() => {
      setMediaPipeStatus('Loading...');
      setLandmarkerReady(false);
    });

    void (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm',
        );
        if (cancelled) {
          return;
        }

        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: true,
          runningMode: 'VIDEO',
          numFaces: 1,
        });

        if (cancelled) {
          faceLandmarker.close();
          return;
        }

        faceLandmarkerRef.current = faceLandmarker;
        setLandmarkerReady(true);
        setMediaPipeStatus('Ready');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!cancelled) {
          setMediaPipeStatus(`Error: ${msg}`);
          setLandmarkerReady(false);
        }
      } finally {
        initInProgressRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      initInProgressRef.current = false;
      const lm = faceLandmarkerRef.current;
      if (lm) {
        lm.close();
        faceLandmarkerRef.current = null;
      }
      setLandmarkerReady(false);
      setMediaPipeStatus('Waiting...');
    };
  }, [cameraReady]);

  useEffect(() => {
    if (!cameraReady || !landmarkerReady || !videoHasFrameData) {
      return;
    }

    const video = videoRef.current;
    const landmarker = faceLandmarkerRef.current;
    if (!video || !landmarker) {
      return;
    }

    totalFramesRef.current = 0;
    frameTimestampsRef.current = [];
    lastTickTimeRef.current = null;
    lastUiFlushRef.current = performance.now();

    void queueMicrotask(() => {
      setThrottledUi((u) => ({ ...u, fps: 'Measuring...', detection: 'Waiting...' }));
    });

    let cancelled = false;

    const tick = () => {
      if (cancelled) {
        return;
      }

      if (video.readyState < 2) {
        requestAnimationFrame(tick);
        return;
      }

      try {
        const result = landmarker.detectForVideo(video, performance.now());
        totalFramesRef.current += 1;

        const now = performance.now();

        const stamps = frameTimestampsRef.current;
        stamps.push(now);
        if (stamps.length > ROLLING_N) {
          stamps.splice(0, stamps.length - ROLLING_N);
        }

        let fpsStr = 'Measuring...';
        if (stamps.length >= ROLLING_N) {
          const oldest = stamps[0]!;
          const latest = stamps[ROLLING_N - 1]!;
          const dtMs = latest - oldest;
          if (dtMs > 0) {
            const fps = (ROLLING_N / dtMs) * 1000;
            fpsStr = `${fps.toFixed(1)} fps`;
          }
        }

        const hasFaceLandmarks = (result.faceLandmarks?.length ?? 0) > 0;
        const detectionLine = hasFaceLandmarks
          ? 'Face detected'
          : 'No face detected';

        if (
          !hasLoggedRef.current &&
          result.faceLandmarks &&
          result.faceLandmarks.length > 0
        ) {
          hasLoggedRef.current = true;
          console.log('First detection result:', result);
        }

        const fullyValid = isFullyValidDetection(result);

        let yaw = 0;
        let pitch = 0;
        let roll = 0;
        let irisR = 0.5;
        let irisL = 0.5;
        let irisAvg = 0.5;
        let rawLooking = false;

        if (fullyValid) {
          const matrix = result.facialTransformationMatrixes![0]!.data;
          ({ yaw, pitch, roll } = extractHeadPose(matrix));
          const lm = result.faceLandmarks![0]!;
          irisR = irisRatio(
            lm[IRIS_IDX.rightIris]!,
            lm[IRIS_IDX.rightInner]!,
            lm[IRIS_IDX.rightOuter]!,
          );
          irisL = irisRatio(
            lm[IRIS_IDX.leftIris]!,
            lm[IRIS_IDX.leftInner]!,
            lm[IRIS_IDX.leftOuter]!,
          );
          irisAvg = (irisR + irisL) / 2;

          const yawTh = yawThresholdRef.current;
          const pitchTh = pitchThresholdRef.current;
          const irisTol = irisToleranceRef.current;
          const headForward =
            Math.abs(yaw) < yawTh && Math.abs(pitch) < pitchTh;
          const irisCentered = Math.abs(irisAvg - 0.5) < irisTol;
          rawLooking = headForward && irisCentered;

          const d = debouncedLookingRef.current;
          if (rawLooking === d) {
            pendingSinceRef.current = null;
            pendingRawRef.current = null;
          } else {
            if (
              pendingSinceRef.current === null ||
              pendingRawRef.current !== rawLooking
            ) {
              pendingSinceRef.current = now;
              pendingRawRef.current = rawLooking;
            } else if (now - pendingSinceRef.current >= DEBOUNCE_MS) {
              const newDebounced = rawLooking;
              if (
                prevDebouncedLookingRef.current === true &&
                newDebounced === false
              ) {
                lookAwayEventsRef.current += 1;
              }
              debouncedLookingRef.current = newDebounced;
              prevDebouncedLookingRef.current = newDebounced;
              pendingSinceRef.current = null;
              pendingRawRef.current = null;
            }
          }

          framesFaceDetectedRef.current += 1;
          if (debouncedLookingRef.current) {
            framesLookingWhileFaceRef.current += 1;
          }

          if (lastTickTimeRef.current === null) {
            lastTickTimeRef.current = now;
          } else {
            const deltaMs = now - lastTickTimeRef.current;
            lastTickTimeRef.current = now;
            totalFaceMsRef.current += deltaMs;
            if (!debouncedLookingRef.current) {
              lookAwayMsRef.current += deltaMs;
            } else {
              lookAwayMsRef.current = 0;
            }
          }
        } else {
          pendingSinceRef.current = null;
          pendingRawRef.current = null;
          lastTickTimeRef.current = now;
        }

        const debounced = debouncedLookingRef.current;
        let indicator: ThrottledUi['indicator'] = 'gray';
        let indicatorLabel = 'No face detected';
        if (fullyValid) {
          indicator = debounced ? 'green' : 'red';
          indicatorLabel = debounced ? 'Looking at camera' : 'Not looking';
        }

        const faceCount = framesFaceDetectedRef.current;
        let eyeContactStr = '—';
        if (faceCount >= MIN_FRAMES_FOR_EYE_CONTACT_RATIO) {
          const pct =
            (framesLookingWhileFaceRef.current / faceCount) * 100;
          eyeContactStr = `${pct.toFixed(1)}%`;
        }

        pendingUiRef.current = {
          fps: fpsStr,
          detection: detectionLine,
          yaw: fullyValid ? yaw.toFixed(1) : '—',
          pitch: fullyValid ? pitch.toFixed(1) : '—',
          roll: fullyValid ? roll.toFixed(1) : '—',
          irisRight: fullyValid ? irisR.toFixed(2) : '—',
          irisLeft: fullyValid ? irisL.toFixed(2) : '—',
          irisAvg: fullyValid ? irisAvg.toFixed(2) : '—',
          indicator,
          indicatorLabel,
          eyeContact: eyeContactStr,
          lookAwayEvents: lookAwayEventsRef.current,
          lookAwayMs: lookAwayMsRef.current,
          totalFaceSec: (totalFaceMsRef.current / 1000).toFixed(1),
        };

        if (now - lastUiFlushRef.current >= UI_FLUSH_MS) {
          lastUiFlushRef.current = now;
          const snap = pendingUiRef.current;
          if (snap) {
            setThrottledUi(snap);
          }
        }
      } catch (err) {
        console.error('[gaze-prototype] detectForVideo', err);
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);

    return () => {
      cancelled = true;
    };
  }, [cameraReady, landmarkerReady, videoHasFrameData]);

  const resetMetrics = () => {
    framesFaceDetectedRef.current = 0;
    framesLookingWhileFaceRef.current = 0;
    lookAwayEventsRef.current = 0;
    lookAwayMsRef.current = 0;
    totalFaceMsRef.current = 0;
    prevDebouncedLookingRef.current = debouncedLookingRef.current;
    lastTickTimeRef.current = null;
    setThrottledUi((u) => ({
      ...u,
      eyeContact: '—',
      lookAwayEvents: 0,
      lookAwayMs: 0,
      totalFaceSec: '0.0',
    }));
  };

  const indicatorColorClass =
    throttledUi.indicator === 'green'
      ? 'bg-emerald-500'
      : throttledUi.indicator === 'red'
        ? 'bg-red-500'
        : 'bg-gray-500';

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 text-gray-900 dark:text-gray-100">
      <h1 className="text-2xl font-semibold tracking-tight">
        Gaze Detection Prototype
      </h1>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <div className="relative h-[480px] w-[640px] max-w-full shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-black shadow-sm dark:border-gray-600">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            autoPlay
            playsInline
            muted
            onLoadedData={() => {
              setVideoHasFrameData(true);
            }}
          />
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden
          />
        </div>

        <div className="flex flex-col items-center gap-2 md:pt-4">
          <div
            className={`h-16 w-16 shrink-0 rounded-full ${indicatorColorClass} shadow-md`}
            aria-hidden
          />
          <p className="max-w-[12rem] text-center text-sm font-semibold text-gray-900 dark:text-gray-100">
            {throttledUi.indicatorLabel}
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/90 p-4 text-sm shadow-sm dark:border-gray-600 dark:bg-gray-900/80">
        <div>
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            Camera:{' '}
          </span>
          <span className="text-gray-900 dark:text-gray-100">
            {cameraStatus}
          </span>
        </div>
        <div>
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            MediaPipe:{' '}
          </span>
          <span className="text-gray-900 dark:text-gray-100">
            {mediaPipeStatus}
          </span>
        </div>
        <div>
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            Detection:{' '}
          </span>
          <span className="text-gray-900 dark:text-gray-100">
            {throttledUi.detection}
          </span>
        </div>
        <div>
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            FPS:{' '}
          </span>
          <span className="tabular-nums text-gray-900 dark:text-gray-100">
            {throttledUi.fps}
          </span>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-sm dark:border-gray-600 dark:bg-gray-950/40">
        <p className="font-semibold text-gray-800 dark:text-gray-200">
          Live pose &amp; iris
        </p>
        <p className="text-gray-700 dark:text-gray-300">
          Yaw:{' '}
          <span className="tabular-nums text-gray-900 dark:text-white">
            {throttledUi.yaw}°
          </span>{' '}
          · Pitch:{' '}
          <span className="tabular-nums text-gray-900 dark:text-white">
            {throttledUi.pitch}°
          </span>{' '}
          · Roll:{' '}
          <span className="tabular-nums text-gray-900 dark:text-white">
            {throttledUi.roll}°
          </span>
        </p>
        <p className="text-gray-700 dark:text-gray-300">
          Iris ratio (R / L / avg):{' '}
          <span className="tabular-nums text-gray-900 dark:text-white">
            {throttledUi.irisRight} / {throttledUi.irisLeft} /{' '}
            {throttledUi.irisAvg}
          </span>
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-sm dark:border-gray-600 dark:bg-gray-950/40">
        <p className="font-semibold text-gray-800 dark:text-gray-200">
          Thresholds
        </p>
        <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          <span className="min-w-[10rem] text-gray-700 dark:text-gray-300">
            Yaw threshold (5–30°)
          </span>
          <input
            type="range"
            min={5}
            max={30}
            step={1}
            value={yawThreshold}
            onChange={(e) => setYawThreshold(Number(e.target.value))}
            className="flex-1"
          />
          <span className="tabular-nums text-gray-900 dark:text-white">
            {yawThreshold}°
          </span>
        </label>
        <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          <span className="min-w-[10rem] text-gray-700 dark:text-gray-300">
            Pitch threshold (5–25°)
          </span>
          <input
            type="range"
            min={5}
            max={25}
            step={1}
            value={pitchThreshold}
            onChange={(e) => setPitchThreshold(Number(e.target.value))}
            className="flex-1"
          />
          <span className="tabular-nums text-gray-900 dark:text-white">
            {pitchThreshold}°
          </span>
        </label>
        <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          <span className="min-w-[10rem] text-gray-700 dark:text-gray-300">
            Iris tolerance (0.05–0.30)
          </span>
          <input
            type="range"
            min={0.05}
            max={0.3}
            step={0.01}
            value={irisTolerance}
            onChange={(e) => setIrisTolerance(Number(e.target.value))}
            className="flex-1"
          />
          <span className="tabular-nums text-gray-900 dark:text-white">
            {irisTolerance.toFixed(2)}
          </span>
        </label>
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/90 p-4 text-sm shadow-sm dark:border-gray-600 dark:bg-gray-900/80">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-gray-800 dark:text-gray-200">
            Session metrics
          </p>
          <button
            type="button"
            className="rounded border border-gray-500 px-3 py-1 text-xs font-medium text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800"
            onClick={resetMetrics}
          >
            Reset metrics
          </button>
        </div>
        <p className="text-gray-700 dark:text-gray-300">
          Eye contact ratio:{' '}
          <span className="font-medium text-gray-900 dark:text-white">
            {throttledUi.eyeContact}
          </span>
        </p>
        <p className="text-gray-700 dark:text-gray-300">
          Look-away events:{' '}
          <span className="tabular-nums font-medium text-gray-900 dark:text-white">
            {throttledUi.lookAwayEvents}
          </span>
        </p>
        <p className="text-gray-700 dark:text-gray-300">
          Current look-away duration:{' '}
          <span className="tabular-nums font-medium text-gray-900 dark:text-white">
            {(throttledUi.lookAwayMs / 1000).toFixed(1)} s
          </span>
        </p>
        <p className="text-gray-700 dark:text-gray-300">
          Total face-detected time:{' '}
          <span className="tabular-nums font-medium text-gray-900 dark:text-white">
            {throttledUi.totalFaceSec} s
          </span>
        </p>
      </div>
    </main>
  );
}
