
/**
 * Captures a frame from a video at a specific time or a random time within a range.
 * @param videoSource URL or File of the video
 * @param timeInSeconds Time to capture the frame at. If undefined, a random time within 10s is used.
 * @returns Promise resolving to a Blob of the captured frame
 */
export async function captureVideoFrame(videoSource: string | File, timeInSeconds?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    const url = typeof videoSource === 'string' ? videoSource : URL.createObjectURL(videoSource);
    video.src = url;

    video.onloadedmetadata = () => {
      const duration = video.duration;
      const targetTime = timeInSeconds !== undefined 
        ? Math.min(timeInSeconds, duration) 
        : Math.random() * Math.min(30, duration);

      video.currentTime = targetTime;
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Could not capture frame'));
        }
        if (typeof videoSource !== 'string') URL.revokeObjectURL(url);
      }, 'image/jpeg', 0.8);
    };

    video.onerror = (e) => {
      reject(e);
      if (typeof videoSource !== 'string') URL.revokeObjectURL(url);
    };
  });
}
