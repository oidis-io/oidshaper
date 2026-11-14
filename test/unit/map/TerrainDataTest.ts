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
import { afterEach, describe, expect, it, vi } from "vitest";
import { TerrainData } from "../../../src/typescript/map/TerrainData.js";

describe("TerrainData", () => {
    afterEach(() => vi.restoreAllMocks());

    it("decodes fully valid tiles whose LERC result omits the mask", () => {
        vi.spyOn(Lerc, "decode").mockReturnValue({width: 2, height: 2,
            pixels: [new Float32Array([190, 191, 192, 193])]});
        expect(Array.from(TerrainData.Decode(new ArrayBuffer(1)).heights)).toEqual([190, 191, 192, 193]);
    });
    it("removes masked and sentinel heights while retaining valid Bpv elevations", () => {
        const heights : Float32Array = new Float32Array([190, -3.4e38, 200, NaN, Infinity, -5]);
        TerrainData.Sanitise(heights, new Uint8Array([1, 0, 0, 1, 1, 1]));
        expect(Array.from(heights)).toEqual([190, 0, 0, 0, 0, -5]);
    });

    it("handles absent masks and rejects malformed data", () => {
        const heights : Float32Array = new Float32Array([190, -3.4e38]);
        TerrainData.Sanitise(heights, null);
        expect(Array.from(heights)).toEqual([190, 0]);
        expect(() => {
            TerrainData.Sanitise(heights, new Uint8Array(1));
        }).toThrow();
        expect(() => TerrainData.Decode(new ArrayBuffer(0))).toThrow();
    });
});
