/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { it, expect } from "vitest";
import { BrowserProjectStore } from "../../../src/typescript/io/BrowserProjectStore.js";
import { EntityDocument } from "../../../src/typescript/core/entities/EntityDocument.js";

it("rejects stale project writers without replacing the last valid document", async () => {
    const name = `oidshaper-storage-test-${String(Date.now())}`;
    const first = new BrowserProjectStore(name);
    const second = new BrowserProjectStore(name);
    try {
        expect(await first.Read()).toBeNull();
        expect(await second.Read()).toBeNull();
        const document = new EntityDocument();
        document.AddEntities({entities: [{type: "group", name: "one", data: {}}]});
        const initial = {revision: document.getRevision(), document: document.Serialize()};
        await first.Write(initial);
        document.AddEntities({entities: [{type: "group", name: "two", data: {}}]});
        const changed = {revision: document.getRevision(), document: document.Serialize()};
        await expect(second.Write(changed)).rejects.toThrow(/another writer/);
        expect(await second.Read()).toEqual(initial);
        await second.Write(changed);
        expect(await first.Read()).toEqual(changed);
    } finally {
        await new Promise<void>((resolve, reject) => {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = () => {
                resolve();
            };
            request.onerror = () => {
                reject(request.error ?? new Error("Test database cleanup failed."));
            };
        });
    }
});
