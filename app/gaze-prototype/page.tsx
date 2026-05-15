'use client';

import { useEffect, useRef, useState } from 'react';
import { useGazeTracking } from '@/hooks/useGazeTracking';

export default function GazePrototypePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const [cameraStatus, setCameraStatus] = useState('Requesting permission...');
  const [cameraReady, setCameraReady] = useState(false);
  const [videoHasFrameData, setVideoHasFrameData] = useState(false);

  const { state, controls } = useGazeTracking({ enableDebugExtras: true });
  const controlsRef = useRef(controls);

  useEffect(() => {
    controlsRef.current = controls;
  });

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
      controlsRef.current.stopTracking();
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
    if (!cameraReady || !videoHasFrameData) {
      return;
    }
    const v = videoRef.current;
    if (!v) {
      return;
    }
    void controlsRef.current.startTracking(v);
    return () => {
      controlsRef.current.stopTracking();
    };
  }, [cameraReady, videoHasFrameData]);

  const debug = state.debug;

  const indicatorColorClass =
    debug?.indicator === 'green'
      ? 'bg-emerald-500'
      : debug?.indicator === 'amber'
        ? 'bg-amber-500'
        : debug?.indicator === 'red'
          ? 'bg-red-500'
          : debug?.indicator === 'blue'
            ? 'bg-blue-500'
            : 'bg-gray-500';

  const eyeContactDisplay =
    state.eyeContactRatio != null
      ? `${state.eyeContactRatio.toFixed(1)}%`
      : '—';

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
            {debug?.indicatorLabel ?? '—'}
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
            {state.landmarkerStatus === 'ready'
              ? 'Ready'
              : state.landmarkerStatus === 'loading'
                ? 'Loading...'
                : state.landmarkerStatus === 'error'
                  ? `Error: ${state.landmarkerError ?? ''}`
                  : 'Idle'}
          </span>
        </div>
        <div>
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            Detection:{' '}
          </span>
          <span className="text-gray-900 dark:text-gray-100">
            {debug?.detection ?? '—'}
          </span>
        </div>
        <div>
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            FPS:{' '}
          </span>
          <span className="tabular-nums text-gray-900 dark:text-gray-100">
            {debug?.fps ?? '—'}
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
            {debug?.yaw ?? '—'}°
          </span>{' '}
          · Pitch:{' '}
          <span className="tabular-nums text-gray-900 dark:text-white">
            {debug?.pitch ?? '—'}°
          </span>{' '}
          · Roll:{' '}
          <span className="tabular-nums text-gray-900 dark:text-white">
            {debug?.roll ?? '—'}°
          </span>
        </p>
        <p className="text-gray-700 dark:text-gray-300">
          Iris horizontal (R / L / avg):{' '}
          <span className="tabular-nums text-gray-900 dark:text-white">
            {debug?.irisHRight} / {debug?.irisHLeft} / {debug?.irisHAvg}
          </span>
        </p>
        <p className="text-gray-700 dark:text-gray-300">
          Iris vertical (R / L / avg):{' '}
          <span className="tabular-nums text-gray-900 dark:text-white">
            {debug?.irisVRight} / {debug?.irisVLeft} / {debug?.irisVAvg}
          </span>
        </p>
        <p className="text-gray-700 dark:text-gray-300">
          Baseline H / V:{' '}
          <span className="tabular-nums text-gray-900 dark:text-white">
            {debug?.baselineH} / {debug?.baselineV}
          </span>
        </p>
        <p className="text-gray-700 dark:text-gray-300">
          EAR:{' '}
          <span className="tabular-nums text-gray-900 dark:text-white">
            {debug?.ear}
          </span>
        </p>
        <p className="text-gray-700 dark:text-gray-300">
          Blink:{' '}
          <span className="tabular-nums text-gray-900 dark:text-white">
            {debug?.blink}
          </span>
        </p>
        <p className="text-gray-700 dark:text-gray-300">
          Vertical deviation:{' '}
          <span className="tabular-nums text-gray-900 dark:text-white">
            {debug?.verticalDeviation}
          </span>
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/90 p-4 text-sm shadow-sm dark:border-gray-600 dark:bg-gray-900/80">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-gray-800 dark:text-gray-200">
            Session metrics
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded border border-blue-500 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/50"
              onClick={() => controls.recalibrate()}
            >
              Recalibrate
            </button>
            <button
              type="button"
              className="rounded border border-gray-500 px-3 py-1 text-xs font-medium text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800"
              onClick={() => controls.resetMetrics()}
            >
              Reset metrics
            </button>
          </div>
        </div>
        <p className="text-gray-700 dark:text-gray-300">
          Eye contact ratio:{' '}
          <span className="font-medium text-gray-900 dark:text-white">
            {eyeContactDisplay}
          </span>
        </p>
        <p className="text-gray-700 dark:text-gray-300">
          Look-away events:{' '}
          <span className="tabular-nums font-medium text-gray-900 dark:text-white">
            {state.lookAwayEvents}
          </span>
        </p>
        <p className="text-gray-700 dark:text-gray-300">
          Current look-away duration:{' '}
          <span className="tabular-nums font-medium text-gray-900 dark:text-white">
            {((debug?.lookAwayMs ?? 0) / 1000).toFixed(1)} s
          </span>
        </p>
        <p className="text-gray-700 dark:text-gray-300">
          Total face-detected time:{' '}
          <span className="tabular-nums font-medium text-gray-900 dark:text-white">
            {debug?.totalFaceSec ?? '0.0'} s
          </span>
        </p>
      </div>
    </main>
  );
}
