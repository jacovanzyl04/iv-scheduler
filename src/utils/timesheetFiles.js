import { getPrevPayCycle, getPayCycleForDate } from './payCycle';

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
];

/**
 * Upload a timesheet file to Cloudinary via unsigned upload.
 * Files are stored with public_id: timesheets/{cycleKey}/{staffId}
 * Returns { fileUrl, fileName } on success.
 */
export async function uploadTimesheetFile(cycleKey, staffId, file) {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to .env');
  }

  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('Please upload a PDF or image file (JPG, PNG, WEBP, HEIC).');
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`);
  }

  // Use 'raw' for PDFs (so they open/download correctly), 'image' for images
  const isPdf = file.type === 'application/pdf';
  const resourceType = isPdf ? 'raw' : 'image';

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('public_id', `timesheets/${cycleKey}/${staffId}_${Date.now()}`);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
    { method: 'POST', body: formData }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Upload failed. Please try again.');
  }

  const data = await res.json();
  return { fileUrl: data.secure_url, fileName: file.name };
}

/**
 * "Delete" a timesheet file — since Cloudinary deletion requires the API secret
 * (server-side only), we just clear the reference from the database.
 * The file stays in Cloudinary but 25GB free tier is plenty for timesheets.
 */
export async function deleteTimesheetFile() {
  // No-op: Cloudinary files can't be deleted client-side.
  // The URL is cleared from the database by the caller.
}

/**
 * Normalise a timesheet entry's files into an array.
 * Handles three shapes:
 *   - Modern: { files: [{ fileUrl, fileName, uploadedAt }, ...] }
 *   - Legacy single-file: { fileUrl, fileName }
 *   - None
 * Never returns undefined.
 */
export function getTimesheetFiles(entry) {
  if (!entry) return [];
  if (Array.isArray(entry.files) && entry.files.length > 0) return entry.files;
  if (entry.fileUrl) {
    return [{ fileUrl: entry.fileUrl, fileName: entry.fileName || 'timesheet', uploadedAt: entry.submittedDate || null }];
  }
  return [];
}

/**
 * Run monthly auto-cleanup of old timesheet references.
 * Strips fileUrl/fileName from database entries for old pay cycles.
 * Cloudinary files remain but URLs become orphaned (no impact, free tier is 25GB).
 *
 * Runs once per month (tracks in localStorage).
 * Example: In March, cleans Jan 25 cycle (ended Feb 24).
 */
export async function runMonthlyCleanup(timesheets, setTimesheets) {
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const cleanupKey = 'iv-scheduler-lastTimesheetCleanup';
  const lastCleanup = localStorage.getItem(cleanupKey);

  if (lastCleanup === currentMonth) return; // Already cleaned this month

  const currentCycle = getPayCycleForDate(today);
  const cycleToClean = getPrevPayCycle(currentCycle);

  try {
    // Strip file references (legacy fileUrl/fileName AND the new files array)
    // from database entries for that cycle. Cloudinary files remain but URLs
    // become orphaned — no impact, free tier is 25GB.
    if (timesheets[cycleToClean]) {
      setTimesheets(prev => {
        const updated = { ...prev };
        if (updated[cycleToClean]) {
          const updatedCycle = { ...updated[cycleToClean] };
          for (const staffId of Object.keys(updatedCycle)) {
            const entry = updatedCycle[staffId];
            if (entry?.fileUrl || entry?.files) {
              const { fileUrl, fileName, files, ...rest } = entry;
              updatedCycle[staffId] = rest;
            }
          }
          updated[cycleToClean] = updatedCycle;
        }
        return updated;
      });
    }

    localStorage.setItem(cleanupKey, currentMonth);
  } catch (e) {
    console.error('[Timesheet Cleanup] Failed:', e);
  }
}
