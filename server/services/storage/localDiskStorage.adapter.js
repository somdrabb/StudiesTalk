'use strict';

const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resolveSafePath(baseDir, key = '') {
  const resolvedBase = path.resolve(String(baseDir || ''));
  const targetPath = path.resolve(resolvedBase, String(key || ''));
  const relative = path.relative(resolvedBase, targetPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return targetPath;
}

function isFileMissing(error) {
  return error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

function createLocalDiskStorageAdapter({ rootDir }) {
  const normalizedRoot = path.resolve(String(rootDir || ''));
  ensureDir(normalizedRoot);

  function resolveKeyPath(key) {
    const targetPath = resolveSafePath(normalizedRoot, key);
    if (!targetPath) {
      const err = new Error('Invalid storage key');
      err.code = 'INVALID_STORAGE_KEY';
      throw err;
    }
    return targetPath;
  }

  return {
    providerName: 'local_disk',
    rootDir: normalizedRoot,
    resolveKeyPath,
    async exists(key) {
      try {
        await fs.promises.access(resolveKeyPath(key), fs.constants.F_OK);
        return true;
      } catch (err) {
        if (isFileMissing(err)) return false;
        throw err;
      }
    },
    async putFile({ key, sourcePath }) {
      const targetPath = resolveKeyPath(key);
      ensureDir(path.dirname(targetPath));
      try {
        await fs.promises.access(targetPath, fs.constants.F_OK);
        return { key, path: targetPath, deduped: true };
      } catch (err) {
        if (!isFileMissing(err)) throw err;
      }
      const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
      await fs.promises.copyFile(sourcePath, tempPath);
      await fs.promises.rename(tempPath, targetPath);
      return { key, path: targetPath, deduped: false };
    },
    async putText({ key, text }) {
      const targetPath = resolveKeyPath(key);
      ensureDir(path.dirname(targetPath));
      await fs.promises.writeFile(targetPath, String(text || ''), 'utf8');
      return { key, path: targetPath };
    },
    async getText(key) {
      return fs.promises.readFile(resolveKeyPath(key), 'utf8');
    },
    createReadStream(key) {
      return fs.createReadStream(resolveKeyPath(key));
    },
    async stat(key) {
      return fs.promises.stat(resolveKeyPath(key));
    },
    async delete(key) {
      try {
        await fs.promises.unlink(resolveKeyPath(key));
      } catch (err) {
        if (!isFileMissing(err)) throw err;
      }
      return { ok: true };
    }
  };
}

module.exports = {
  createLocalDiskStorageAdapter
};
