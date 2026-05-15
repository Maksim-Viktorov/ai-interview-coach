'use client';

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BASELINE_SAMPLE_COUNT,
  BLINK_EAR_THRESHOLD,
  DEBOUNCE_MS,
  DEFAULT_IRIS_DOWN_TOLERANCE,
  DEFAULT_IRIS_H_TOLERANCE,
  DEFAULT_IRIS_UP_TOLERANCE,
  DEFAULT_PITCH_THRESHOLD,
  DEFAULT_YAW_THRESHOLD,
  extractHeadPose,
  eyeAspectRatio,
  irisHorizontalRatio,
  irisVerticalRatio,
  isFullyValidDetection,
  LANDMARK_INDICES as IRIS_IDX,
  MIN_FRAMES_FOR_EYE_CONTACT_RATIO,
  ROLLING_N,
  UI_FLUSH_MS,
} from '@/lib/gaze-detection';

export type GazeMetricsSnapshot = {
  eyeContactRatio: number | null;
  lookAwayEvents: number;
  longestLookAwayMs: number;
  totalFaceDetectedMs: number;
  hasSufficientData: boolean;
};

export type GazeTrackingState = {
  landmarkerStatus: 'idle' | 'loading' | 'ready' | 'error';
  landmarkerError: string | null;
  isCalibrating: boolean;
  isLookingAtCamera: boolean | null;
  isFaceDetected: boolean;
  eyeContactRatio: number | null;
  lookAwayEvents: number;
  longestLookAwayMs: number;
  totalFaceDetectedMs: number;
  hasSufficientData: boolean;
  debug?: GazeTrackingDebugExtras;
};

export type GazeTrackingDebugExtras = {
  fps: string;
  detection: string;
  yaw: string;
  pitch: string;
  roll: string;
  irisHRight: string;
  irisHLeft: string;
  irisHAvg: string;
  irisVRight: string;
  irisVLeft: string;
  irisVAvg: string;
  baselineH: string;
  baselineV: string;
  ear: string;
  blink: string;
  verticalDeviation: string;
  indicator: 'gray' | 'green' | 'red' | 'blue' | 'amber';
  indicatorLabel: string;
  eyeContactDisplay: string;
  lookAwayMs: number;
  totalFaceSec: string;
};

export type GazeTrackingControls = {
  startTracking: (videoElement: HTMLVideoElement) => Promise<void>;
  stopTracking: () => void;
  recalibrate: () => void;
  resetMetrics: () => void;
  resetForNewRecording: () => void;
  getSnapshot: () => GazeMetricsSnapshot;
};

type UseGazeTrackingOptions = {
  enableDebugExtras?: boolean;
};

function emptyDebugExtras(): GazeTrackingDebugExtras {
  return {
    fps: 'Measuring...',
    detection: 'Waiting...',
    yaw: '—',
    pitch: '—',
    roll: '—',
    irisHRight: '—',
    irisHLeft: '—',
    irisHAvg: '—',
    irisVRight: '—',
    irisVLeft: '—',
    irisVAvg: '—',
    baselineH: '—',
    baselineV: '—',
    ear: '—',
    blink: 'no',
    verticalDeviation: '—',
    indicator: 'gray',
    indicatorLabel: 'No face detected',
    eyeContactDisplay: '—',
    lookAwayMs: 0,
    totalFaceSec: '0.0',
  };
}

export function useGazeTracking(
  options: UseGazeTrackingOptions = {},
): {
  state: GazeTrackingState;
  controls: GazeTrackingControls;
} {
  const { enableDebugExtras = false } = options;

  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const visionResolverRef = useRef<unknown>(null);
  const initPromiseRef = useRef<Promise<FaceLandmarker | null> | null>(null);
  const trackingVideoRef = useRef<HTMLVideoElement | null>(null);
  const rafCancelledRef = useRef(true);
  const rafHandleRef = useRef<number>(0);

  const yawThresholdRef = useRef(DEFAULT_YAW_THRESHOLD);
  const pitchThresholdRef = useRef(DEFAULT_PITCH_THRESHOLD);
  const irisHToleranceRef = useRef(DEFAULT_IRIS_H_TOLERANCE);
  const irisDownToleranceRef = useRef(DEFAULT_IRIS_DOWN_TOLERANCE);
  const irisUpToleranceRef = useRef(DEFAULT_IRIS_UP_TOLERANCE);

  const baselineHRef = useRef<number | null>(null);
  const baselineVRef = useRef<number | null>(null);
  const baselineSamplesRef = useRef<{ h: number[]; v: number[] }>({
    h: [],
    v: [],
  });

  const debouncedLookingRef = useRef(false);
  const pendingSinceRef = useRef<number | null>(null);
  const pendingRawRef = useRef<boolean | null>(null);
  const prevDebouncedLookingRef = useRef(false);

  const framesFaceDetectedRef = useRef(0);
  const framesLookingWhileFaceRef = useRef(0);
  const lookAwayEventsRef = useRef(0);
  const lookAwayMsRef = useRef(0);
  const longestLookAwayMsRef = useRef(0);
  const totalFaceMsRef = useRef(0);

  const lastTickTimeRef = useRef<number | null>(null);
  const lastUiFlushRef = useRef(0);
  const frameTimestampsRef = useRef<number[]>([]);
  const totalFramesRef = useRef(0);

  const flushSnapshotToUi = useCallback(() => {
    const faceCount = framesFaceDetectedRef.current;
    const hasSufficient = faceCount >= MIN_FRAMES_FOR_EYE_CONTACT_RATIO;
    let eyeContactRatio: number | null = null;
    if (hasSufficient) {
      eyeContactRatio =
        Math.round(
          (framesLookingWhileFaceRef.current / faceCount) * 1000,
        ) / 10;
    }
    return {
      lookAwayEvents: lookAwayEventsRef.current,
      longestLookAwayMs: Math.max(
        longestLookAwayMsRef.current,
        debouncedLookingRef.current ? 0 : lookAwayMsRef.current,
      ),
      totalFaceDetectedMs: totalFaceMsRef.current,
      hasSufficientData: hasSufficient,
      eyeContactRatio,
    };
  }, []);

  const [state, setState] = useState<GazeTrackingState>(() => ({
    landmarkerStatus: 'idle',
    landmarkerError: null,
    isCalibrating: true,
    isLookingAtCamera: null,
    isFaceDetected: false,
    eyeContactRatio: null,
    lookAwayEvents: 0,
    longestLookAwayMs: 0,
    totalFaceDetectedMs: 0,
    hasSufficientData: false,
    ...(enableDebugExtras ? { debug: emptyDebugExtras() } : {}),
  }));

  const ensureLandmarker = useCallback(async (): Promise<FaceLandmarker | null> => {
    if (faceLandmarkerRef.current) return faceLandmarkerRef.current;

    if (initPromiseRef.current) {
      return initPromiseRef.current;
    }

    initPromiseRef.current = (async () => {
      startTransition(() => {
        setState((s) => ({ ...s, landmarkerStatus: 'loading' }));
      });

      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm',
        );
        visionResolverRef.current = vision;

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

        faceLandmarkerRef.current = faceLandmarker;
        startTransition(() => {
          setState((s) => ({
            ...s,
            landmarkerStatus: 'ready',
            landmarkerError: null,
          }));
        });
        return faceLandmarker;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        startTransition(() => {
          setState((s) => ({
            ...s,
            landmarkerStatus: 'error',
            landmarkerError: msg,
          }));
        });
        return null;
      } finally {
        initPromiseRef.current = null;
      }
    })();

    return initPromiseRef.current;
  }, []);

  const recalibrateRefs = useCallback(() => {
    baselineHRef.current = null;
    baselineVRef.current = null;
    baselineSamplesRef.current = { h: [], v: [] };
    pendingSinceRef.current = null;
    pendingRawRef.current = null;
  }, []);

  const resetMetricsRefs = useCallback(() => {
    framesFaceDetectedRef.current = 0;
    framesLookingWhileFaceRef.current = 0;
    lookAwayEventsRef.current = 0;
    lookAwayMsRef.current = 0;
    longestLookAwayMsRef.current = 0;
    totalFaceMsRef.current = 0;
    prevDebouncedLookingRef.current = debouncedLookingRef.current;
    lastTickTimeRef.current = null;
    frameTimestampsRef.current = [];
    totalFramesRef.current = 0;
  }, []);

  const recalibrate = useCallback(() => {
    recalibrateRefs();
  }, [recalibrateRefs]);

  const resetMetrics = useCallback(() => {
    resetMetricsRefs();
  }, [resetMetricsRefs]);

  const resetForNewRecording = useCallback(() => {
    resetMetricsRefs();
    recalibrateRefs();
    debouncedLookingRef.current = false;
    prevDebouncedLookingRef.current = false;
    pendingSinceRef.current = null;
    pendingRawRef.current = null;
  }, [recalibrateRefs, resetMetricsRefs]);

  const getSnapshot = useCallback((): GazeMetricsSnapshot => {
    const debounced = debouncedLookingRef.current;
    let longest = longestLookAwayMsRef.current;
    if (!debounced) {
      longest = Math.max(longest, lookAwayMsRef.current);
    }
    const faceCount = framesFaceDetectedRef.current;
    const hasSufficient = faceCount >= MIN_FRAMES_FOR_EYE_CONTACT_RATIO;
    let eyeContactRatio: number | null = null;
    if (hasSufficient) {
      eyeContactRatio =
        Math.round(
          (framesLookingWhileFaceRef.current / faceCount) * 1000,
        ) / 10;
    }
    return {
      eyeContactRatio,
      lookAwayEvents: lookAwayEventsRef.current,
      longestLookAwayMs: longest,
      totalFaceDetectedMs: totalFaceMsRef.current,
      hasSufficientData: hasSufficient,
    };
  }, []);

  const runTickInner = useCallback(
    (
      video: HTMLVideoElement,
      landmarker: FaceLandmarker,
      now: number,
    ): GazeTrackingDebugExtras | undefined => {
      if (video.readyState < 2) return undefined;

      const result = landmarker.detectForVideo(video, now);
      totalFramesRef.current += 1;

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

      const fullyValid = isFullyValidDetection(result);

      let yaw = 0;
      let pitch = 0;
      let roll = 0;
      let rightIrisHRatio = 0.5;
      let leftIrisHRatio = 0.5;
      let irisHCenterRatio = 0.5;
      let rightIrisVRatio = 0.5;
      let leftIrisVRatio = 0.5;
      let irisVCenterRatio = 0.5;
      let rawLooking = false;
      let avgEAR = 0;
      let isBlink = false;
      let verticalDeviationNum: number | null = null;

      if (fullyValid) {
        const matrix = result.facialTransformationMatrixes![0]!.data;
        ({ yaw, pitch, roll } = extractHeadPose(matrix));
        const lm = result.faceLandmarks![0]!;
        rightIrisHRatio = irisHorizontalRatio(
          lm[IRIS_IDX.rightIris]!,
          lm[IRIS_IDX.rightInner]!,
          lm[IRIS_IDX.rightOuter]!,
        );
        leftIrisHRatio = irisHorizontalRatio(
          lm[IRIS_IDX.leftIris]!,
          lm[IRIS_IDX.leftInner]!,
          lm[IRIS_IDX.leftOuter]!,
        );
        irisHCenterRatio = (rightIrisHRatio + leftIrisHRatio) / 2;

        rightIrisVRatio = irisVerticalRatio(
          lm[IRIS_IDX.rightIris]!,
          lm[IRIS_IDX.rightTopLid]!,
          lm[IRIS_IDX.rightBottomLid]!,
        );
        leftIrisVRatio = irisVerticalRatio(
          lm[IRIS_IDX.leftIris]!,
          lm[IRIS_IDX.leftTopLid]!,
          lm[IRIS_IDX.leftBottomLid]!,
        );
        irisVCenterRatio = (rightIrisVRatio + leftIrisVRatio) / 2;

        const rightEAR = eyeAspectRatio(
          lm[IRIS_IDX.rightTopLid]!,
          lm[IRIS_IDX.rightBottomLid]!,
          lm[IRIS_IDX.rightInner]!,
          lm[IRIS_IDX.rightOuter]!,
        );
        const leftEAR = eyeAspectRatio(
          lm[IRIS_IDX.leftTopLid]!,
          lm[IRIS_IDX.leftBottomLid]!,
          lm[IRIS_IDX.leftInner]!,
          lm[IRIS_IDX.leftOuter]!,
        );
        avgEAR = (rightEAR + leftEAR) / 2;
        isBlink = avgEAR < BLINK_EAR_THRESHOLD;

        if (baselineHRef.current === null || baselineVRef.current === null) {
          const s = baselineSamplesRef.current;
          s.h.push(irisHCenterRatio);
          s.v.push(irisVCenterRatio);
          if (s.h.length >= BASELINE_SAMPLE_COUNT) {
            const meanH =
              s.h.reduce((a, b) => a + b, 0) / BASELINE_SAMPLE_COUNT;
            const meanV =
              s.v.reduce((a, b) => a + b, 0) / BASELINE_SAMPLE_COUNT;
            baselineHRef.current = meanH;
            baselineVRef.current = meanV;
            s.h = [];
            s.v = [];
          }
        }

        if (baselineVRef.current !== null) {
          verticalDeviationNum =
            irisVCenterRatio - baselineVRef.current;
        }

        if (
          baselineHRef.current !== null &&
          baselineVRef.current !== null
        ) {
          const bH = baselineHRef.current;
          const bV = baselineVRef.current;

          if (isBlink) {
            if (lastTickTimeRef.current === null) {
              lastTickTimeRef.current = now;
            } else {
              lastTickTimeRef.current = now;
            }
          } else {
            const rightHDev = Math.abs(rightIrisHRatio - bH);
            const leftHDev = Math.abs(leftIrisHRatio - bH);
            const maxHorizontalDeviation = Math.max(rightHDev, leftHDev);
            const irisHCentered =
              maxHorizontalDeviation < irisHToleranceRef.current;

            const verticalDeviation = irisVCenterRatio - bV;
            const lookingDown =
              verticalDeviation < -irisDownToleranceRef.current;
            const lookingUp =
              verticalDeviation > irisUpToleranceRef.current;
            const irisVCentered = !lookingDown && !lookingUp;

            const headForward =
              Math.abs(yaw) < yawThresholdRef.current &&
              Math.abs(pitch) < pitchThresholdRef.current;
            rawLooking = headForward && irisHCentered && irisVCentered;

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
                longestLookAwayMsRef.current = Math.max(
                  longestLookAwayMsRef.current,
                  lookAwayMsRef.current,
                );
              } else {
                longestLookAwayMsRef.current = Math.max(
                  longestLookAwayMsRef.current,
                  lookAwayMsRef.current,
                );
                lookAwayMsRef.current = 0;
              }
            }
          }
        } else {
          if (lastTickTimeRef.current === null) {
            lastTickTimeRef.current = now;
          } else {
            lastTickTimeRef.current = now;
          }
        }
      } else {
        pendingSinceRef.current = null;
        pendingRawRef.current = null;
        lastTickTimeRef.current = now;
      }

      const stillCalibrating =
        baselineHRef.current === null || baselineVRef.current === null;

      const debounced = debouncedLookingRef.current;

      let isLookingAtCamera: boolean | null = null;
      if (stillCalibrating || !fullyValid) {
        isLookingAtCamera = null;
      } else {
        isLookingAtCamera = debounced;
      }

      let indicator: GazeTrackingDebugExtras['indicator'] = 'gray';
      let indicatorLabel = 'No face detected';
      if (stillCalibrating) {
        if (fullyValid) {
          indicator = 'blue';
          indicatorLabel = 'Calibrating... look at the camera';
        } else {
          indicator = 'gray';
          indicatorLabel = 'No face detected — calibration paused';
        }
      } else if (fullyValid) {
        indicator = debounced ? 'green' : 'amber';
        indicatorLabel = debounced ? 'Looking at camera' : 'Not looking';
      }

      const faceCount = framesFaceDetectedRef.current;
      let eyeContactStr = '—';
      if (faceCount >= MIN_FRAMES_FOR_EYE_CONTACT_RATIO) {
        const pct =
          (framesLookingWhileFaceRef.current / faceCount) * 100;
        eyeContactStr = `${pct.toFixed(1)}%`;
      }

      const baselineHStr =
        baselineHRef.current !== null
          ? baselineHRef.current.toFixed(2)
          : '—';
      const baselineVStr =
        baselineVRef.current !== null
          ? baselineVRef.current.toFixed(2)
          : '—';

      const earStr = fullyValid ? avgEAR.toFixed(2) : '—';
      const blinkStr = fullyValid ? (isBlink ? 'yes' : 'no') : 'no';
      const verticalDeviationStr =
        verticalDeviationNum !== null
          ? verticalDeviationNum.toFixed(2)
          : '—';

      const ui = flushSnapshotToUi();

      if (enableDebugExtras || now - lastUiFlushRef.current >= UI_FLUSH_MS) {
        lastUiFlushRef.current = now;

        startTransition(() => {
          setState((s) => ({
            ...s,
            isCalibrating: stillCalibrating,
            isLookingAtCamera,
            isFaceDetected: fullyValid,
            eyeContactRatio: ui.eyeContactRatio,
            lookAwayEvents: ui.lookAwayEvents,
            longestLookAwayMs: ui.longestLookAwayMs,
            totalFaceDetectedMs: ui.totalFaceDetectedMs,
            hasSufficientData: ui.hasSufficientData,
            ...(enableDebugExtras && {
              debug: {
                fps: fpsStr,
                detection: detectionLine,
                yaw: fullyValid ? yaw.toFixed(1) : '—',
                pitch: fullyValid ? pitch.toFixed(1) : '—',
                roll: fullyValid ? roll.toFixed(1) : '—',
                irisHRight: fullyValid ? rightIrisHRatio.toFixed(2) : '—',
                irisHLeft: fullyValid ? leftIrisHRatio.toFixed(2) : '—',
                irisHAvg: fullyValid ? irisHCenterRatio.toFixed(2) : '—',
                irisVRight: fullyValid ? rightIrisVRatio.toFixed(2) : '—',
                irisVLeft: fullyValid ? leftIrisVRatio.toFixed(2) : '—',
                irisVAvg: fullyValid ? irisVCenterRatio.toFixed(2) : '—',
                baselineH: baselineHStr,
                baselineV: baselineVStr,
                ear: earStr,
                blink: blinkStr,
                verticalDeviation: verticalDeviationStr,
                indicator,
                indicatorLabel,
                eyeContactDisplay: eyeContactStr,
                lookAwayMs: lookAwayMsRef.current,
                totalFaceSec: (totalFaceMsRef.current / 1000).toFixed(1),
              },
            }),
          }));
        });
      }

      return enableDebugExtras
        ? {
            fps: fpsStr,
            detection: detectionLine,
            yaw: fullyValid ? yaw.toFixed(1) : '—',
            pitch: fullyValid ? pitch.toFixed(1) : '—',
            roll: fullyValid ? roll.toFixed(1) : '—',
            irisHRight: fullyValid ? rightIrisHRatio.toFixed(2) : '—',
            irisHLeft: fullyValid ? leftIrisHRatio.toFixed(2) : '—',
            irisHAvg: fullyValid ? irisHCenterRatio.toFixed(2) : '—',
            irisVRight: fullyValid ? rightIrisVRatio.toFixed(2) : '—',
            irisVLeft: fullyValid ? leftIrisVRatio.toFixed(2) : '—',
            irisVAvg: fullyValid ? irisVCenterRatio.toFixed(2) : '—',
            baselineH: baselineHStr,
            baselineV: baselineVStr,
            ear: earStr,
            blink: blinkStr,
            verticalDeviation: verticalDeviationStr,
            indicator,
            indicatorLabel,
            eyeContactDisplay: eyeContactStr,
            lookAwayMs: lookAwayMsRef.current,
            totalFaceSec: (totalFaceMsRef.current / 1000).toFixed(1),
          }
        : undefined;
    },
    [enableDebugExtras, flushSnapshotToUi],
  );

  const stopTracking = useCallback(() => {
    rafCancelledRef.current = true;
    if (rafHandleRef.current) {
      cancelAnimationFrame(rafHandleRef.current);
      rafHandleRef.current = 0;
    }
    trackingVideoRef.current = null;
  }, []);

  const startTracking = useCallback(
    async (videoElement: HTMLVideoElement) => {
      if (
        trackingVideoRef.current === videoElement &&
        !rafCancelledRef.current
      ) {
        return;
      }

      stopTracking();

      trackingVideoRef.current = videoElement;
      rafCancelledRef.current = false;

      const landmarker = await ensureLandmarker();
      if (
        !landmarker ||
        rafCancelledRef.current ||
        trackingVideoRef.current !== videoElement
      ) {
        return;
      }

      lastUiFlushRef.current = performance.now();

      const tick = () => {
        if (rafCancelledRef.current) return;

        const video = trackingVideoRef.current;
        if (!video || !faceLandmarkerRef.current) {
          requestAnimationFrame(tick);
          return;
        }

        const now = performance.now();
        runTickInner(video, faceLandmarkerRef.current, now);

        rafHandleRef.current = requestAnimationFrame(tick);
      };

      rafHandleRef.current = requestAnimationFrame(tick);
    },
    [ensureLandmarker, runTickInner, stopTracking],
  );

  useEffect(() => {
    return () => {
      rafCancelledRef.current = true;
      if (rafHandleRef.current) {
        cancelAnimationFrame(rafHandleRef.current);
      }
      const lm = faceLandmarkerRef.current;
      if (lm) {
        lm.close();
        faceLandmarkerRef.current = null;
      }
    };
  }, []);

  const controls = useMemo<GazeTrackingControls>(
    () => ({
      startTracking,
      stopTracking,
      recalibrate,
      resetMetrics,
      resetForNewRecording,
      getSnapshot,
    }),
    [
      startTracking,
      stopTracking,
      recalibrate,
      resetMetrics,
      resetForNewRecording,
      getSnapshot,
    ],
  );

  return { state, controls };
}
