export const STYLIST_PHOTO_BUCKET = 'salu-stylist-photos';
export const MAX_STYLIST_PHOTO_BYTES = 5 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export function photoExtension(contentType: string) {
  return EXTENSIONS[contentType.toLowerCase()] ?? '';
}

export function validateStylistPhoto(file: { type: string; size: number }) {
  if (!photoExtension(file.type)) {
    throw new Error('Use a JPG or PNG stylist photo.');
  }
  if (!file.size) throw new Error('Choose a stylist photo to upload.');
  if (file.size > MAX_STYLIST_PHOTO_BYTES) {
    throw new Error('Stylist photos must be 5 MB or smaller.');
  }
}

function safeSegment(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'stylist'
  );
}

export function stylistPhotoPath(stylistId: string, contentType: string) {
  const extension = photoExtension(contentType);
  if (!extension) throw new Error('Use a JPG or PNG stylist photo.');
  return `stylists/${safeSegment(stylistId)}/${crypto.randomUUID()}.${extension}`;
}

export function managedStylistPhotoPath(imageUrl: string) {
  try {
    const url = new URL(imageUrl);
    const prefix = `/storage/v1/object/public/${STYLIST_PHOTO_BUCKET}/`;
    if (!url.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    return path.startsWith('stylists/') && path.length > 'stylists/'.length
      ? path
      : null;
  } catch {
    return null;
  }
}
