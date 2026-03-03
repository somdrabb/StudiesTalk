const crypto = require('crypto');
// Phase 2: Manage synchronization of slide decks with the live class session
const decksByClass = new Map();

async function uploadDeck(liveClassId, deckMeta) {
  const deck = {
    id: deckMeta.id || crypto.randomUUID(),
    live_class_id: liveClassId,
    file_url: deckMeta.file_url,
    title: deckMeta.title || 'Deck',
    page_count: deckMeta.page_count || 0,
    created_at: new Date().toISOString(),
  };

  const decks = decksByClass.get(liveClassId) || [];
  decks.push(deck);
  decksByClass.set(liveClassId, decks);
  return deck;
}

async function listDecks(liveClassId) {
  return decksByClass.get(liveClassId) || [];
}

module.exports = {
  uploadDeck,
  listDecks,
};
