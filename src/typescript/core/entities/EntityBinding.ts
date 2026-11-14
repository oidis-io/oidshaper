/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { EntitySnapKind } from "./IEntity.js";

import type { IVector3 } from "../LocalOrigin.js";
import type { EntityTopology } from "./EntityTopology.js";
import type {
    IEntityType, IEntityCapabilities, IEntityEdit, IEntityGeometry, IEntityGrip, IEntityPart, IEntitySnap
} from "./IEntity.js";
import type { IEntityBinding } from "./contracts/IEntityBinding.js";

export class EntityBinding<TData> implements IEntityBinding {
    private readonly entityType : IEntityType<TData>;
    private readonly data : TData;

    constructor(entityType : IEntityType<TData>, data : TData) {
        this.entityType = entityType;
        this.data = data;
    }

    public getCapabilities() : IEntityCapabilities {
        return this.entityType.getCapabilities?.(this.data) ?? {
            children: this.entityType.acceptsChildren,
            grips: this.getGrips().length > 0,
            topology: this.entityType.getTopology !== undefined
        };
    }

    public getTopology() : EntityTopology | undefined {
        return this.entityType.getTopology?.(this.data);
    }

    public getGeometry() : IEntityGeometry {
        return this.entityType.getGeometry(this.data);
    }

    public getGrips() : readonly IEntityGrip[] {
        return this.entityType.getGrips(this.data);
    }

    public getSnapPoints() : readonly IEntitySnap[] {
        return this.entityType.getSnapPoints?.(this.data) ?? this.getGrips().map((grip) => ({
            position: grip.position, kind: EntitySnapKind.ENDPOINT
        }));
    }

    public MoveGrip(grip : string, position : IVector3) : IEntityEdit {
        return this.entityType.MoveGrip(this.data, grip, position);
    }

    public MovePart(part : IEntityPart, delta : IVector3) : IEntityEdit {
        if (this.entityType.MovePart === undefined) {
            throw new Error("This entity does not support component editing.");
        }
        return this.entityType.MovePart(this.data, part, delta);
    }
}
