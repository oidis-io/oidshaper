/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { NavigationCubeTheme } from "@oidis-io/oidshaper";
import { DemoElements } from "./DemoElements.js";

import type { Viewport } from "@oidis-io/oidshaper";

interface IThemeChanged {
    (theme : NavigationCubeTheme) : void;
}

export class DemoTheme {
    private readonly select : HTMLSelectElement;
    private readonly view : Viewport;
    private readonly changed? : IThemeChanged;

    public static Configure(view : Viewport, changed? : IThemeChanged) : void {
        new DemoTheme(view, changed);
    }

    private constructor(view : Viewport, changed? : IThemeChanged) {
        this.select = DemoElements.getElement("theme", HTMLSelectElement);
        this.view = view;
        if (changed !== undefined) {
            this.changed = changed;
        }
        this.select.addEventListener("change", () => {
            this.apply();
        });
        this.apply();
    }

    private apply() : void {
        const theme = DemoElements.FindEnum(this.select.value, Object.values(NavigationCubeTheme)) ??
            NavigationCubeTheme.DARK;
        document.documentElement.dataset["theme"] = theme;
        this.view.setBackground(theme === NavigationCubeTheme.DARK ? "#202124" : "#edf1f5");
        this.view.setNavigationCubeTheme(theme);
        this.changed?.(theme);
    }
}
