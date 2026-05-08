export function normalizeUploadFileName(fileName: string) {
  if (!fileName) {
    return '';
  }

  try {
    const decoded = Buffer.from(fileName, 'latin1').toString('utf8').trim();
    return decoded || fileName.trim();
  } catch {
    return fileName.trim();
  }
}
