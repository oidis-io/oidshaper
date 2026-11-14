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
import { CursorOperation, TransformCursor } from "../../../src/typescript/tools/TransformCursor.js";

function source(cursor : string) : string {
    const match = /data:image\/svg\+xml,([^"]+)/.exec(cursor);
    if (match?.[1] === undefined) {
        throw new Error("Missing cursor image.");
    }
    return decodeURIComponent(match[1]);
}

describe("transform cursor orientation", () => {
    for (let degrees = 0; degrees < 360; degrees += 15) {
        it(`keeps the axis symbol and hotspot valid at ${String(degrees)} degrees`, () => {
            const radians = degrees * Math.PI / 180;
            const angle = TransformCursor.StableCursorAngle(100 * Math.cos(radians), 100 * Math.sin(radians), null);
            expect(angle).not.toBeNull();
            const active = TransformCursor.TransformCursor(CursorOperation.AXIS, true, angle ?? 0);
            const hover = TransformCursor.TransformCursor(CursorOperation.AXIS, false, angle ?? 0);
            expect(active).toContain(") 16 16,");
            expect(hover).toContain(") 2 2,");
            expect(source(active)).toContain(`rotate(${String(degrees % 180)} 16 16)`);
            expect(source(active)).not.toContain("M2 2V22");
            expect(source(hover)).toContain("M2 2V22");
            expect(active).toBe(TransformCursor.TransformCursor(CursorOperation.AXIS, true, degrees + 180));
            expect(source(active)).not.toMatch(/NaN|Infinity/);
        });
    }

    it("keeps a stable axis at the 180-degree wrap and through a degenerate projection", () => {
        expect(TransformCursor.StableCursorAngle(100, -1, 0)).toBe(0);
        expect(TransformCursor.StableCursorAngle(-100, 1, 0)).toBe(0);
        expect(TransformCursor.StableCursorAngle(0, 0, 45)).toBe(45);
        expect(TransformCursor.StableCursorAngle(0, 0, null)).toBeNull();
        expect(TransformCursor.StableCursorAngle(Number.NaN, 10, 90)).toBe(90);
        expect(TransformCursor.StableCursorAngle(10, Infinity, null)).toBeNull();
        expect(TransformCursor.StableCursorAngle(0, 100, 0)).toBe(90);
    });

    for (const operation of <const>[CursorOperation.MOVE, CursorOperation.ROTATE, CursorOperation.SCALE]) {
        it(`separates pressed ${operation} from hover without growing its cursor image`, () => {
            const hover = source(TransformCursor.TransformCursor(operation, false));
            const pressed = source(TransformCursor.TransformCursor(operation, true));
            expect(hover).toContain("M2 2V22");
            expect(pressed).not.toContain("M2 2V22");
            expect(pressed).toContain("width=\"32\" height=\"32\"");
            expect(pressed).toContain("stroke=\"#fff\"");
            expect(pressed).toContain("stroke=\"#111\"");
        });
    }
});
