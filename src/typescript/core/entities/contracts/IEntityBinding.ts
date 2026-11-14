/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import type { IVector3 } from "../../LocalOrigin.js";
import type { EntityTopology } from "../EntityTopology.js";
import type {
    IEntityCapabilities, IEntityEdit, IEntityGeometry, IEntityGrip, IEntityPart, IEntitySnap
} from "../IEntity.js";

export interface IEntityBinding {
    getCapabilities() : IEntityCapabilities;

    getTopology() : EntityTopology | undefined;

    getGeometry() : IEntityGeometry;

    getGrips() : readonly IEntityGrip[];

    getSnapPoints() : readonly IEntitySnap[];

    MoveGrip(grip : string, position : IVector3) : IEntityEdit;

    MovePart(part : IEntityPart, delta : IVector3) : IEntityEdit;
}
