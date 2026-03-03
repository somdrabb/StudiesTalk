const stateByClass = new Map();

async function getState(liveClassId) {
  if (!stateByClass.has(liveClassId)) {
    stateByClass.set(liveClassId, { live_class_id: liveClassId, page: 1, updated_at: new Date().toISOString() });
  }
  return stateByClass.get(liveClassId);
}

async function setPage(liveClassId, page) {
  const entry = await getState(liveClassId);
  entry.page = page;
  entry.updated_at = new Date().toISOString();
  return entry;
}

module.exports = {
  getState,
  setPage,
};
