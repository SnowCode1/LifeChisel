import { applyEvent, replayEvents, type StoredEvent } from './model.ts';
import type { Repository } from './repository.ts';

// Browser preview only. Native iOS uses SQLite, not this localStorage adapter.
export function browserRepository(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  initialize: () => StoredEvent,
): Repository {
  const key = 'onpurpose.preview.v1';
  type Document = {
    version: 1;
    events: StoredEvent[];
    recovery: StoredEvent[][];
  };
  function read(): Document {
    const text = storage.getItem(key);
    if (text === null) {
      const document: Document = {
        version: 1,
        events: [initialize()],
        recovery: [],
      };
      replayEvents(document.events);
      storage.setItem(key, JSON.stringify(document));
      return document;
    }
    const raw = JSON.parse(text);
    if (raw.version !== 1 || !Array.isArray(raw.recovery))
      throw new Error('Unsupported browser preview data.');
    replayEvents(raw.events);
    return raw as Document;
  }
  return {
    async load() {
      const doc = read();
      return {
        ...replayEvents(doc.events),
        hasRecovery: doc.recovery.length > 0,
      };
    },
    async append(event, state) {
      const doc = read();
      const existing = doc.events.find((item) => item.id === event.id);
      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(event))
          throw new Error('Conflicting change.');
        return;
      }
      if (event.sequence !== doc.events.length + 1)
        throw new Error('Another browser tab changed the preview data.');
      const projected = applyEvent(replayEvents(doc.events).replay, event);
      if (JSON.stringify(projected.state) !== JSON.stringify(state))
        throw new Error('Projection mismatch.');
      storage.setItem(
        key,
        JSON.stringify({ ...doc, events: [...doc.events, event] }),
      );
    },
    async replace(events) {
      replayEvents(events);
      const doc = read();
      storage.setItem(
        key,
        JSON.stringify({
          ...doc,
          events,
          recovery: [...doc.recovery, doc.events],
        }),
      );
    },
    async recoveryEvents() {
      const events = read().recovery.at(-1);
      if (!events) throw new Error('No pre-restore copy is available.');
      return replayEvents(events).events;
    },
  };
}
