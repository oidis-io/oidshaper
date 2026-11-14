/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import type { IEntityDocumentData } from "../IEntity.js";
import type { EntityTransform } from "../EntityTransform.js";

export interface IImportDocumentRequest {
    readonly document : IEntityDocumentData;

    readonly id : string;

    readonly name : string;

    readonly transform? : EntityTransform;
}
