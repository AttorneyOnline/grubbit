import JSZip from 'jszip';

// Checks if string is a URL.
export function isURL(str) {
  try {
    new URL(str);
    return true;
  }
  catch (_) {
    return false;
  }
}

// Gets a dictionary of files from a zip file, where the key is the path and the
// value is the data (as a function that can be called extract() on).
export async function extractZip(data) {
  const zip = await JSZip.loadAsync(data);
  return Object.assign({}, ...Object.entries(zip.files)
    .map(([file, zipObj]) => ({
      [file]: {
        extract: () => zipObj.async('blob'),
        extractText: () => zipObj.async('text')
      }
    })));
}
