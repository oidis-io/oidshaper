/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import type { IEntityChange } from "./IEntityChange.js";
import type { ILayerChange } from "./ILayerChange.js";

export interface ITransaction {
    readonly entities : readonly IEntityChange[];

    readonly layers : readonly ILayerChange[];

    readonly bytes : number;
}
