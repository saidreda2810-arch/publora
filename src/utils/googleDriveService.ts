/**
 * Google Drive API v3 Integration Service
 * Provides typed operations for browsing, searching, uploading, and managing
 * Google Drive files and video assets using authenticated OAuth access tokens.
 */

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  thumbnailLink?: string;
  webViewLink?: string;
  iconLink?: string;
  videoMediaMetadata?: {
    width?: number;
    height?: number;
    durationMillis?: string;
  };
}

export interface DriveListResponse {
  files: DriveFileItem[];
  nextPageToken?: string;
}

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

/**
 * List files and folders from Google Drive
 */
export async function listDriveFiles(
  accessToken: string,
  options: {
    folderId?: string;
    searchTerm?: string;
    onlyVideos?: boolean;
    pageSize?: number;
    pageToken?: string;
  } = {}
): Promise<DriveListResponse> {
  const { folderId = 'root', searchTerm, onlyVideos, pageSize = 30, pageToken } = options;

  let queryParts: string[] = ["trashed = false"];

  if (folderId) {
    queryParts.push(`'${folderId}' in parents`);
  }

  if (onlyVideos) {
    queryParts.push("(mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.folder')");
  }

  if (searchTerm && searchTerm.trim()) {
    const escaped = searchTerm.replace(/'/g, "\\'");
    queryParts.push(`name contains '${escaped}'`);
  }

  const q = queryParts.join(' and ');
  const params = new URLSearchParams({
    q,
    pageSize: String(pageSize),
    fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, thumbnailLink, webViewLink, iconLink, videoMediaMetadata)',
    orderBy: 'folder,modifiedTime desc',
  });

  if (pageToken) {
    params.set('pageToken', pageToken);
  }

  const res = await fetch(`${DRIVE_API_BASE}/files?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `Google Drive API error (${res.status})`);
  }

  return await res.json();
}

/**
 * Get metadata for a specific Google Drive file or folder
 */
export async function getDriveFileMetadata(
  accessToken: string,
  fileId: string
): Promise<DriveFileItem> {
  const params = new URLSearchParams({
    fields: 'id, name, mimeType, size, modifiedTime, thumbnailLink, webViewLink, iconLink, videoMediaMetadata',
  });

  const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `Failed to fetch file metadata (${res.status})`);
  }

  return await res.json();
}

/**
 * Create a new folder in Google Drive
 */
export async function createDriveFolder(
  accessToken: string,
  folderName: string,
  parentFolderId?: string
): Promise<DriveFileItem> {
  const metadata: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };

  if (parentFolderId && parentFolderId !== 'root') {
    metadata.parents = [parentFolderId];
  }

  const res = await fetch(`${DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `Failed to create folder (${res.status})`);
  }

  return await res.json();
}

/**
 * Upload a file directly to Google Drive via multipart upload
 */
export async function uploadFileToDrive(
  accessToken: string,
  file: File,
  parentFolderId?: string
): Promise<DriveFileItem> {
  const metadata: any = {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
  };

  if (parentFolderId && parentFolderId !== 'root') {
    metadata.parents = [parentFolderId];
  }

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const reader = new FileReader();

  const fileDataPromise = new Promise<ArrayBuffer>((resolve, reject) => {
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });

  const arrayBuffer = await fileDataPromise;
  const metadataPart = delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${file.type || 'application/octet-stream'}\r\n` +
    'Content-Transfer-Encoding: base64\r\n\r\n';

  // Convert arrayBuffer to base64
  let binary = '';
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64Data = btoa(binary);

  const multipartBody = metadataPart + base64Data + closeDelimiter;

  const res = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `Failed to upload file to Google Drive (${res.status})`);
  }

  return await res.json();
}

/**
 * Delete a file or folder from Google Drive
 * Note: Caller must provide explicit confirmation before calling this function
 */
export async function deleteDriveFile(
  accessToken: string,
  fileId: string
): Promise<boolean> {
  const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok && res.status !== 204) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `Failed to delete file (${res.status})`);
  }

  return true;
}
