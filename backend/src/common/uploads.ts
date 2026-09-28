import { BadRequestException } from '@nestjs/common';
import { env } from '../config/env';

/** Allowed types with their magic bytes (SVG excluded: it can carry scripts). */
const SIGNATURES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'image/png': { ext: 'png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/webp': { ext: 'webp', magic: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  'application/pdf': { ext: 'pdf', magic: (b) => b.subarray(0, 5).toString() === '%PDF-' },
};

export const uploadLimits = () => ({ fileSize: Number(process.env.UPLOAD_MAX_BYTES ?? 5 * 1024 * 1024), files: 1 });

/** Verifies size and real content type (not just the client's claim); returns the file extension to store. */
export function checkUpload(file: Express.Multer.File, imagesOnly = false): string {
  if (file.size > env().UPLOAD_MAX_BYTES) throw new BadRequestException(`File is too large. The limit is ${Math.round(env().UPLOAD_MAX_BYTES / 1024 / 1024)} MB`);
  const sig = SIGNATURES[file.mimetype];
  if (!sig || !sig.magic(file.buffer) || (imagesOnly && !file.mimetype.startsWith('image/'))) {
    throw new BadRequestException(imagesOnly ? 'Unsupported image. Use PNG, JPEG or WebP.' : 'Unsupported file type. Use PNG, JPEG, WebP or PDF.');
  }
  return sig.ext;
}
