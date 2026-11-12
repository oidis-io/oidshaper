/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import type { IVector3 } from "../core/LocalOrigin.js";

// Separate from Grid.ts: public types must not import three.
export interface IGridOptions {
    readonly centre : IVector3;
    /** Metres, 100 by default. */
    readonly size? : number;
    /** Metres, 1 by default. */
    readonly step? : number;
    /** 10 by default; the Z axis is one major step high. */
    readonly majorEvery? : number;
}
