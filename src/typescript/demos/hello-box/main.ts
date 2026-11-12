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
    LocalOrigin, NavigationPreset, Viewport, type IBoxOptions, type IVector3, type NavigationAction
} from "@oidis-io/oidshaper";

const canvas : HTMLCanvasElement | null = document.querySelector("#view");
const controls : HTMLSelectElement | null = document.querySelector("#controls");
const hint : HTMLElement | null = document.querySelector("#hint");
if (canvas === null || controls === null || hint === null) {
    throw new Error("The demo page is missing #view, #controls or #hint.");
}

// S-JTSK
const centre : IVector3 = {x: -743123.456, y: -1043210.789, z: 312.4};
const boxes : IBoxOptions[] = [
    {centre: {x: centre.x - 4, y: centre.y, z: centre.z}, size: 2, colour: "#12b5cb"},
    {centre, size: 2, colour: "#f9ab00"},
    {centre: {x: centre.x + 4, y: centre.y, z: centre.z}, size: 2, colour: "#a142f4"}
];

const viewport : Viewport = new Viewport({
    canvas,
    origin: LocalOrigin.CentreOf(boxes.flatMap((box) => [box.centre.x, box.centre.y, box.centre.z])),
    preserveDrawingBuffer: true,
    axisTriad: true
});
boxes.forEach((box) => {
    viewport.AddBox(box);
});
viewport.ShowGrid({centre: {x: centre.x, y: centre.y, z: centre.z - 1}, size: 60});
viewport.LookAt(centre, 16);

const describe = (preset : NavigationPreset) : string => {
    const actions : NavigationAction[] = ["orbit", "pan"];
    const parts : string[] = actions.map((action) => {
        const gestures : string[] = preset.getBindings()
            .filter((binding) => binding.action === action && binding.gesture.pointer !== "touch")
            .map((binding) => NavigationPreset.Describe(binding.gesture));
        return `${action.charAt(0).toUpperCase()}${action.slice(1)}: ${gestures.join(", ")}`;
    });
    return [...parts, "Zoom: wheel"].join("  ·  ");
};

const presets : NavigationPreset[] = NavigationPreset.All();
presets.forEach((preset) => {
    controls.add(new Option(preset.name, preset.id));
});
controls.addEventListener("change", () => {
    const preset : NavigationPreset = presets.find((item) => item.id === controls.value) ?? NavigationPreset.Default();
    viewport.setNavigation(preset);
    hint.textContent = describe(preset);
});
hint.textContent = describe(NavigationPreset.Default());

const draw = () : void => {
    viewport.Resize(canvas.clientWidth, canvas.clientHeight);
    viewport.Render();
};
new ResizeObserver(draw).observe(canvas);
draw();
document.body.dataset["ready"] = "true";
