import { NextResponse, type NextRequest } from 'next/server';

import { requireRole } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { CONTROL_ROOM_MUTATION_ROLE } from '@/lib/salu/control-room';
import {
  managedStylistPhotoPath,
  STYLIST_PHOTO_BUCKET,
  stylistPhotoPath,
  validateStylistPhoto,
} from '@/lib/salu/stylist-photos';

import { controlRoomError } from '../_helpers';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await requireRole(CONTROL_ROOM_MUTATION_ROLE);
    const form = await request.formData();
    const image = form.get('image');
    const stylistId = String(form.get('stylist_id') ?? '').trim();
    if (!stylistId)
      throw new Error('Save a stylist name before uploading a photo');
    if (!(image instanceof File))
      throw new Error('Choose a stylist photo to upload');
    validateStylistPhoto(image);

    const path = stylistPhotoPath(stylistId, image.type);
    const { error } = await supabaseAdmin()
      .storage.from(STYLIST_PHOTO_BUCKET)
      .upload(path, Buffer.from(await image.arrayBuffer()), {
        cacheControl: '3600',
        contentType: image.type,
        upsert: false,
      });
    if (error) throw new Error(`Photo upload failed: ${error.message}`);
    const {
      data: { publicUrl },
    } = supabaseAdmin().storage.from(STYLIST_PHOTO_BUCKET).getPublicUrl(path);
    return NextResponse.json({ image_url: publicUrl, storage_path: path });
  } catch (error) {
    return controlRoomError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireRole(CONTROL_ROOM_MUTATION_ROLE);
    const body = (await request.json().catch(() => ({}))) as {
      image_url?: unknown;
    };
    const path = managedStylistPhotoPath(String(body.image_url ?? ''));
    if (!path) throw new Error('Only managed stylist photos can be removed');
    const { error } = await supabaseAdmin()
      .storage.from(STYLIST_PHOTO_BUCKET)
      .remove([path]);
    if (error) throw new Error(`Photo removal failed: ${error.message}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return controlRoomError(error);
  }
}
