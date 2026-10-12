import { ValidationError } from 'fondu'

/**
 * Only these images, recognized by their first bytes (the type the browser declares is the client's word, and an
 * SVG is a document that can run script). Demo storage: a data: URL in the user's `image`; a real app puts the
 * file in object storage (R2) and keeps its URL.
 */
const TYPES: Array<[type: string, magic: number[]]> = [
  ['image/png', [0x89, 0x50, 0x4e, 0x47]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/gif', [0x47, 0x49, 0x46, 0x38]],
  ['image/webp', [0x52, 0x49, 0x46, 0x46]], // RIFF…WEBP, checked below
]
export async function toDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = TYPES.find(([t, magic]) => magic.every((b, i) => bytes[i] === b) && (t !== 'image/webp' || String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'))?.[0]
  if (!type) throw new ValidationError({ avatar: 'Choose a PNG, JPEG, GIF or WebP image' })
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${type};base64,${btoa(binary)}`
}
