/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

export enum PointerKind {
    LEFT = "left",
    MIDDLE = "middle",
    RIGHT = "right",
    TOUCH = "touch"
}

export enum NavigationAction {
    ORBIT = "orbit",
    PAN = "pan"
}

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

export class NavigationPreset {
    private static readonly POINTERS : readonly PointerKind[] = [
        PointerKind.LEFT, PointerKind.MIDDLE, PointerKind.RIGHT, PointerKind.TOUCH
    ];
    private static readonly ACTIONS : readonly NavigationAction[] = [NavigationAction.ORBIT, NavigationAction.PAN];

    // In every preset, so a touchpad and a touch screen can always navigate.
    private static readonly ANY_DEVICE : readonly INavigationBinding[] = [
        {gesture: {pointer: PointerKind.LEFT, alt: true}, action: NavigationAction.ORBIT},
        {gesture: {pointer: PointerKind.LEFT, space: true}, action: NavigationAction.PAN},
        {gesture: {pointer: PointerKind.TOUCH}, action: NavigationAction.ORBIT}
    ];

    private static readonly PRESETS : readonly INavigationPresetData[] = [
        {
            id: "fusion360",
            name: "Fusion 360",
            bindings: [
                {gesture: {pointer: PointerKind.MIDDLE}, action: NavigationAction.PAN},
                {gesture: {pointer: PointerKind.MIDDLE, shift: true}, action: NavigationAction.ORBIT},
                ...NavigationPreset.ANY_DEVICE
            ]
        },
        {
            id: "onshape",
            name: "Onshape",
            bindings: [
                {gesture: {pointer: PointerKind.MIDDLE}, action: NavigationAction.PAN},
                {gesture: {pointer: PointerKind.RIGHT}, action: NavigationAction.ORBIT},
                ...NavigationPreset.ANY_DEVICE
            ]
        },
        {
            id: "blender",
            name: "Blender",
            bindings: [
                {gesture: {pointer: PointerKind.MIDDLE}, action: NavigationAction.ORBIT},
                {gesture: {pointer: PointerKind.MIDDLE, shift: true}, action: NavigationAction.PAN},
                ...NavigationPreset.ANY_DEVICE
            ]
        },
        {
            id: "legacy",
            name: "Legacy",
            bindings: [
                {gesture: {pointer: PointerKind.LEFT}, action: NavigationAction.ORBIT},
                {gesture: {pointer: PointerKind.RIGHT}, action: NavigationAction.PAN},
                ...NavigationPreset.ANY_DEVICE
            ]
        }
    ];

    public readonly id : string;
    public readonly name : string;
    private readonly bindings : INavigationBinding[];

    public static Default() : NavigationPreset {
        return NavigationPreset.All()[0] ?? new NavigationPreset({id: "none", name: "None", bindings: []});
    }

    public static All() : NavigationPreset[] {
        return NavigationPreset.PRESETS.map((data) => new NavigationPreset(data));
    }

    public static Describe(gesture : IPointerGesture) : string {
        if (gesture.pointer === PointerKind.TOUCH) {
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

    private static gestureKey(gesture : IPointerGesture) : string {
        // A touch carries no modifiers.
        if (gesture.pointer === PointerKind.TOUCH) {
            return PointerKind.TOUCH;
        }
        const modifiers : boolean[] = [gesture.ctrl, gesture.alt, gesture.shift, gesture.space]
            .map((on) => on === true);
        return [gesture.pointer, ...modifiers].join("|");
    }

    constructor(data : INavigationPresetData) {
        const used : Set<string> = new Set<string>();
        for (const binding of data.bindings) {
            if (!NavigationPreset.POINTERS.includes(binding.gesture.pointer)) {
                throw new Error(`${data.name}: unknown pointer "${binding.gesture.pointer}".`);
            }
            if (!NavigationPreset.ACTIONS.includes(binding.action)) {
                throw new Error(`${data.name}: unknown action "${binding.action}".`);
            }
            const key : string = NavigationPreset.gestureKey(binding.gesture);
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
        const key : string = NavigationPreset.gestureKey(gesture);
        return this.bindings.find((binding) => NavigationPreset.gestureKey(binding.gesture) === key)?.action ?? null;
    }

    public toJSON() : INavigationPresetData {
        return {id: this.id, name: this.name, bindings: this.bindings};
    }
}
