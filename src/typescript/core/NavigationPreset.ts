/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

export type PointerKind = "left" | "middle" | "right" | "touch";

export type NavigationAction = "orbit" | "pan";

export interface IPointerGesture {
    readonly pointer : PointerKind;
    /** Ctrl, or Cmd on macOS. */
    readonly ctrl? : boolean;
    readonly alt? : boolean;
    readonly shift? : boolean;
    readonly space? : boolean;
}

export interface INavigationBinding {
    readonly gesture : IPointerGesture;
    readonly action : NavigationAction;
}

export interface INavigationPresetData {
    readonly id : string;
    readonly name : string;
    readonly bindings : readonly INavigationBinding[];
}

const POINTERS : readonly PointerKind[] = ["left", "middle", "right", "touch"];
const ACTIONS : readonly NavigationAction[] = ["orbit", "pan"];

// In every preset, so a touchpad and a touch screen can always navigate.
const ANY_DEVICE : readonly INavigationBinding[] = [
    {gesture: {pointer: "left", alt: true}, action: "orbit"},
    {gesture: {pointer: "left", space: true}, action: "pan"},
    {gesture: {pointer: "touch"}, action: "orbit"}
];

const PRESETS : readonly INavigationPresetData[] = [
    {
        id: "fusion360",
        name: "Fusion 360",
        bindings: [
            {gesture: {pointer: "middle"}, action: "pan"},
            {gesture: {pointer: "middle", shift: true}, action: "orbit"},
            ...ANY_DEVICE
        ]
    },
    {
        id: "onshape",
        name: "Onshape",
        bindings: [
            {gesture: {pointer: "middle"}, action: "pan"},
            {gesture: {pointer: "right"}, action: "orbit"},
            ...ANY_DEVICE
        ]
    },
    {
        id: "blender",
        name: "Blender",
        bindings: [
            {gesture: {pointer: "middle"}, action: "orbit"},
            {gesture: {pointer: "middle", shift: true}, action: "pan"},
            ...ANY_DEVICE
        ]
    },
    {
        id: "legacy",
        name: "Legacy",
        bindings: [
            {gesture: {pointer: "left"}, action: "orbit"},
            {gesture: {pointer: "right"}, action: "pan"},
            ...ANY_DEVICE
        ]
    }
];

function gestureKey(gesture : IPointerGesture) : string {
    // A touch carries no modifiers.
    if (gesture.pointer === "touch") {
        return "touch";
    }
    const modifiers : boolean[] = [gesture.ctrl, gesture.alt, gesture.shift, gesture.space].map((on) => on === true);
    return [gesture.pointer, ...modifiers].join("|");
}

export class NavigationPreset {
    public readonly id : string;
    public readonly name : string;
    private readonly bindings : INavigationBinding[];

    public static Default() : NavigationPreset {
        return NavigationPreset.All()[0] ?? new NavigationPreset({id: "none", name: "None", bindings: []});
    }

    public static All() : NavigationPreset[] {
        return PRESETS.map((data) => new NavigationPreset(data));
    }

    public static Describe(gesture : IPointerGesture) : string {
        if (gesture.pointer === "touch") {
            return "one-finger drag";
        }
        const keys : string[] = [];
        if (gesture.ctrl === true) {
            keys.push("Ctrl");
        }
        if (gesture.alt === true) {
            keys.push("Alt");
        }
        if (gesture.shift === true) {
            keys.push("Shift");
        }
        if (gesture.space === true) {
            keys.push("Space");
        }
        keys.push(`${gesture.pointer} drag`);
        return keys.join(" + ");
    }

    constructor(data : INavigationPresetData) {
        const used : Set<string> = new Set<string>();
        for (const binding of data.bindings) {
            if (!POINTERS.includes(binding.gesture.pointer)) {
                throw new Error(`${data.name}: unknown pointer "${binding.gesture.pointer}".`);
            }
            if (!ACTIONS.includes(binding.action)) {
                throw new Error(`${data.name}: unknown action "${binding.action}".`);
            }
            const key : string = gestureKey(binding.gesture);
            if (used.has(key)) {
                throw new Error(`${data.name}: ${NavigationPreset.Describe(binding.gesture)} is bound twice.`);
            }
            used.add(key);
        }
        this.id = data.id;
        this.name = data.name;
        this.bindings = data.bindings.map((binding) => ({gesture: {...binding.gesture}, action: binding.action}));
    }

    public getBindings() : readonly INavigationBinding[] {
        return this.bindings;
    }

    // Modifiers must match exactly.
    public Match(gesture : IPointerGesture) : NavigationAction | null {
        const key : string = gestureKey(gesture);
        return this.bindings.find((binding) => gestureKey(binding.gesture) === key)?.action ?? null;
    }

    public toJSON() : INavigationPresetData {
        return {id: this.id, name: this.name, bindings: this.bindings};
    }
}
