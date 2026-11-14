/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { describe, it, expect } from "vitest";
import { EntityDocument } from "../../../src/typescript/core/entities/EntityDocument.js";
import { EntityAutosave } from "../../../src/typescript/core/entities/EntityAutosave.js";

import type { IEntitySnapshot } from "../../../src/typescript/core/entities/EntityAutosave.js";

function add(document : EntityDocument, name : string) : void {
    document.AddEntities({entities: [{type: "group", name, data: {}}]});
}

describe("entity autosave", () => {
    it("coalesces revisions while one write is pending and never writes out of order", async () => {
        const document = new EntityDocument();
        const writes : IEntitySnapshot[] = [];
        let release : () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const save = new EntityAutosave(document, {Write: async (snapshot) => {
            writes.push(snapshot);
            await gate;
        }}, () => undefined);
        add(document, "one");
        const flushing = save.Flush();
        add(document, "two"); add(document, "three");
        expect(writes).toHaveLength(1);
        release(); await flushing;
        expect(writes.map((item) => item.revision)).toEqual([1, 3]);
        expect(writes[1]?.document).toEqual(document.Serialize());
        save.Dispose();
        add(document, "four");
        await Promise.resolve();
        expect(writes).toHaveLength(2);
    });

    it("retains failed writes for explicit retry and reports failure once", async () => {
        const document = new EntityDocument();
        const errors : unknown[] = [];
        let fail = true;
        let saved : IEntitySnapshot | null = null;
        const save = new EntityAutosave(document, {Write: (snapshot) => {
            if (fail) {
                return Promise.reject(new Error("Disk full"));
            }
            saved = snapshot;
            return Promise.resolve();
        }}, (error) => errors.push(error));
        add(document, "one");
        await expect(save.Flush()).rejects.toThrow("Disk full");
        expect(errors).toHaveLength(1);
        expect(saved).toBeNull();
        fail = false;
        await save.Flush();
        expect(saved).toEqual({revision: 1, document: document.Serialize()});
        save.Dispose();
        await expect(save.Flush()).rejects.toThrow(/disposed/);
    });
});
