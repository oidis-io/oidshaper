/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import type { IEntity, IEntityLayer } from "../IEntity.js";

export interface IEntityDocumentDraft {
    entities : Map<string, IEntity>;

    layers : Map<string, IEntityLayer>;

    readonly reservedIds : Set<string>;
}
