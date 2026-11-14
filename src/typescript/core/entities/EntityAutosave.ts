/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { EntityDocumentEventKind } from "./contracts/EntityDocumentEventKind.js";

import type { EntityDocument } from "./EntityDocument.js";
import type { IEntityDocumentAction } from "./contracts/IEntityDocumentAction.js";
import type { IEntityErrorHandler } from "./contracts/IEntityErrorHandler.js";
import type { IEntityDocumentData } from "./IEntity.js";

export interface IEntitySnapshot {
    readonly revision : number;
    readonly document : IEntityDocumentData;
}

export interface IEntityPersistence {
    Write(snapshot : IEntitySnapshot) : Promise<void>;
}

/** Serial writes coalesce pending revisions and retain failed writes for retry. */
export class EntityAutosave {
    private readonly unsubscribe : IEntityDocumentAction;
    private readonly document : EntityDocument;
    private readonly persistence : IEntityPersistence;
    private readonly onError : IEntityErrorHandler;
    private pending? : IEntitySnapshot;
    private running? : Promise<void>;
    private disposed : boolean = false;
    private scheduled : boolean = false;

    constructor(document : EntityDocument, persistence : IEntityPersistence, onError : IEntityErrorHandler) {
        this.document = document;
        this.persistence = persistence;
        this.onError = onError;
        this.unsubscribe = document.Subscribe((event) => {
            if (event.kind === EntityDocumentEventKind.DOCUMENT_CHANGED) {
                this.SaveCurrent();
            }
        });
    }

    public SaveCurrent() : void {
        if (this.disposed) {
            throw new Error("Autosave has been disposed.");
        }
        this.pending = {revision: this.document.getRevision(), document: this.document.Serialize()};
        if (this.scheduled) {
            return;
        }
        this.scheduled = true;
        queueMicrotask(() => {
            this.scheduled = false;
            if (!this.disposed) {
                void this.Flush().catch(() => undefined);
            }
        });
    }

    public Flush() : Promise<void> {
        if (this.disposed) {
            return Promise.reject(new Error("Autosave has been disposed."));
        }
        this.running ??= this.writePending().then(() => {
            delete this.running;
            return this.pending !== undefined && !this.disposed ? this.Flush() : undefined;
        }, (error : unknown) => {
            delete this.running;
            try {
                this.onError(error);
            } catch {
                // Reporting cannot replace the storage failure.
            }
            throw error;
        });
        return this.running;
    }

    public Dispose() : void {
        this.disposed = true;
        this.unsubscribe();
        delete this.pending;
    }

    private async writePending() : Promise<void> {
        while (this.pending !== undefined && !this.disposed) {
            const next = this.pending;
            delete this.pending;
            try {
                await this.persistence.Write(next);
            } catch (error : unknown) {
                this.retainFailed(next);
                throw error;
            }
        }
    }

    private retainFailed(snapshot : IEntitySnapshot) : void {
        if (!this.disposed) {
            this.pending ??= snapshot;
        }
    }
}
