import { describe, expect, it } from 'vitest';

import {
  MAX_STYLIST_PHOTO_BYTES,
  managedStylistPhotoPath,
  photoExtension,
  validateStylistPhoto,
} from './stylist-photos';

describe('stylist photos', () => {
  it('only accepts small JPG and PNG images', () => {
    expect(photoExtension('image/jpeg')).toBe('jpg');
    expect(photoExtension('image/png')).toBe('png');
    expect(() =>
      validateStylistPhoto({ type: 'image/webp', size: 10 })
    ).toThrow('JPG or PNG');
    expect(() =>
      validateStylistPhoto({
        type: 'image/jpeg',
        size: MAX_STYLIST_PHOTO_BYTES + 1,
      })
    ).toThrow('5 MB');
  });

  it('only marks our public stylist objects as managed', () => {
    expect(
      managedStylistPhotoPath(
        'https://project.supabase.co/storage/v1/object/public/salu-stylist-photos/stylists/asha/photo.jpg'
      )
    ).toBe('stylists/asha/photo.jpg');
    expect(managedStylistPhotoPath('https://example.com/photo.jpg')).toBeNull();
  });
});
