/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import type { IEntityErrorHandler } from "./IEntityErrorHandler.js";

export interface IEntityDocumentOptions {
    readonly historySteps? : number;

    readonly historyBytes? : number;

    readonly OnError? : IEntityErrorHandler;
}
