/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import type { IEntitySnapshot, IEntityPersistence } from "../core/entities/EntityAutosave.js";

interface IStoredProject {
    readonly version : number;
    readonly snapshot : IEntitySnapshot;
}

/** Atomic writes reject a version changed by another tab after the last read or write. */
export class BrowserProjectStore implements IEntityPersistence {
    private readonly name : string;
    private version? : number;

    constructor(name : string) {
        this.name = name;
    }

    public async Write(snapshot : IEntitySnapshot) : Promise<void> {
        const copy = structuredClone(snapshot);
        const database = await this.open();
        try {
            await new Promise<void>((resolve, reject) => {
                const transaction = database.transaction("projects", "readwrite");
                const store = transaction.objectStore("projects");
                const request = store.get("current");
                let written : number = 0;
                request.onsuccess = () => {
                    const current = <IStoredProject | undefined>request.result;
                    const version = current?.version ?? 0;
                    if (this.version !== undefined && this.version !== version) {
                        transaction.abort();
                        reject(new Error("Saved project changed in another writer; reload it before saving."));
                        return;
                    }
                    written = version + 1;
                    store.put({version: written, snapshot: copy}, "current");
                };
                transaction.oncomplete = () => {
                    this.version = written;
                    resolve();
                };
                transaction.onabort = () => {
                    reject(transaction.error ?? new Error("Project write aborted."));
                };
                transaction.onerror = () => {
                    reject(transaction.error ?? new Error("Project write failed."));
                };
            });
        } finally {
            database.close();
        }
    }

    public async Read() : Promise<IEntitySnapshot | null> {
        const database = await this.open();
        try {
            return await new Promise<IEntitySnapshot | null>((resolve, reject) => {
                const transaction = database.transaction("projects", "readonly");
                const request = transaction.objectStore("projects").get("current");
                transaction.oncomplete = () => {
                    const current = <IStoredProject | undefined>request.result;
                    this.version = current?.version ?? 0;
                    resolve(current?.snapshot ?? null);
                };
                transaction.onabort = () => {
                    reject(transaction.error ?? new Error("Project read aborted."));
                };
                transaction.onerror = () => {
                    reject(transaction.error ?? new Error("Project read failed."));
                };
            });
        } finally {
            database.close();
        }
    }

    private open() : Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, 1);
            request.onupgradeneeded = () => {
                request.result.createObjectStore("projects");
            };
            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onerror = () => {
                reject(request.error ?? new Error("Cannot open project storage."));
            };
        });
    }
}
