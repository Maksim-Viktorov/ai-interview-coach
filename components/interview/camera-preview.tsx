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

    let dotClass = 'bg-text-muted';
    let statusLabel = 'No face';
    if (isCalibrating && isFaceDetected) {
      dotClass = 'bg-brand';
      statusLabel = 'Calibrating…';
    } else if (!isFaceDetected) {
      dotClass = 'bg-text-muted';
      statusLabel = 'No face';
    } else if (isLookingAtCamera === true) {
      dotClass = 'bg-score-good';
      statusLabel = 'On camera';
    } else if (isLookingAtCamera === false) {
      dotClass = 'bg-score-mid';
      statusLabel = 'Look away';
    }

    return (
      <div className="relative my-6 inline-block w-[240px] overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="h-[180px] w-full scale-x-[-1]">
          <video
            ref={ref}
            className="h-full w-full object-cover"
            autoPlay
            playsInline
            muted
            aria-hidden
          />
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-lg bg-surface/90 px-2.5 py-1.5 backdrop-blur-sm">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`}
            aria-hidden
          />
          <span className="truncate font-body text-xs text-text-primary">
            {statusLabel}
          </span>
        </div>
      </div>
    );
  },
);
