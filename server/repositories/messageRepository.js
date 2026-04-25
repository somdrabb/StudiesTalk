'use strict';

const { normalizeEngine } = require('../../db/helpers');

function createMessageRepository({ engine = 'sqlite', sqliteDb } = {}) {
  const normalizedEngine = normalizeEngine(engine);
  if (normalizedEngine === 'postgres') return createPostgresMessageRepository();
  if (!sqliteDb) throw new Error('sqliteDb is required for the SQLite message repository');
  return createSqliteMessageRepository(sqliteDb);
}

function normalizeReplyRow(row) {
  return {
    id: row.id,
    author: row.author,
    initials: row.initials,
    avatarUrl: row.avatar_url || row.avatarUrl || null,
    time: row.time,
    createdAt: row.created_at || row.createdAt || null,
    text: row.text,
    reactions: []
  };
}

function normalizeMessageRow(row, attachments = [], reactions = [], replies = []) {
  return {
    id: row.id,
    author: row.author,
    initials: row.initials,
    avatarUrl: row.avatar_url || row.avatarUrl || null,
    time: row.time,
    createdAt: row.created_at || row.createdAt || null,
    text: row.text,
    originalLanguage: row.original_language || row.originalLanguage || 'en',
    alt: !!row.alt,
    attachments,
    reactions,
    replies
  };
}

function normalizeExecResult(result) {
  return Number(result?.changes ?? result?.rowCount ?? 0);
}

function createSqliteMessageRepository(sqliteDb) {
  function deleteMessageCascade(messageId) {
    const replyIds = sqliteDb.prepare('SELECT id FROM replies WHERE message_id = ?').all(messageId).map((row) => row.id);
    const tx = sqliteDb.transaction(() => {
      sqliteDb.prepare('DELETE FROM message_reaction_users WHERE message_id = ?').run(messageId);
      sqliteDb.prepare('DELETE FROM message_reactions WHERE message_id = ?').run(messageId);
      if (replyIds.length) {
        const placeholders = replyIds.map(() => '?').join(',');
        sqliteDb.prepare(`DELETE FROM reply_reaction_users WHERE reply_id IN (${placeholders})`).run(...replyIds);
        sqliteDb.prepare(`DELETE FROM reply_reactions WHERE reply_id IN (${placeholders})`).run(...replyIds);
      }
      sqliteDb.prepare('DELETE FROM replies WHERE message_id = ?').run(messageId);
      sqliteDb.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
    });
    tx();
  }

  return {
    engine: 'sqlite',

    listChannelMessages(channelId) {
      const messages = sqliteDb.prepare(`
        SELECT id, channel_id, author, initials, avatar_url, time, created_at, text, alt, original_language
        FROM messages
        WHERE channel_id = ?
        ORDER BY rowid
      `).all(channelId);
      if (!messages.length) return [];

      const messageIds = messages.map((row) => row.id);
      const messagePlaceholders = messageIds.map(() => '?').join(',');
      const replyRows = sqliteDb.prepare(`
        SELECT id, message_id, author, initials, avatar_url, time, text, created_at
        FROM replies
        WHERE message_id IN (${messagePlaceholders})
        ORDER BY rowid
      `).all(...messageIds);
      const reactionRows = sqliteDb.prepare(`
        SELECT message_id, emoji, count
        FROM message_reactions
        WHERE message_id IN (${messagePlaceholders})
        ORDER BY emoji ASC
      `).all(...messageIds);
      const attachmentRows = sqliteDb.prepare(`
        SELECT message_id, file_name, mime, size_bytes, url
        FROM files_registry
        WHERE channel_id = ?
          AND deleted = 0
          AND message_id IN (${messagePlaceholders})
        ORDER BY created_at ASC, rowid ASC
      `).all(channelId, ...messageIds);

      const repliesByMessageId = {};
      const replyIds = [];
      const replyById = {};
      for (const row of replyRows) {
        const reply = normalizeReplyRow(row);
        replyById[row.id] = reply;
        replyIds.push(row.id);
        if (!repliesByMessageId[row.message_id]) repliesByMessageId[row.message_id] = [];
        repliesByMessageId[row.message_id].push(reply);
      }

      if (replyIds.length) {
        const replyPlaceholders = replyIds.map(() => '?').join(',');
        const replyReactionRows = sqliteDb.prepare(`
          SELECT reply_id, emoji, count
          FROM reply_reactions
          WHERE reply_id IN (${replyPlaceholders})
          ORDER BY emoji ASC
        `).all(...replyIds);
        for (const row of replyReactionRows) {
          if (!replyById[row.reply_id]) continue;
          replyById[row.reply_id].reactions.push({ emoji: row.emoji, count: Number(row.count || 0) });
        }
      }

      const reactionsByMessageId = {};
      for (const row of reactionRows) {
        if (!reactionsByMessageId[row.message_id]) reactionsByMessageId[row.message_id] = [];
        reactionsByMessageId[row.message_id].push({ emoji: row.emoji, count: Number(row.count || 0) });
      }

      const attachmentsByMessageId = {};
      for (const row of attachmentRows) {
        if (!attachmentsByMessageId[row.message_id]) attachmentsByMessageId[row.message_id] = [];
        attachmentsByMessageId[row.message_id].push({
          url: row.url,
          originalName: row.file_name || 'attachment',
          mimeType: row.mime || 'application/octet-stream',
          size: Number(row.size_bytes || 0) || 0
        });
      }

      return messages.map((row) =>
        normalizeMessageRow(
          row,
          attachmentsByMessageId[row.id] || [],
          reactionsByMessageId[row.id] || [],
          repliesByMessageId[row.id] || []
        )
      );
    },

    clearChannelMessages(channelId) {
      const messageIds = sqliteDb.prepare('SELECT id FROM messages WHERE channel_id = ?').all(channelId).map((row) => row.id);
      const tx = sqliteDb.transaction(() => {
        messageIds.forEach((messageId) => deleteMessageCascade(messageId));
      });
      tx();
      return { ok: true, channelId };
    },

    createChannelMessage({
      id,
      channelId,
      author,
      initials,
      avatarUrl,
      time,
      text,
      alt,
      createdAt,
      originalLanguage,
      attachments = [],
      workspaceId,
      uploaderId,
      purpose,
      computeFileId
    }) {
      sqliteDb.prepare(`
        INSERT INTO messages (id, channel_id, author, initials, avatar_url, time, text, alt, created_at, original_language)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, channelId, author, initials, avatarUrl || null, time, text, alt ? 1 : 0, createdAt, originalLanguage);

      if (attachments.length) {
        const insertAttachment = sqliteDb.prepare(`
          INSERT OR IGNORE INTO files_registry
          (file_id, workspace_id, channel_id, message_id, uploader_id, purpose, file_name, mime, size_bytes, url, storage_key, checksum, storage_provider, storage_mode, encryption_key_id, encryption_iv, encryption_tag, permissions, pinned, deleted, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, datetime('now'), datetime('now'))
        `);
        attachments.forEach((att) => {
          const url = att?.url ? String(att.url) : '';
          if (!url) return;
          const name = att?.originalName ? String(att.originalName) : 'attachment';
          const mime = att?.mimeType ? String(att.mimeType) : 'application/octet-stream';
          const size = Number(att?.size || 0) || 0;
          const storageKey = att?.storageKey ? String(att.storageKey) : '';
          const checksum = att?.checksum ? String(att.checksum) : '';
          const storageProvider = att?.storageProvider ? String(att.storageProvider) : 'local_disk';
          const storageMode = att?.storageMode ? String(att.storageMode) : 'plain';
          const encryptionKeyId = att?.encryptionKeyId ? String(att.encryptionKeyId) : '';
          const encryptionIv = att?.encryptionIv ? String(att.encryptionIv) : '';
          const encryptionTag = att?.encryptionTag ? String(att.encryptionTag) : '';
          const permissions = att?.permissions ? String(att.permissions) : 'workspace_private';
          insertAttachment.run(
            computeFileId({ url, channelId, messageId: id, name }),
            workspaceId,
            channelId,
            id,
            uploaderId,
            purpose,
            name,
            mime,
            size,
            url,
            storageKey,
            checksum,
            storageProvider,
            storageMode,
            encryptionKeyId,
            encryptionIv,
            encryptionTag,
            permissions
          );
        });
      }

      return normalizeMessageRow(
        {
          id,
          author,
          initials,
          avatar_url: avatarUrl || null,
          time,
          created_at: createdAt,
          text,
          alt: alt ? 1 : 0,
          original_language: originalLanguage
        },
        attachments,
        [],
        []
      );
    },

    getMessageById(messageId) {
      return sqliteDb.prepare(`
        SELECT id, channel_id AS channelId, author, initials, avatar_url AS avatarUrl, time, text, alt
        FROM messages
        WHERE id = ?
      `).get(messageId) || null;
    },

    getMessageParent(messageId, channelId) {
      return sqliteDb.prepare('SELECT id FROM messages WHERE id = ? AND channel_id = ?').get(messageId, channelId) || null;
    },

    getMessageInteractionCounts(messageId) {
      const replyCount = sqliteDb.prepare('SELECT COUNT(*) AS c FROM replies WHERE message_id = ?').get(messageId)?.c || 0;
      const reactionCount = sqliteDb.prepare('SELECT SUM(count) AS c FROM message_reactions WHERE message_id = ?').get(messageId)?.c || 0;
      return {
        replyCount: Number(replyCount || 0),
        reactionCount: Number(reactionCount || 0)
      };
    },

    updateMessageText(messageId, text) {
      sqliteDb.prepare('UPDATE messages SET text = ? WHERE id = ?').run(text, messageId);
      return this.getMessageById(messageId);
    },

    deleteMessage(messageId) {
      deleteMessageCascade(messageId);
      return { ok: true };
    },

    createReply({ id, messageId, author, initials, avatarUrl, time, text, createdAt }) {
      sqliteDb.prepare(`
        INSERT INTO replies (id, message_id, author, initials, avatar_url, time, text, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, messageId, author, initials, avatarUrl || null, time, text, createdAt);
      return normalizeReplyRow({
        id,
        author,
        initials,
        avatar_url: avatarUrl || null,
        time,
        text,
        created_at: createdAt
      });
    },

    toggleMessageReaction({ messageId, emoji, userId }) {
      sqliteDb.transaction(() => {
        const exists = sqliteDb.prepare(`
          SELECT 1
          FROM message_reaction_users
          WHERE message_id = ? AND emoji = ? AND user_id = ?
        `).get(messageId, emoji, userId);
        if (exists) {
          sqliteDb.prepare('DELETE FROM message_reaction_users WHERE message_id = ? AND emoji = ? AND user_id = ?').run(messageId, emoji, userId);
          sqliteDb.prepare('UPDATE message_reactions SET count = count - 1 WHERE message_id = ? AND emoji = ? AND count > 0').run(messageId, emoji);
          sqliteDb.prepare('DELETE FROM message_reactions WHERE message_id = ? AND emoji = ? AND count <= 0').run(messageId, emoji);
        } else {
          sqliteDb.prepare('INSERT OR IGNORE INTO message_reaction_users (message_id, emoji, user_id) VALUES (?, ?, ?)').run(messageId, emoji, userId);
          const updated = sqliteDb.prepare('UPDATE message_reactions SET count = count + 1 WHERE message_id = ? AND emoji = ?').run(messageId, emoji);
          if (!updated.changes) {
            sqliteDb.prepare('INSERT INTO message_reactions (message_id, emoji, count) VALUES (?, ?, 1)').run(messageId, emoji);
          }
        }
      })();

      return sqliteDb.prepare('SELECT emoji, count FROM message_reactions WHERE message_id = ? ORDER BY emoji').all(messageId);
    },

    toggleReplyReaction({ replyId, emoji, userId }) {
      sqliteDb.transaction(() => {
        const exists = sqliteDb.prepare(`
          SELECT 1
          FROM reply_reaction_users
          WHERE reply_id = ? AND emoji = ? AND user_id = ?
        `).get(replyId, emoji, userId);
        if (exists) {
          sqliteDb.prepare('DELETE FROM reply_reaction_users WHERE reply_id = ? AND emoji = ? AND user_id = ?').run(replyId, emoji, userId);
          sqliteDb.prepare('UPDATE reply_reactions SET count = count - 1 WHERE reply_id = ? AND emoji = ? AND count > 0').run(replyId, emoji);
          sqliteDb.prepare('DELETE FROM reply_reactions WHERE reply_id = ? AND emoji = ? AND count <= 0').run(replyId, emoji);
        } else {
          sqliteDb.prepare('INSERT OR IGNORE INTO reply_reaction_users (reply_id, emoji, user_id) VALUES (?, ?, ?)').run(replyId, emoji, userId);
          const updated = sqliteDb.prepare('UPDATE reply_reactions SET count = count + 1 WHERE reply_id = ? AND emoji = ?').run(replyId, emoji);
          if (!updated.changes) {
            sqliteDb.prepare('INSERT INTO reply_reactions (reply_id, emoji, count) VALUES (?, ?, 1)').run(replyId, emoji);
          }
        }
      })();

      return sqliteDb.prepare('SELECT emoji, count FROM reply_reactions WHERE reply_id = ? ORDER BY emoji').all(replyId);
    },

    replyExists(replyId) {
      return !!sqliteDb.prepare('SELECT 1 FROM replies WHERE id = ?').get(replyId);
    },

    getCachedTranslation(messageId, targetLang, viewerUserId = '') {
      return sqliteDb.prepare(`
        SELECT translated_text, status, provider, error_message
        FROM message_translations
        WHERE message_id = ? AND target_language = ? AND viewer_user_id = ?
      `).get(messageId, targetLang, viewerUserId || '') || null;
    },

    upsertPendingTranslation({ id, messageId, targetLang, viewerUserId = '', provider = 'google' }) {
      sqliteDb.prepare(`
        INSERT OR IGNORE INTO message_translations
        (id, message_id, target_language, viewer_user_id, status, provider, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, datetime('now'), datetime('now'))
      `).run(id, messageId, targetLang, viewerUserId || '', provider);
      return { ok: true };
    },

    saveReadyTranslation({ id, messageId, targetLang, viewerUserId = '', translatedText, provider = 'google' }) {
      sqliteDb.prepare(`
        INSERT INTO message_translations
        (id, message_id, target_language, viewer_user_id, translated_text, status, provider, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'ready', ?, datetime('now'), datetime('now'))
        ON CONFLICT(message_id, target_language, viewer_user_id)
        DO UPDATE SET translated_text = excluded.translated_text,
                      status = 'ready',
                      provider = excluded.provider,
                      error_message = NULL,
                      updated_at = datetime('now')
      `).run(id, messageId, targetLang, viewerUserId || '', translatedText, provider);
      return { ok: true };
    },

    markTranslationFailed({ id, messageId, targetLang, viewerUserId = '', provider = 'google', errorMessage }) {
      sqliteDb.prepare(`
        INSERT INTO message_translations
        (id, message_id, target_language, viewer_user_id, status, provider, error_message, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'failed', ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(id)
        DO UPDATE SET status = 'failed',
                      provider = excluded.provider,
                      error_message = excluded.error_message,
                      updated_at = datetime('now')
      `).run(id, messageId, targetLang, viewerUserId || '', provider, errorMessage);
      return { ok: true };
    },

    getUserChannelPrefs(userId, channelId) {
      return sqliteDb.prepare(`
        SELECT culture_read_language, culture_write_language
        FROM user_channel_prefs
        WHERE user_id = ? AND channel_id = ?
      `).get(userId, channelId) || null;
    },

    saveUserChannelPrefs({ userId, channelId, readLanguage = 'en', writeLanguage = null }) {
      sqliteDb.prepare(`
        INSERT INTO user_channel_prefs (user_id, channel_id, culture_read_language, culture_write_language, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, channel_id)
        DO UPDATE SET culture_read_language = excluded.culture_read_language,
                      culture_write_language = excluded.culture_write_language,
                      updated_at = datetime('now')
      `).run(userId, channelId, readLanguage, writeLanguage);
      return { ok: true };
    }
  };
}

function createPostgresMessageRepository() {
  const postgres = require('../../db/postgres');

  async function deleteMessageCascade(messageId) {
    const replyRows = await postgres.many('SELECT id FROM replies WHERE message_id = ?', [messageId]);
    const replyIds = replyRows.map((row) => row.id);
    await postgres.transaction(async (tx) => {
      await tx.exec('DELETE FROM message_reaction_users WHERE message_id = ?', [messageId]);
      await tx.exec('DELETE FROM message_reactions WHERE message_id = ?', [messageId]);
      if (replyIds.length) {
        await tx.exec('DELETE FROM reply_reaction_users WHERE reply_id = ANY(?)', [replyIds]);
        await tx.exec('DELETE FROM reply_reactions WHERE reply_id = ANY(?)', [replyIds]);
      }
      await tx.exec('DELETE FROM replies WHERE message_id = ?', [messageId]);
      await tx.exec('DELETE FROM messages WHERE id = ?', [messageId]);
    });
  }

  return {
    engine: 'postgres',

    async listChannelMessages(channelId) {
      const messages = await postgres.many(`
        SELECT id, channel_id, author, initials, avatar_url, time, created_at, text, alt, original_language
        FROM messages
        WHERE channel_id = ?
        ORDER BY created_at ASC NULLS LAST, id ASC
      `, [channelId]);
      if (!messages.length) return [];

      const messageIds = messages.map((row) => row.id);
      const replyRows = await postgres.many(`
        SELECT id, message_id, author, initials, avatar_url, time, text, created_at
        FROM replies
        WHERE message_id = ANY(?)
        ORDER BY created_at ASC NULLS LAST, id ASC
      `, [messageIds]);
      const reactionRows = await postgres.many(`
        SELECT message_id, emoji, count
        FROM message_reactions
        WHERE message_id = ANY(?)
        ORDER BY emoji ASC
      `, [messageIds]);
      const attachmentRows = await postgres.many(`
        SELECT message_id, file_name, mime, size_bytes, url
        FROM files_registry
        WHERE channel_id = ?
          AND deleted = 0
          AND message_id = ANY(?)
        ORDER BY created_at ASC NULLS LAST, file_id ASC
      `, [channelId, messageIds]);

      const repliesByMessageId = {};
      const replyIds = [];
      const replyById = {};
      for (const row of replyRows) {
        const reply = normalizeReplyRow(row);
        replyById[row.id] = reply;
        replyIds.push(row.id);
        if (!repliesByMessageId[row.message_id]) repliesByMessageId[row.message_id] = [];
        repliesByMessageId[row.message_id].push(reply);
      }

      if (replyIds.length) {
        const replyReactionRows = await postgres.many(`
          SELECT reply_id, emoji, count
          FROM reply_reactions
          WHERE reply_id = ANY(?)
          ORDER BY emoji ASC
        `, [replyIds]);
        for (const row of replyReactionRows) {
          if (!replyById[row.reply_id]) continue;
          replyById[row.reply_id].reactions.push({ emoji: row.emoji, count: Number(row.count || 0) });
        }
      }

      const reactionsByMessageId = {};
      for (const row of reactionRows) {
        if (!reactionsByMessageId[row.message_id]) reactionsByMessageId[row.message_id] = [];
        reactionsByMessageId[row.message_id].push({ emoji: row.emoji, count: Number(row.count || 0) });
      }

      const attachmentsByMessageId = {};
      for (const row of attachmentRows) {
        if (!attachmentsByMessageId[row.message_id]) attachmentsByMessageId[row.message_id] = [];
        attachmentsByMessageId[row.message_id].push({
          url: row.url,
          originalName: row.file_name || 'attachment',
          mimeType: row.mime || 'application/octet-stream',
          size: Number(row.size_bytes || 0) || 0
        });
      }

      return messages.map((row) =>
        normalizeMessageRow(
          row,
          attachmentsByMessageId[row.id] || [],
          reactionsByMessageId[row.id] || [],
          repliesByMessageId[row.id] || []
        )
      );
    },

    async clearChannelMessages(channelId) {
      const messageRows = await postgres.many('SELECT id FROM messages WHERE channel_id = ?', [channelId]);
      for (const row of messageRows) {
        await deleteMessageCascade(row.id);
      }
      return { ok: true, channelId };
    },

    async createChannelMessage({
      id,
      channelId,
      author,
      initials,
      avatarUrl,
      time,
      text,
      alt,
      createdAt,
      originalLanguage,
      attachments = [],
      workspaceId,
      uploaderId,
      purpose,
      computeFileId
    }) {
      await postgres.exec(`
        INSERT INTO messages (id, channel_id, author, initials, avatar_url, time, text, alt, created_at, original_language)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, channelId, author, initials, avatarUrl || null, time, text, alt ? 1 : 0, createdAt, originalLanguage]);

      for (const att of attachments) {
        const url = att?.url ? String(att.url) : '';
        if (!url) continue;
        const name = att?.originalName ? String(att.originalName) : 'attachment';
        const mime = att?.mimeType ? String(att.mimeType) : 'application/octet-stream';
        const size = Number(att?.size || 0) || 0;
        await postgres.exec(`
          INSERT INTO files_registry
          (file_id, workspace_id, channel_id, message_id, uploader_id, purpose, file_name, mime, size_bytes, url, storage_key, checksum, storage_provider, storage_mode, encryption_key_id, encryption_iv, encryption_tag, permissions, pinned, deleted, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, CURRENT_TIMESTAMP::text, CURRENT_TIMESTAMP::text)
          ON CONFLICT DO NOTHING
        `, [
          computeFileId({ url, channelId, messageId: id, name }),
          workspaceId,
          channelId,
          id,
          uploaderId,
          purpose,
          name,
          mime,
          size,
          url,
          att?.storageKey ? String(att.storageKey) : '',
          att?.checksum ? String(att.checksum) : '',
          att?.storageProvider ? String(att.storageProvider) : 'local_disk',
          att?.storageMode ? String(att.storageMode) : 'plain',
          att?.encryptionKeyId ? String(att.encryptionKeyId) : '',
          att?.encryptionIv ? String(att.encryptionIv) : '',
          att?.encryptionTag ? String(att.encryptionTag) : '',
          att?.permissions ? String(att.permissions) : 'workspace_private'
        ]);
      }

      return normalizeMessageRow(
        {
          id,
          author,
          initials,
          avatar_url: avatarUrl || null,
          time,
          created_at: createdAt,
          text,
          alt: alt ? 1 : 0,
          original_language: originalLanguage
        },
        attachments,
        [],
        []
      );
    },

    async getMessageById(messageId) {
      return postgres.one(`
        SELECT id, channel_id AS "channelId", author, initials, avatar_url AS "avatarUrl", time, text, alt
        FROM messages
        WHERE id = ?
      `, [messageId]);
    },

    async getMessageParent(messageId, channelId) {
      return postgres.one('SELECT id FROM messages WHERE id = ? AND channel_id = ?', [messageId, channelId]);
    },

    async getMessageInteractionCounts(messageId) {
      const replyRow = await postgres.one('SELECT COUNT(*)::int AS c FROM replies WHERE message_id = ?', [messageId]);
      const reactionRow = await postgres.one('SELECT COALESCE(SUM(count), 0)::int AS c FROM message_reactions WHERE message_id = ?', [messageId]);
      return {
        replyCount: Number(replyRow?.c || 0),
        reactionCount: Number(reactionRow?.c || 0)
      };
    },

    async updateMessageText(messageId, text) {
      await postgres.exec('UPDATE messages SET text = ? WHERE id = ?', [text, messageId]);
      return this.getMessageById(messageId);
    },

    async deleteMessage(messageId) {
      await deleteMessageCascade(messageId);
      return { ok: true };
    },

    async createReply({ id, messageId, author, initials, avatarUrl, time, text, createdAt }) {
      await postgres.exec(`
        INSERT INTO replies (id, message_id, author, initials, avatar_url, time, text, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, messageId, author, initials, avatarUrl || null, time, text, createdAt]);
      return normalizeReplyRow({
        id,
        author,
        initials,
        avatar_url: avatarUrl || null,
        time,
        text,
        created_at: createdAt
      });
    },

    async toggleMessageReaction({ messageId, emoji, userId }) {
      await postgres.transaction(async (tx) => {
        const exists = await tx.one(`
          SELECT 1
          FROM message_reaction_users
          WHERE message_id = ? AND emoji = ? AND user_id = ?
        `, [messageId, emoji, userId]);
        if (exists) {
          await tx.exec('DELETE FROM message_reaction_users WHERE message_id = ? AND emoji = ? AND user_id = ?', [messageId, emoji, userId]);
          await tx.exec('UPDATE message_reactions SET count = count - 1 WHERE message_id = ? AND emoji = ? AND count > 0', [messageId, emoji]);
          await tx.exec('DELETE FROM message_reactions WHERE message_id = ? AND emoji = ? AND count <= 0', [messageId, emoji]);
        } else {
          await tx.exec(`
            INSERT INTO message_reaction_users (message_id, emoji, user_id)
            VALUES (?, ?, ?)
            ON CONFLICT DO NOTHING
          `, [messageId, emoji, userId]);
          const updated = await tx.exec('UPDATE message_reactions SET count = count + 1 WHERE message_id = ? AND emoji = ?', [messageId, emoji]);
          if (!normalizeExecResult(updated)) {
            await tx.exec('INSERT INTO message_reactions (message_id, emoji, count) VALUES (?, ?, 1)', [messageId, emoji]);
          }
        }
      });

      return postgres.many('SELECT emoji, count FROM message_reactions WHERE message_id = ? ORDER BY emoji', [messageId]);
    },

    async toggleReplyReaction({ replyId, emoji, userId }) {
      await postgres.transaction(async (tx) => {
        const exists = await tx.one(`
          SELECT 1
          FROM reply_reaction_users
          WHERE reply_id = ? AND emoji = ? AND user_id = ?
        `, [replyId, emoji, userId]);
        if (exists) {
          await tx.exec('DELETE FROM reply_reaction_users WHERE reply_id = ? AND emoji = ? AND user_id = ?', [replyId, emoji, userId]);
          await tx.exec('UPDATE reply_reactions SET count = count - 1 WHERE reply_id = ? AND emoji = ? AND count > 0', [replyId, emoji]);
          await tx.exec('DELETE FROM reply_reactions WHERE reply_id = ? AND emoji = ? AND count <= 0', [replyId, emoji]);
        } else {
          await tx.exec(`
            INSERT INTO reply_reaction_users (reply_id, emoji, user_id)
            VALUES (?, ?, ?)
            ON CONFLICT DO NOTHING
          `, [replyId, emoji, userId]);
          const updated = await tx.exec('UPDATE reply_reactions SET count = count + 1 WHERE reply_id = ? AND emoji = ?', [replyId, emoji]);
          if (!normalizeExecResult(updated)) {
            await tx.exec('INSERT INTO reply_reactions (reply_id, emoji, count) VALUES (?, ?, 1)', [replyId, emoji]);
          }
        }
      });

      return postgres.many('SELECT emoji, count FROM reply_reactions WHERE reply_id = ? ORDER BY emoji', [replyId]);
    },

    async replyExists(replyId) {
      return !!(await postgres.one('SELECT 1 FROM replies WHERE id = ?', [replyId]));
    },

    async getCachedTranslation(messageId, targetLang, viewerUserId = '') {
      return postgres.one(`
        SELECT translated_text, status, provider, error_message
        FROM message_translations
        WHERE message_id = ? AND target_language = ? AND viewer_user_id = ?
      `, [messageId, targetLang, viewerUserId || '']);
    },

    async upsertPendingTranslation({ id, messageId, targetLang, viewerUserId = '', provider = 'google' }) {
      await postgres.exec(`
        INSERT INTO message_translations
        (id, message_id, target_language, viewer_user_id, status, provider, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP::text, CURRENT_TIMESTAMP::text)
        ON CONFLICT DO NOTHING
      `, [id, messageId, targetLang, viewerUserId || '', provider]);
      return { ok: true };
    },

    async saveReadyTranslation({ id, messageId, targetLang, viewerUserId = '', translatedText, provider = 'google' }) {
      await postgres.exec(`
        INSERT INTO message_translations
        (id, message_id, target_language, viewer_user_id, translated_text, status, provider, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'ready', ?, CURRENT_TIMESTAMP::text, CURRENT_TIMESTAMP::text)
        ON CONFLICT(message_id, target_language, viewer_user_id)
        DO UPDATE SET translated_text = EXCLUDED.translated_text,
                      status = 'ready',
                      provider = EXCLUDED.provider,
                      error_message = NULL,
                      updated_at = CURRENT_TIMESTAMP::text
      `, [id, messageId, targetLang, viewerUserId || '', translatedText, provider]);
      return { ok: true };
    },

    async markTranslationFailed({ id, messageId, targetLang, viewerUserId = '', provider = 'google', errorMessage }) {
      await postgres.exec(`
        INSERT INTO message_translations
        (id, message_id, target_language, viewer_user_id, status, provider, error_message, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'failed', ?, ?, CURRENT_TIMESTAMP::text, CURRENT_TIMESTAMP::text)
        ON CONFLICT (id)
        DO UPDATE SET status = 'failed',
                      provider = EXCLUDED.provider,
                      error_message = EXCLUDED.error_message,
                      updated_at = CURRENT_TIMESTAMP::text
      `, [id, messageId, targetLang, viewerUserId || '', provider, errorMessage]);
      return { ok: true };
    },

    async getUserChannelPrefs(userId, channelId) {
      return postgres.one(`
        SELECT culture_read_language, culture_write_language
        FROM user_channel_prefs
        WHERE user_id = ? AND channel_id = ?
      `, [userId, channelId]);
    },

    async saveUserChannelPrefs({ userId, channelId, readLanguage = 'en', writeLanguage = null }) {
      await postgres.exec(`
        INSERT INTO user_channel_prefs (user_id, channel_id, culture_read_language, culture_write_language, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP::text)
        ON CONFLICT(user_id, channel_id)
        DO UPDATE SET culture_read_language = EXCLUDED.culture_read_language,
                      culture_write_language = EXCLUDED.culture_write_language,
                      updated_at = CURRENT_TIMESTAMP::text
      `, [userId, channelId, readLanguage, writeLanguage]);
      return { ok: true };
    }
  };
}

module.exports = {
  createMessageRepository
};
