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
import { NavigationPreset, NavigationAction, PointerKind } from "../../../src/typescript/core/NavigationPreset.js";

import type { INavigationPresetData } from "../../../src/typescript/core/NavigationPreset.js";

describe("NavigationPreset", () => {
    it("defaults to Fusion 360: middle drag pans, Shift + middle drag orbits, left drag is free", () => {
        const preset : NavigationPreset = NavigationPreset.Default();
        expect(preset.name).toBe("Fusion 360");
        expect(preset.Match({pointer: PointerKind.MIDDLE})).toBe(NavigationAction.PAN);
        expect(preset.Match({pointer: PointerKind.MIDDLE, shift: true})).toBe(NavigationAction.ORBIT);
        expect(preset.Match({pointer: PointerKind.LEFT})).toBeNull();
        expect(preset.Match({pointer: PointerKind.MIDDLE, shift: true, ctrl: true})).toBeNull();
    });

    it("lets every built-in preset navigate without a middle button", () => {
        const presets : NavigationPreset[] = NavigationPreset.All();
        expect(presets.map((preset) => preset.id)).toEqual(["fusion360", "onshape", "blender", "legacy"]);
        presets.forEach((preset) => {
            expect(preset.Match({pointer: PointerKind.LEFT, alt: true})).toBe(NavigationAction.ORBIT);
            expect(preset.Match({pointer: PointerKind.LEFT, space: true})).toBe(NavigationAction.PAN);
            expect(preset.Match({pointer: PointerKind.TOUCH, shift: true})).toBe(NavigationAction.ORBIT);
        });
    });

    it("maps the other presets as their programs do", () => {
        const [, onshape, blender, legacy] = NavigationPreset.All();
        expect(onshape?.Match({pointer: PointerKind.RIGHT})).toBe(NavigationAction.ORBIT);
        expect(blender?.Match({pointer: PointerKind.MIDDLE})).toBe(NavigationAction.ORBIT);
        expect(blender?.Match({pointer: PointerKind.MIDDLE, shift: true})).toBe(NavigationAction.PAN);
        expect(legacy?.Match({pointer: PointerKind.LEFT})).toBe(NavigationAction.ORBIT);
        expect(legacy?.Match({pointer: PointerKind.RIGHT})).toBe(NavigationAction.PAN);
    });

    it("rejects a gesture bound twice", () => {
        expect(() => new NavigationPreset({
            id: "broken",
            name: "Broken",
            bindings: [
                {gesture: {pointer: PointerKind.MIDDLE}, action: NavigationAction.PAN},
                {gesture: {pointer: PointerKind.MIDDLE, shift: false}, action: NavigationAction.ORBIT}
            ]
        })).toThrow("Broken: middle drag is bound twice.");
    });

    it("rejects host data with an unknown pointer", () => {
        const data : INavigationPresetData = <INavigationPresetData>JSON.parse(JSON.stringify({
            id: "pen",
            name: "Pen",
            bindings: [{gesture: {pointer: "pen"}, action: NavigationAction.PAN}]
        }));
        expect(() => new NavigationPreset(data)).toThrow("Pen: unknown pointer \"pen\".");
    });

    it("survives a round trip through JSON, so a host can store a changed copy", () => {
        const copy : NavigationPreset = new NavigationPreset(
            <INavigationPresetData>JSON.parse(JSON.stringify(NavigationPreset.Default()))
        );
        expect(copy.toJSON()).toEqual(NavigationPreset.Default().toJSON());
        expect(copy.Match({pointer: PointerKind.MIDDLE, shift: true})).toBe(NavigationAction.ORBIT);
    });

    it("describes gestures for help texts", () => {
        expect(NavigationPreset.Describe({pointer: PointerKind.MIDDLE, shift: true})).toBe("Shift + middle drag");
        expect(NavigationPreset.Describe({pointer: PointerKind.LEFT, ctrl: true, alt: true}))
            .toBe("Ctrl + Alt + left drag");
        expect(NavigationPreset.Describe({pointer: PointerKind.TOUCH})).toBe("one-finger drag");
    });
});
