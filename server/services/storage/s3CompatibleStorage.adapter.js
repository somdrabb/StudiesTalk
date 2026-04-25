'use strict';

function notImplemented() {
  const err = new Error('S3-compatible storage adapter is not implemented yet.');
  err.code = 'FILE_STORAGE_NOT_IMPLEMENTED';
  throw err;
}

function createS3CompatibleStorageAdapter(options = {}) {
  return {
    providerName: 's3_compatible',
    options,
    async exists() {
      return notImplemented();
    },
    async putFile() {
      return notImplemented();
    },
    async putText() {
      return notImplemented();
    },
    async getText() {
      return notImplemented();
    },
    createReadStream() {
      return notImplemented();
    },
    async stat() {
      return notImplemented();
    },
    async delete() {
      return notImplemented();
    }
  };
}

module.exports = {
  createS3CompatibleStorageAdapter
};
