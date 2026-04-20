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
 * Upload a payslip file to Cloudinary via unsigned upload.
 * Stored under `payslips/{cycleKey}/{staffId}_{timestamp}` so resends don't
 * overwrite the original. Returns { fileUrl, fileName } on success.
 *
 * Unlike timesheets, payslips are NOT auto-cleaned monthly — HR and staff
 * may want to refer back to past payslips for months.
 */
export async function uploadPayslipFile(cycleKey, staffId, file) {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to .env');
  }

  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('Please upload a PDF or image file (JPG, PNG, WEBP, HEIC).');
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`);
  }

  const isPdf = file.type === 'application/pdf';
  const resourceType = isPdf ? 'raw' : 'image';

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('public_id', `payslips/${cycleKey}/${staffId}_${Date.now()}`);

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
