type ApiFetch = (url: string, options?: RequestInit) => Promise<Response>;

/**
 * Upload an image file through the media API and return the stored URL.
 * WP1: brand/user images must never be embedded as data: URLs.
 */
export async function uploadImageFile(
  apiFetch: ApiFetch,
  file: File
): Promise<{ url: string; asset: any }> {
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
  const res = await apiFetch('/api/media/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      dataBase64,
      sizeBytes: file.size,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success || !data?.asset?.url) {
    throw new Error(data?.error || 'Image upload failed');
  }
  return { url: data.asset.url as string, asset: data.asset };
}
