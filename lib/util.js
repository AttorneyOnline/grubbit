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
