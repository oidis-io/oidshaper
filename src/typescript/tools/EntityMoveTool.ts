/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { EntityTransforms } from "../core/entities/EntityTransform.js";

import type { EntityDocument } from "../core/entities/EntityDocument.js";
import type { IVector3 } from "../core/LocalOrigin.js";
import type { IDrawing } from "../core/IDrawing.js";
import type { EntityTransform } from "../core/entities/EntityTransform.js";

export class EntityMoveTool {
    private readonly document : EntityDocument;
    private readonly revision : number;
    private readonly ids : readonly string[];
    private readonly start : IVector3;
    private delta? : EntityTransform;
    private finished : boolean = false;

    constructor(document : EntityDocument, ids : readonly string[], start : IVector3) {
        this.document = document;
        this.ids = [...ids]; this.start = {...start}; this.revision = document.getRevision();
    }

    public Preview(point : IVector3) : IDrawing {
        this.assertActive();
        const delta = EntityTransforms.Translation({x: point.x - this.start.x,
            y: point.y - this.start.y, z: point.z - this.start.z});
        const preview = this.document.PreviewTransform(this.ids, delta, this.revision);
        this.delta = delta;
        return preview;
    }

    public Commit() : void {
        this.assertActive();
        if (this.delta !== undefined) {
            this.document.TransformEntities({ids: this.ids, delta: this.delta,
                expectedRevision: this.revision});
        }
        this.finished = true;
    }

    public Cancel() : void {
        this.finished = true; delete this.delta;
    }

    private assertActive() : void {
        if (this.finished || this.document.getRevision() !== this.revision) {
            throw new Error("Move session has ended or the document has changed.");
        }
    }
}
