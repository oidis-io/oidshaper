/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { EntityBinding } from "./EntityBinding.js";

import type { IEntityType } from "./IEntity.js";
import type { IEntityBinding } from "./contracts/IEntityBinding.js";
import type { IRegisteredEntityType } from "./contracts/IRegisteredEntityType.js";

/** Validates heterogeneous wire data before dispatching to a typed implementation. */
export class RegisteredEntityType<TData> implements IRegisteredEntityType {
    public readonly typeId : string;
    public readonly acceptsChildren : boolean;
    private readonly implementation : IEntityType<TData>;

    constructor(implementation : IEntityType<TData>) {
        this.typeId = implementation.typeId;
        this.acceptsChildren = implementation.acceptsChildren;
        this.implementation = implementation;
    }

    public Validate(data : unknown) : void {
        this.implementation.Validate(data);
    }

    public Parse(data : unknown) : IEntityBinding {
        const copy : unknown = structuredClone(data);
        this.implementation.Validate(copy);
        return new EntityBinding(this.implementation, copy);
    }
}
