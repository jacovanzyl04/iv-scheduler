import { storage, storageRef, uploadBytes, getDownloadURL, deleteObject, listAll, isConfigured } from './firebase';
import { getPrevPayCycle, getPayCycleForDate } from './payCycle';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
];

/**
 * Upload a timesheet file for a staff member in a specific pay cycle.
 * Stores at: timesheets/{cycleKey}/{staffId}/{filename}
 * Returns { fileUrl, fileName } on success.
 */
export async function uploadTimesheetFile(cycleKey, staffId, file) {
  if (!isConfigured || !storage) {
    throw new Error('Firebase Storage is not configured');
  }

  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('Please upload a PDF or image file (JPG, PNG, WEBP, HEIC).');
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`);
  }

  // Delete any existing file first (for replacements)
  await deleteTimesheetFile(cycleKey, staffId);

  const filePath = `timesheets/${cycleKey}/${staffId}/${file.name}`;
  const fileRef = storageRef(storage, filePath);

  await uploadBytes(fileRef, file, { contentType: file.type });
  const fileUrl = await getDownloadURL(fileRef);

  return { fileUrl, fileName: file.name };
}

/**
 * Delete timesheet file(s) for a staff member in a specific pay cycle.
 * Silently succeeds if no file exists.
 */
export async function deleteTimesheetFile(cycleKey, staffId) {
  if (!isConfigured || !storage) return;

  const folderRef = storageRef(storage, `timesheets/${cycleKey}/${staffId}`);

  try {
    const result = await listAll(folderRef);
    await Promise.all(result.items.map(item => deleteObject(item)));
  } catch (e) {
    // Folder might not exist yet — that's fine
  }
}

/**
 * Delete ALL files for an entire pay cycle (used for auto-cleanup).
 */
async function deletePayCycleFiles(cycleKey) {
  if (!isConfigured || !storage) return;

  const cycleFolderRef = storageRef(storage, `timesheets/${cycleKey}`);

  try {
    const staffFolders = await listAll(cycleFolderRef);

    for (const prefix of staffFolders.prefixes) {
      const staffFiles = await listAll(prefix);
      await Promise.all(staffFiles.items.map(item => deleteObject(item)));
    }

    // Also delete any direct items at cycle level (defensive)
    await Promise.all(staffFolders.items.map(item => deleteObject(item)));
  } catch (e) {
    console.warn('[Timesheet Cleanup] Error for cycle', cycleKey, ':', e.message);
  }
}

/**
 * Run monthly auto-cleanup of old timesheet files.
 * Deletes the previous pay cycle's uploaded files from Storage
 * and strips fileUrl/fileName from database entries.
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

  // The cycle to clean: previous cycle before the current one
  // On March 1+, current cycle = Feb 25, previous = Jan 25
  const currentCycle = getPayCycleForDate(today);
  const cycleToClean = getPrevPayCycle(currentCycle);

  console.log(`[Timesheet Cleanup] Cleaning files for cycle: ${cycleToClean}`);

  try {
    await deletePayCycleFiles(cycleToClean);

    // Strip fileUrl/fileName from RTDB data for that cycle
    if (timesheets[cycleToClean]) {
      setTimesheets(prev => {
        const updated = { ...prev };
        if (updated[cycleToClean]) {
          const updatedCycle = { ...updated[cycleToClean] };
          for (const staffId of Object.keys(updatedCycle)) {
            if (updatedCycle[staffId].fileUrl) {
              const { fileUrl, fileName, ...rest } = updatedCycle[staffId];
              updatedCycle[staffId] = rest;
            }
          }
          updated[cycleToClean] = updatedCycle;
        }
        return updated;
      });
    }

    localStorage.setItem(cleanupKey, currentMonth);
    console.log(`[Timesheet Cleanup] Done. Cleaned cycle ${cycleToClean}`);
  } catch (e) {
    console.error('[Timesheet Cleanup] Failed:', e);
  }
}
