/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import {
    LocalOrigin, NavigationPreset, Viewport, NavigationAction, NavigationCubeTheme, PointerKind
} from "@oidis-io/oidshaper";
import { DemoTheme } from "../DemoTheme.js";
import { DemoElements } from "../DemoElements.js";

import type { IBoxOptions, IVector3 } from "@oidis-io/oidshaper";

class HelloBoxDemo {
    private static readonly BOX_CENTRE_SPACING : number = 4;
    private static readonly INITIAL_VIEW_DISTANCE : number = 16;

    private readonly canvas : HTMLCanvasElement;
    private readonly controls : HTMLSelectElement;
    private readonly hint : HTMLElement;
    private readonly viewport : Viewport;
    private readonly presets : NavigationPreset[];
    private readonly observer : ResizeObserver;

    constructor() {
        this.canvas = DemoElements.getElement("view", HTMLCanvasElement);
        this.controls = DemoElements.getElement("controls", HTMLSelectElement);
        this.hint = DemoElements.getElement("hint", HTMLElement);
        // S-JTSK
        const centre : IVector3 = {x: -743123.456, y: -1043210.789, z: 312.4};
        const boxes : IBoxOptions[] = [
            {centre: {x: centre.x - HelloBoxDemo.BOX_CENTRE_SPACING, y: centre.y, z: centre.z},
                size: 2, colour: "#12b5cb"},
            {centre, size: 2, colour: "#f9ab00"},
            {centre: {x: centre.x + HelloBoxDemo.BOX_CENTRE_SPACING, y: centre.y, z: centre.z},
                size: 2, colour: "#a142f4"}
        ];
        this.viewport = new Viewport({
            canvas: this.canvas,
            origin: LocalOrigin.CentreOf(boxes.flatMap((box) => [box.centre.x, box.centre.y, box.centre.z])),
            preserveDrawingBuffer: true,
            navigationCube: true, navigationCubeTheme: NavigationCubeTheme.DARK, axisTriad: true
        });
        boxes.forEach((box) => {
            this.viewport.AddBox(box);
        });
        this.viewport.ShowGrid({centre: {x: centre.x, y: centre.y, z: centre.z - 1}, size: 60});
        this.viewport.LookAt(centre, HelloBoxDemo.INITIAL_VIEW_DISTANCE);
        this.presets = NavigationPreset.All();
        this.presets.forEach((preset) => {
            this.controls.add(new Option(preset.name, preset.id));
        });
        this.controls.addEventListener("change", () => {
            this.updateNavigation();
        });
        this.hint.textContent = this.describe(NavigationPreset.Default());
        this.observer = new ResizeObserver(() => {
            this.draw();
        });
        this.observer.observe(this.canvas);
        this.draw();
        document.body.dataset["ready"] = "true";
        DemoTheme.Configure(this.viewport);
    }

    private updateNavigation() : void {
        const preset = this.presets.find((item) => item.id === this.controls.value) ?? NavigationPreset.Default();
        this.viewport.setNavigation(preset);
        this.hint.textContent = this.describe(preset);
    }

    private describe(preset : NavigationPreset) : string {
        const actions : NavigationAction[] = [NavigationAction.ORBIT, NavigationAction.PAN];
        const parts : string[] = actions.map((action) => {
            const gestures : string[] = preset.getBindings()
                .filter((binding) => binding.action === action && binding.gesture.pointer !== PointerKind.TOUCH)
                .map((binding) => NavigationPreset.Describe(binding.gesture));
            return `${action.charAt(0).toUpperCase()}${action.slice(1)}: ${gestures.join(", ")}`;
        });
        return [...parts, "Zoom: wheel"].join("  ·  ");
    }

    private draw() : void {
        this.viewport.Resize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.viewport.Render();
    }
}

new HelloBoxDemo();
