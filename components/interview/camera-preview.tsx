'use client';

import { forwardRef, useEffect } from 'react';

export type CameraPreviewProps = {
  stream: MediaStream | null;
  isLookingAtCamera: boolean | null;
  isCalibrating: boolean;
  isFaceDetected: boolean;
};

export const CameraPreview = forwardRef<HTMLVideoElement, CameraPreviewProps>(
  function CameraPreview(
    { stream, isLookingAtCamera, isCalibrating, isFaceDetected },
    ref,
  ) {
    useEffect(() => {
      const el =
        ref && typeof ref === 'object' && 'current' in ref
          ? ref.current
          : null;
      if (!el) return;
      if (stream) {
        el.srcObject = stream;
        void el.play().catch(() => {});
      } else {
        el.srcObject = null;
      }
    }, [stream, ref]);

    let dotClass = 'bg-gray-400';
    let statusLabel = 'No face';
    if (isCalibrating && isFaceDetected) {
      dotClass = 'bg-blue-500';
      statusLabel = 'Calibrating…';
    } else if (!isFaceDetected) {
      dotClass = 'bg-gray-400';
      statusLabel = 'No face';
    } else if (isLookingAtCamera === true) {
      dotClass = 'bg-emerald-500';
      statusLabel = 'On camera';
    } else if (isLookingAtCamera === false) {
      dotClass = 'bg-amber-500';
      statusLabel = 'Look away';
    }

    return (
      <div className="relative h-[135px] w-[180px] shrink-0 overflow-hidden rounded-lg border border-gray-300 bg-black shadow-md dark:border-gray-600">
        <div className="h-full w-full scale-x-[-1]">
          <video
            ref={ref}
            className="h-full w-full object-cover"
            autoPlay
            playsInline
            muted
            aria-hidden
          />
        </div>
        <div className="pointer-events-none absolute bottom-1 left-1 right-1 flex items-center gap-1.5 rounded bg-black/55 px-1.5 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`}
            aria-hidden
          />
          <span className="truncate">{statusLabel}</span>
        </div>
      </div>
    );
  },
);
