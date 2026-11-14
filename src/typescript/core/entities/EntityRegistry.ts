/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { RegisteredEntityType } from "./RegisteredEntityType.js";

import type { IEntityType } from "./IEntity.js";
import type { IRegisteredEntityType } from "./contracts/IRegisteredEntityType.js";

export class EntityRegistry {
    private readonly types = new Map<string, IRegisteredEntityType>();

    public Register<TData>(entityType : IEntityType<TData>) : void {
        if (this.types.has(entityType.typeId)) {
            throw new Error(`Entity type already registered: ${entityType.typeId}`);
        }
        this.types.set(entityType.typeId, new RegisteredEntityType(entityType));
    }

    public getType(typeId : string) : IRegisteredEntityType {
        const entityType = this.types.get(typeId);
        if (entityType === undefined) {
            throw new Error(`Unknown entity type: ${typeId}`);
        }
        return entityType;
    }
}
