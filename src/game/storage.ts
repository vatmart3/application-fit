"use client";
/**
 * Sauvegarde privée. Dans l'artefact claude.ai : un document dans ton espace
 * personnel `data/users/<ton id>/save` (invisible pour quiconque d'autre).
 * En local (app Next) : le stockage du navigateur. Rien ne part ailleurs.
 */
import { type Db, type UserCap, getCapability } from "./claude";
import type { SaveData } from "./types";

export interface SaveStorage {
  kind: "artefact" | "navigateur" | "aucun";
  load(): Promise<SaveData | null>;
  save(data: SaveData): Promise<void>;
  clear(): Promise<void>;
}

const LOCAL_KEY = "mue:save:v1";

const localStorageAdapter: SaveStorage = {
  kind: "navigateur",
  async load() {
    try {
      const raw = window.localStorage.getItem(LOCAL_KEY);
      return raw ? (JSON.parse(raw) as SaveData) : null;
    } catch {
      return null;
    }
  },
  async save(data) {
    try {
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    } catch {
      /* stockage bloqué (navigation privée) : la partie reste en mémoire */
    }
  },
  async clear() {
    try {
      window.localStorage.removeItem(LOCAL_KEY);
    } catch {
      /* rien */
    }
  },
};

let pending: Promise<SaveStorage> | null = null;

/** Choisit le stockage disponible (une fois). */
export function getStorage(): Promise<SaveStorage> {
  pending ??= (async () => {
    const [db, user] = await Promise.all([getCapability<Db>("db"), getCapability<UserCap>("user")]);
    const uid = user ? await user.id().catch(() => null) : null;
    if (db && uid) {
      const ref = db.doc(`data/users/${uid}/save`);
      let writing: Promise<void> = Promise.resolve();
      return {
        kind: "artefact",
        async load() {
          const snap = await ref.get();
          return snap.exists ? (snap.data() as unknown as SaveData) : null;
        },
        save(data) {
          // Une écriture à la fois sur le document.
          writing = writing.then(() => ref.set(data as unknown as Record<string, unknown>)).catch(() => {});
          return writing;
        },
        clear: () => ref.delete(),
      } satisfies SaveStorage;
    }
    return localStorageAdapter;
  })();
  return pending;
}
