'use client';

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { useEffect, useRef, useState } from 'react';

export default function GazePrototypePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const initInProgressRef = useRef(false);
  const hasLoggedRef = useRef(false);
  const totalFramesRef = useRef(0);
  const frameTimestampsRef = useRef<number[]>([]);

  const ROLLING_N = 30;

  const [cameraStatus, setCameraStatus] = useState('Requesting permission...');
  const [mediaPipeStatus, setMediaPipeStatus] = useState('Waiting...');
  const [detectionStatus, setDetectionStatus] = useState('Waiting...');
  const [fpsDisplay, setFpsDisplay] = useState('Measuring...');

  const [cameraReady, setCameraReady] = useState(false);
  const [landmarkerReady, setLandmarkerReady] = useState(false);
  const [videoHasFrameData, setVideoHasFrameData] = useState(false);

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
    void queueMicrotask(() => {
      setFpsDisplay('Measuring...');
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

        if (stamps.length < ROLLING_N) {
          setFpsDisplay('Measuring...');
        } else {
          const oldest = stamps[0]!;
          const latest = stamps[ROLLING_N - 1]!;
          const dtMs = latest - oldest;
          if (dtMs > 0) {
            const fps = (ROLLING_N / dtMs) * 1000;
            setFpsDisplay(`${fps.toFixed(1)} fps`);
          }
        }

        const hasFace = (result.faceLandmarks?.length ?? 0) > 0;
        setDetectionStatus(hasFace ? 'Face detected' : 'No face detected');

        if (
          !hasLoggedRef.current &&
          result.faceLandmarks &&
          result.faceLandmarks.length > 0
        ) {
          hasLoggedRef.current = true;
          console.log('First detection result:', result);
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

  return (
    <main className="mx-auto max-w-3xl p-6 text-gray-900 dark:text-gray-100">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        Gaze Detection Prototype
      </h1>

      <div className="relative h-[480px] w-[640px] max-w-full overflow-hidden rounded-lg border border-gray-200 bg-black shadow-sm dark:border-gray-600">
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

      <div className="mt-6 space-y-3 rounded-lg border border-gray-200 bg-gray-50/90 p-4 text-sm shadow-sm dark:border-gray-600 dark:bg-gray-900/80">
        <div>
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            Camera:{' '}
          </span>
          <span className="text-gray-900 dark:text-gray-100">{cameraStatus}</span>
        </div>
        <div>
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            MediaPipe:{' '}
          </span>
          <span className="text-gray-900 dark:text-gray-100">{mediaPipeStatus}</span>
        </div>
        <div>
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            Detection:{' '}
          </span>
          <span className="text-gray-900 dark:text-gray-100">{detectionStatus}</span>
        </div>
        <div>
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            FPS:{' '}
          </span>
          <span className="tabular-nums text-gray-900 dark:text-gray-100">
            {fpsDisplay}
          </span>
        </div>
      </div>
    </main>
  );
}
