/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { describe, expect, it } from "vitest";
import { LocalOrigin } from "../../../src/typescript/core/LocalOrigin.js";

import type { IVector3 } from "../../../src/typescript/core/LocalOrigin.js";

// S-JTSK
const POINT : IVector3 = {x: -743123.456, y: -1043210.789, z: 312.4};

describe("LocalOrigin", () => {
    it("loses centimetres when national coordinates go to 32-bit floats directly", () => {
        expect(Math.abs(Math.fround(POINT.y) - POINT.y)).toBeGreaterThan(0.01);
    });

    it("keeps a point within 1 mm through a 32-bit buffer and back", () => {
        const origin : LocalOrigin = new LocalOrigin({x: -743000, y: -1043000, z: 300});
        const buffer : Float32Array = origin.ToLocalBuffer([POINT.x, POINT.y, POINT.z]);
        const back : IVector3 = origin.ToWorld({x: buffer[0] ?? NaN, y: buffer[1] ?? NaN, z: buffer[2] ?? NaN});

        expect(Math.abs(back.x - POINT.x)).toBeLessThan(0.001);
        expect(Math.abs(back.y - POINT.y)).toBeLessThan(0.001);
        expect(Math.abs(back.z - POINT.z)).toBeLessThan(0.001);
    });

    it("round-trips a point through local coordinates exactly", () => {
        const origin : LocalOrigin = new LocalOrigin({x: -743100, y: -1043200, z: 310});

        expect(origin.ToWorld(origin.ToLocal(POINT))).toEqual(POINT);
    });

    it("places the origin in the centre of the bounding box", () => {
        const origin : LocalOrigin = LocalOrigin.CentreOf([-743200, -1043400, 300, -743000, -1043000, 320]);

        expect({x: origin.x, y: origin.y, z: origin.z}).toEqual({x: -743100, y: -1043200, z: 310});
    });

    it("rejects input that is not packed triplets", () => {
        expect(() => LocalOrigin.CentreOf([])).toThrow(RangeError);
        expect(() => new LocalOrigin(POINT).ToLocalBuffer([1, 2])).toThrow(RangeError);
        expect(() => new LocalOrigin({x: NaN, y: 0, z: 0})).toThrow(RangeError);
    });
});
