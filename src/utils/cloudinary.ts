import {
  CloudinaryMediaRecord,
  MediaAppSource,
  MediaEntityType,
  MediaResourceType,
  MediaUploaderRole,
} from '../types/business';
import { isAdminOnlyAppMode } from './appMode';
import { firestoreService } from './firestoreService';

export const CLOUDINARY_CLOUD_NAME = 'lshnc1re';
export const CLOUDINARY_UPLOAD_PRESET = 'glamour_gallery_preset';
export const CLOUDINARY_IMAGE_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
export const CLOUDINARY_VIDEO_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;

export const MAX_CLOUDINARY_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_CLOUDINARY_VIDEO_BYTES = 80 * 1024 * 1024; // 80 MB

const VIDEO_EXTENSION_REGEX = /\.(mp4|webm|mov|m4v|ogg|ogv|avi|mkv)(\?.*)?$/i;

export interface UploadMediaOptions {
  role: MediaUploaderRole;
  appSource?: MediaAppSource;
  folder: string;
  relatedEntityType: MediaEntityType;
  relatedEntityId?: string;
  uploadedByUid?: string;
  allowedTypes?: MediaResourceType[];
  maxImageBytes?: number;
  maxVideoBytes?: number;
  persistRecord?: boolean;
  onProgress?: (percent: number) => void;
}

export function resolveAppSource(explicit?: MediaAppSource): MediaAppSource {
  if (explicit) return explicit;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host.includes('ggadminpanel')) return 'ggadminpanel';
  }
  return isAdminOnlyAppMode() ? 'ggadminpanel' : 'glamour-galleria';
}

export function detectMediaResourceType(file: File): MediaResourceType | null {
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';

  const name = (file.name || '').toLowerCase();
  if (/\.(png|jpe?g|webp|gif|bmp|avif|heic|heif|svg)$/i.test(name)) {
    return 'image';
  }
  if (VIDEO_EXTENSION_REGEX.test(name)) {
    return 'video';
  }
  return null;
}

export function validateMediaFile(
  file: File,
  options?: {
    allowedTypes?: MediaResourceType[];
    maxImageBytes?: number;
    maxVideoBytes?: number;
  }
): { valid: true; resourceType: MediaResourceType } | { valid: false; error: string } {
  const resourceType = detectMediaResourceType(file);
  const allowed = options?.allowedTypes ?? ['image', 'video'];

  if (!resourceType) {
    return {
      valid: false,
      error:
        allowed.length === 1 && allowed[0] === 'video'
          ? 'Please select a valid video file (MP4, WebM, MOV).'
          : allowed.length === 1 && allowed[0] === 'image'
            ? 'Please select a valid image file (JPG, PNG, WebP).'
            : 'Unsupported file format. Please choose a valid image or video file.',
    };
  }

  if (!allowed.includes(resourceType)) {
    return {
      valid: false,
      error:
        allowed[0] === 'image'
          ? 'Only image files (JPG, PNG, WebP) are allowed for this upload.'
          : 'Only video files (MP4, WebM, MOV) are allowed for this upload.',
    };
  }

  const maxBytes =
    resourceType === 'video'
      ? options?.maxVideoBytes ?? MAX_CLOUDINARY_VIDEO_BYTES
      : options?.maxImageBytes ?? MAX_CLOUDINARY_IMAGE_BYTES;

  if (file.size <= 0) {
    return { valid: false, error: 'Selected file appears to be empty.' };
  }

  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    return {
      valid: false,
      error: `${resourceType === 'video' ? 'Video' : 'Image'} is too large (${(
        file.size /
        (1024 * 1024)
      ).toFixed(1)} MB). Maximum allowed size is ${maxMb} MB.`,
    };
  }

  return { valid: true, resourceType };
}

export function isVideoUrl(
  url?: string | null,
  explicitType?: MediaResourceType
): boolean {
  if (explicitType === 'video') return true;
  if (explicitType === 'image') return false;
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('data:video/')) return true;
  if (trimmed.includes('res.cloudinary.com/') && trimmed.includes('/video/upload/')) {
    return true;
  }
  return VIDEO_EXTENSION_REGEX.test(trimmed);
}

export function getOptimizedMediaUrl(
  url?: string | null,
  resourceType?: MediaResourceType
): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  // Keep legacy base64 data URIs, blob previews, and local /assets/ untouched
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('/')
  ) {
    return trimmed;
  }

  const marker = '/upload/';
  if (!trimmed.includes(`res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/`)) {
    return trimmed;
  }

  const effectiveType: MediaResourceType =
    resourceType ?? (isVideoUrl(trimmed) ? 'video' : 'image');
  void effectiveType;

  const idx = trimmed.indexOf(marker);
  if (idx === -1) return trimmed;

  const before = trimmed.slice(0, idx + marker.length);
  const after = trimmed.slice(idx + marker.length);

  // Avoid duplicate transform injection if f_auto / q_auto or a transformation already sits right after /upload/
  if (
    after.startsWith('f_auto') ||
    after.startsWith('q_auto') ||
    /^[a-z]{1,3}_[^/]+\//.test(after)
  ) {
    return trimmed;
  }

  return `${before}f_auto,q_auto/${after}`;
}

export function getMediaCrossOrigin(
  url?: string | null
): 'anonymous' | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return 'anonymous';
  }
  return undefined;
}

interface CloudinaryApiSuccessResponse {
  secure_url?: string;
  url?: string;
  public_id?: string;
  resource_type?: string;
  format?: string;
  width?: number;
  height?: number;
  bytes?: number;
  duration?: number;
  error?: { message?: string };
}

export async function uploadMediaToCloudinary(
  file: File,
  options: UploadMediaOptions
): Promise<CloudinaryMediaRecord> {
  const check = validateMediaFile(file, {
    allowedTypes: options.allowedTypes,
    maxImageBytes: options.maxImageBytes,
    maxVideoBytes: options.maxVideoBytes,
  });

  if (!check.valid) {
    throw new Error(check.error);
  }

  const resourceType = check.resourceType;
  const endpoint =
    resourceType === 'video'
      ? CLOUDINARY_VIDEO_UPLOAD_URL
      : CLOUDINARY_IMAGE_UPLOAD_URL;

  const appSource = resolveAppSource(options.appSource);
  const cleanFolder = options.folder.replace(/^\/+|\/+$/g, '');

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  if (cleanFolder) {
    formData.append('folder', cleanFolder);
  }

  options.onProgress?.(1);

  const responseData = await new Promise<CloudinaryApiSuccessResponse>(
    (resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint, true);

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && evt.total > 0) {
          const pct = Math.min(99, Math.max(1, Math.round((evt.loaded / evt.total) * 100)));
          options.onProgress?.(pct);
        }
      };

      xhr.onload = () => {
        try {
          const parsed = JSON.parse(xhr.responseText || '{}') as CloudinaryApiSuccessResponse;
          if (xhr.status >= 200 && xhr.status < 300 && (parsed.secure_url || parsed.url)) {
            options.onProgress?.(100);
            resolve(parsed);
          } else {
            const msg =
              parsed?.error?.message ||
              `Cloudinary upload failed (HTTP ${xhr.status}). Please try again.`;
            reject(new Error(msg));
          }
        } catch {
          reject(
            new Error(`Cloudinary returned an unexpected response (HTTP ${xhr.status}).`)
          );
        }
      };

      xhr.onerror = () => {
        reject(
          new Error(
            'Network error while uploading media to Cloudinary. Please check your internet connection and try again.'
          )
        );
      };

      xhr.onabort = () => {
        reject(new Error('Media upload was cancelled.'));
      };

      xhr.send(formData);
    }
  );

  const rawSecureUrl = String(responseData.secure_url || responseData.url || '').trim();
  const secureUrl = rawSecureUrl.startsWith('http://')
    ? `https://${rawSecureUrl.slice('http://'.length)}`
    : rawSecureUrl;

  if (!secureUrl) {
    throw new Error('Cloudinary did not return a secure media URL.');
  }

  const record: CloudinaryMediaRecord = {
    id: `med-${crypto.randomUUID()}`,
    appSource,
    uploadedByRole: options.role,
    ...(options.uploadedByUid ? { uploadedByUid: options.uploadedByUid } : {}),
    relatedEntityType: options.relatedEntityType,
    ...(options.relatedEntityId ? { relatedEntityId: options.relatedEntityId } : {}),
    folder: cleanFolder,
    publicId: String(responseData.public_id || '').trim() || `cloudinary-${Date.now()}`,
    secureUrl,
    resourceType:
      responseData.resource_type === 'video' ? 'video' : resourceType,
    ...(responseData.format ? { format: responseData.format } : {}),
    ...(typeof responseData.width === 'number' ? { width: responseData.width } : {}),
    ...(typeof responseData.height === 'number' ? { height: responseData.height } : {}),
    ...(typeof responseData.bytes === 'number' ? { bytes: responseData.bytes } : {}),
    ...(typeof responseData.duration === 'number'
      ? { duration: responseData.duration }
      : {}),
    createdAt: new Date().toISOString(),
  };

  if (options.persistRecord !== false) {
    try {
      await firestoreService.saveMediaRecord(record);
    } catch (err) {
      // Never lose a successful Cloudinary upload if metadata audit logging fails
      console.warn('Media metadata record save warning:', err);
    }
  }

  return record;
}
