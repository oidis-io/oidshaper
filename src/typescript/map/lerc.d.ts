/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

declare module "lerc" {
    interface ILercResult {
        readonly width : number;
        readonly height : number;
        readonly pixels : readonly Float32Array[];
        readonly mask? : Uint8Array | null;
    }

    interface ILercDecoder {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- External LERC API.
        decode(buffer : ArrayBuffer) : ILercResult;
    }

    const decoder : ILercDecoder;
    export default decoder;
}
