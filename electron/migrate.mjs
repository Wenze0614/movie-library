// The app used to be called "Movie Diary", and its folder (library, saved
// preferences) was named after it. Brings that folder across to the new name,
// once, before anything is created there.
import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';

/**
 * Moves the old app folder to the new one: the whole folder when the new one
 * doesn't exist yet (keeping saved preferences too), or just the library when
 * it does but holds no library. Never overwrites anything.
 * Returns what happened, for the log.
 */
export function migrateOldAppFolder(oldDir, newDir) {
  if (!existsSync(oldDir) || existsSync(path.join(newDir, 'data'))) return 'nothing to move';
  if (!existsSync(newDir)) {
    renameSync(oldDir, newDir);
    return `moved ${oldDir} to ${newDir}`;
  }
  if (!existsSync(path.join(oldDir, 'data'))) return 'nothing to move';
  renameSync(path.join(oldDir, 'data'), path.join(newDir, 'data'));
  return `moved the library from ${oldDir} to ${newDir}`;
}
