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

export interface IMoveGripRequest {
    readonly id : string;

    readonly grip : string;

    readonly position : IVector3;

    readonly expectedRevision? : number;
}
