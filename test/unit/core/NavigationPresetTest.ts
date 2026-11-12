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
import { NavigationPreset, type INavigationPresetData } from "../../../src/typescript/core/NavigationPreset.js";

describe("NavigationPreset", () => {
    it("defaults to Fusion 360: middle drag pans, Shift + middle drag orbits, left drag is free", () => {
        const preset : NavigationPreset = NavigationPreset.Default();
        expect(preset.name).toBe("Fusion 360");
        expect(preset.Match({pointer: "middle"})).toBe("pan");
        expect(preset.Match({pointer: "middle", shift: true})).toBe("orbit");
        expect(preset.Match({pointer: "left"})).toBeNull();
        expect(preset.Match({pointer: "middle", shift: true, ctrl: true})).toBeNull();
    });

    it("lets every built-in preset navigate without a middle button", () => {
        const presets : NavigationPreset[] = NavigationPreset.All();
        expect(presets.map((preset) => preset.id)).toEqual(["fusion360", "onshape", "blender", "legacy"]);
        presets.forEach((preset) => {
            expect(preset.Match({pointer: "left", alt: true})).toBe("orbit");
            expect(preset.Match({pointer: "left", space: true})).toBe("pan");
            expect(preset.Match({pointer: "touch", shift: true})).toBe("orbit");
        });
    });

    it("maps the other presets as their programs do", () => {
        const [, onshape, blender, legacy] = NavigationPreset.All();
        expect(onshape?.Match({pointer: "right"})).toBe("orbit");
        expect(blender?.Match({pointer: "middle"})).toBe("orbit");
        expect(blender?.Match({pointer: "middle", shift: true})).toBe("pan");
        expect(legacy?.Match({pointer: "left"})).toBe("orbit");
        expect(legacy?.Match({pointer: "right"})).toBe("pan");
    });

    it("rejects a gesture bound twice", () => {
        expect(() => new NavigationPreset({
            id: "broken",
            name: "Broken",
            bindings: [
                {gesture: {pointer: "middle"}, action: "pan"},
                {gesture: {pointer: "middle", shift: false}, action: "orbit"}
            ]
        })).toThrow("Broken: middle drag is bound twice.");
    });

    it("rejects host data with an unknown pointer", () => {
        const data : INavigationPresetData = <INavigationPresetData>JSON.parse(JSON.stringify({
            id: "pen",
            name: "Pen",
            bindings: [{gesture: {pointer: "pen"}, action: "pan"}]
        }));
        expect(() => new NavigationPreset(data)).toThrow("Pen: unknown pointer \"pen\".");
    });

    it("survives a round trip through JSON, so a host can store a changed copy", () => {
        const copy : NavigationPreset = new NavigationPreset(
            <INavigationPresetData>JSON.parse(JSON.stringify(NavigationPreset.Default()))
        );
        expect(copy.toJSON()).toEqual(NavigationPreset.Default().toJSON());
        expect(copy.Match({pointer: "middle", shift: true})).toBe("orbit");
    });

    it("describes gestures for help texts", () => {
        expect(NavigationPreset.Describe({pointer: "middle", shift: true})).toBe("Shift + middle drag");
        expect(NavigationPreset.Describe({pointer: "left", ctrl: true, alt: true})).toBe("Ctrl + Alt + left drag");
        expect(NavigationPreset.Describe({pointer: "touch"})).toBe("one-finger drag");
    });
});
