/**
 * Saved-theme library. A theme made in Tela (or anywhere else) is stored as a ProfileThemePreset
 * owned by the user, so it appears in Settings → Appearance → My Themes next to the ones they
 * uploaded, can be applied from there, and is cloud-saved with their account.
 */
import { auth, createThemePreset, uploadFile } from './backendService';

export interface SaveThemeInput {
  title: string;
  /** Rendered artwork — a PNG/JPEG blob. */
  image: Blob;
  description?: string;
}

/** Uploads the artwork and creates a private theme preset. Returns the new preset id. */
export async function saveImageAsTheme({ title, image, description }: SaveThemeInput): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to save a theme.');
  const clean = title.trim().slice(0, 80) || 'Untitled theme';
  const ext = image.type === 'image/jpeg' ? 'jpg' : 'png';
  const url = await uploadFile(`themes/${uid}/tela_${Date.now()}.${ext}`, image);
  const id = await createThemePreset({
    title: clean,
    description: description || 'Made in Tela',
    mode: 'PHOTO_ONLY',
    isPublic: false,
    assets: [{ id: `a_${Date.now()}`, url, type: 'PHOTO' }],
    coverImage: url,
  });
  if (!id) throw new Error('Could not save the theme.');
  return id;
}
