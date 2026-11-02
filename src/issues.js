// Back issues of the Tower Gazette: the last ten front pages, with their
// photographs, kept in their own corner of the browser's storage so the
// pictures don't slow down every ordinary save.
const KEY = 'klepto.v2.issues';
const MAX = 10;

export function loadIssues() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// Newest first. If the browser is short of room, older issues go first.
export function saveIssue(issue) {
  let list = [issue, ...loadIssues()].slice(0, MAX);
  while (list.length) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return true;
    } catch {
      list = list.slice(0, -1);
    }
  }
  return false;
}
