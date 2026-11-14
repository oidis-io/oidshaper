/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import Lerc from "lerc";

export interface ITerrainGrid {
    readonly width : number;
    readonly height : number;
    readonly heights : Float32Array;
}

export class TerrainData {
    private static readonly MIN_VALID_HEIGHT : number = -10000;

    public static Decode(buffer : ArrayBuffer) : ITerrainGrid {
        const decoded = Lerc.decode(buffer);
        const heights : Float32Array = new Float32Array(decoded.pixels[0] ?? []);
        if (heights.length !== decoded.width * decoded.height || decoded.width < 2 || decoded.height < 2) {
            throw new Error("Invalid DMR tile dimensions.");
        }
        TerrainData.Sanitise(heights, decoded.mask ?? null);
        return {width: decoded.width, height: decoded.height, heights};
    }

    // NoData outside coverage must not produce vertices at the LERC sentinel height (-3.4e38).
    public static Sanitise(heights : Float32Array, mask : Uint8Array | null) : void {
        if (mask !== null && mask.length !== heights.length) {
            throw new Error("Invalid DMR validity mask.");
        }
        for (let i = 0; i < heights.length; i++) {
            if (mask?.[i] === 0 || !Number.isFinite(heights[i]) || (heights[i] ?? 0) < TerrainData.MIN_VALID_HEIGHT) {
                heights[i] = 0;
            }
        }
    }
}
