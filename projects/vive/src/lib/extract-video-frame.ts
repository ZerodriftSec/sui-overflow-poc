/**
 * Extract a still frame from video bytes in the browser (for clip-to-clip continuity).
 */

export type ExtractedVideoFrame = {
  mimeType: "image/jpeg";
  bytes: Uint8Array;
};

export type VideoFramePosition = "first" | "last";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function loadVideoElement(objectUrl: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "auto";

    let settled = false;
    const succeed = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(video);
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      reject(new Error(message));
    };

    const timeoutId = window.setTimeout(() => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        succeed();
        return;
      }
      fail("Timed out loading video for frame extraction");
    }, 8_000);

    video.addEventListener("error", () =>
      fail("Failed to load video for frame extraction"),
    );
    video.addEventListener("loadeddata", succeed);
    video.addEventListener("loadedmetadata", () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        succeed();
        return;
      }
      // Metadata alone is enough to seek; give loadeddata a brief window.
      window.setTimeout(() => {
        if (video.videoWidth > 0) succeed();
      }, 250);
    });

    video.src = objectUrl;
  });
}

async function waitForPaintedFrame(video: HTMLVideoElement): Promise<void> {
  const rvfc = (
    video as HTMLVideoElement & {
      requestVideoFrameCallback?: (
        callback: (now: number, metadata: unknown) => void,
      ) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    }
  ).requestVideoFrameCallback;

  await Promise.race([
    new Promise<void>((resolve) => {
      if (typeof rvfc === "function") {
        rvfc.call(video, () => resolve());
        return;
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    }),
    delay(120),
  ]);
}

async function seekVideo(
  video: HTMLVideoElement,
  timeSec: number,
): Promise<void> {
  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    await waitForPaintedFrame(video);
    return;
  }

  const clamped = Math.min(
    Math.max(0, timeSec),
    Math.max(0, video.duration - 0.001),
  );

  if (Math.abs(video.currentTime - clamped) >= 0.001) {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
        if (error) reject(error);
        else resolve();
      };
      const onSeeked = () => finish();
      const onError = () =>
        finish(new Error("Failed to seek video for frame extraction"));
      const timeoutId = window.setTimeout(() => finish(), 1_500);

      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", onError);

      try {
        video.currentTime = clamped;
      } catch (error) {
        finish(
          error instanceof Error
            ? error
            : new Error("Failed to seek video for frame extraction"),
        );
      }
    });
  }

  await waitForPaintedFrame(video);
}

function canvasToJpegBytes(
  canvas: HTMLCanvasElement,
  quality = 0.92,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode video frame as JPEG"));
          return;
        }
        void blob.arrayBuffer().then(
          (buffer) => resolve(new Uint8Array(buffer)),
          (error: unknown) =>
            reject(
              error instanceof Error
                ? error
                : new Error("Failed to read encoded video frame"),
            ),
        );
      },
      "image/jpeg",
      quality,
    );
  });
}

function isMostlyBlackFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  const sampleSize = 12;
  const stepX = Math.max(1, Math.floor(width / sampleSize));
  const stepY = Math.max(1, Math.floor(height / sampleSize));
  let samples = 0;
  let dark = 0;

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const pixel = context.getImageData(x, y, 1, 1).data;
      const r = pixel[0] ?? 0;
      const g = pixel[1] ?? 0;
      const b = pixel[2] ?? 0;
      samples += 1;
      if (r + g + b < 24) {
        dark += 1;
      }
    }
  }

  return samples > 0 && dark / samples > 0.92;
}

function targetTimeForPosition(
  video: HTMLVideoElement,
  position: VideoFramePosition,
  attempt: number,
): number {
  const duration =
    Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

  if (position === "last") {
    if (duration <= 0) return 0;
    const offsets = [0.05, 0.2, 0.5, 1];
    const offset = offsets[Math.min(attempt, offsets.length - 1)] ?? 0.05;
    return Math.max(0, duration - offset);
  }

  // Avoid exact t=0 — browsers often decode that as a black frame.
  if (duration <= 0) return 0.05;
  const offsets = [0.08, 0.2, 0.4, Math.min(1, duration * 0.05)];
  return Math.min(
    duration - 0.001,
    offsets[Math.min(attempt, offsets.length - 1)] ?? 0.08,
  );
}

/**
 * Decode video bytes and capture the first or last displayable frame as JPEG.
 * Requires a browser DOM (document / canvas / video).
 */
export async function extractVideoFrame(input: {
  bytes: Uint8Array;
  mimeType?: string;
  position?: VideoFramePosition;
}): Promise<ExtractedVideoFrame> {
  if (typeof document === "undefined") {
    throw new Error("Video frame extraction requires a browser environment");
  }

  if (input.bytes.byteLength === 0) {
    throw new Error("Cannot extract a frame from empty video bytes");
  }

  const mimeType = input.mimeType?.trim() || "video/mp4";
  const position = input.position ?? "last";
  // Copy into a fresh buffer — some browsers reject views over large ArrayBuffers.
  const copy = new Uint8Array(input.bytes.byteLength);
  copy.set(input.bytes);
  const blob = new Blob([copy], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const video = await loadVideoElement(objectUrl);
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width <= 0 || height <= 0) {
      throw new Error("Video has no displayable dimensions for frame extraction");
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Failed to create canvas context for frame extraction");
    }

    let bytes: Uint8Array | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await seekVideo(video, targetTimeForPosition(video, position, attempt));
      context.drawImage(video, 0, 0, width, height);
      const candidate = await canvasToJpegBytes(canvas);
      if (!isMostlyBlackFrame(context, width, height)) {
        bytes = candidate;
        break;
      }
      bytes = candidate;
    }

    if (!bytes) {
      throw new Error("Failed to capture a video frame");
    }

    return { mimeType: "image/jpeg", bytes };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
