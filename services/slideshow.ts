/**
 * Resolving which images a release's slideshow shows.
 *
 * This logic was duplicated as an inline ternary at five call sites across PlayerView and
 * GlobalPlayer, and had drifted apart: the nano player's back face read only `album.slideshow`
 * (so albums whose slides live on their tracks reported "no slideshow assets available"), and
 * one variant padded the list with picsum.photos stock photos — presenting random stock imagery
 * as the creator's own work.
 */

interface SlideshowAlbum {
  slideshow?: string[];
  coverImage?: string;
}

interface SlideshowTrack {
  images?: string[];
}

/**
 * The images to show, in priority order: the playing track's own images, then the album's
 * slideshow set, then the cover art as a single still. Never fabricates filler.
 */
export function resolveSlideshowImages(
  album?: SlideshowAlbum | null,
  track?: SlideshowTrack | null,
): string[] {
  if (track?.images?.length) return track.images;
  if (album?.slideshow?.length) return album.slideshow;
  return album?.coverImage ? [album.coverImage] : [];
}

/**
 * Whether a release has real slides, as opposed to a lone cover image standing in for one.
 * Used to decide whether auto-starting the slideshow is worth doing at all — a "slideshow" of
 * one frame just hides the cover art behind a blurrier copy of itself.
 */
export function hasRealSlides(
  album?: SlideshowAlbum | null,
  tracks?: SlideshowTrack[] | null,
): boolean {
  return (album?.slideshow?.length || 0) > 0 || !!tracks?.some(t => (t.images?.length || 0) > 1);
}
