/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { LocalOrigin, MapView, Viewport, MapSource, NavigationCubeTheme } from "@oidis-io/oidshaper";
import { DemoTheme } from "../DemoTheme.js";
import { DemoElements } from "../DemoElements.js";

class MapsDemo {
    private static readonly INITIAL_VIEW_DISTANCE : number = 500;
    private static readonly MODEL_SIZE : number = 10;

    private readonly container : HTMLElement;
    private readonly canvas : HTMLCanvasElement;
    private readonly source : HTMLSelectElement;
    private readonly cadastre : HTMLInputElement;
    private readonly credits : HTMLElement;
    private readonly feedback : HTMLElement;
    private map? : MapView;
    private view? : Viewport;
    private resize? : ResizeObserver;

    constructor() {
        this.container = DemoElements.getElement("map", HTMLElement);
        this.canvas = DemoElements.getElement("view", HTMLCanvasElement);
        this.source = DemoElements.getElement("source", HTMLSelectElement);
        this.cadastre = DemoElements.getElement("cadastre", HTMLInputElement);
        this.credits = document.createElement("div");
        this.credits.id = "credits";
        document.body.appendChild(this.credits);
        this.feedback = document.createElement("p");
        this.container.parentElement?.querySelector("aside")?.appendChild(this.feedback);
    }

    public async Start() : Promise<void> {
        const map = await MapView.Create({container: this.container, creditContainer: this.credits,
            assetsUrl: new URL("../cesium/", location.href).href,
            OnLoadingChanged: (pending) => {
                document.body.dataset["mapLoading"] = String(pending);
            },
            OnError: (message) => {
                this.feedback.textContent = message;
            }});
        this.map = map;
        const origin = new LocalOrigin({x: -743123.456, y: -1043210.789, z: 0});
        const view = new Viewport({
            canvas: this.canvas, origin, transparent: true, navigationCube: true, axisTriad: true,
            OnCameraChanged: (state) => {
                map.SyncCamera(state);
            }
        });
        this.view = view;
        view.LookAt({x: origin.x, y: origin.y, z: 400}, MapsDemo.INITIAL_VIEW_DISTANCE);
        void map.SampleHeight(origin).then((height) => {
            view.AddBox({centre: {x: origin.x, y: origin.y, z: height + (MapsDemo.MODEL_SIZE / 2)},
                size: MapsDemo.MODEL_SIZE, colour: "#f9ab00"});
            view.LookAt({x: origin.x, y: origin.y, z: height}, MapsDemo.INITIAL_VIEW_DISTANCE);
            this.feedback.textContent = `DMR 5G: ${height.toFixed(2)} m Bpv`;
            document.body.dataset["terrainHeight"] = String(height);
        }).catch((error : unknown) => {
            this.feedback.textContent = String(error);
        });
        this.bindControls();
        this.update();
        this.resize = new ResizeObserver(() => {
            this.view?.Resize(this.canvas.clientWidth, this.canvas.clientHeight);
        });
        this.resize.observe(this.canvas);
        window.addEventListener("pagehide", () => {
            this.dispose();
        }, {once: true});
        document.body.dataset["ready"] = "true";
        DemoTheme.Configure(view, (theme) => {
            map.setBackground(theme === NavigationCubeTheme.DARK ? "#202124" : "#edf1f5");
        });
    }

    private bindControls() : void {
        document.querySelector("#models")?.addEventListener("change", (event) => {
            const input = <HTMLInputElement>event.target;
            this.view?.setModelsVisible(input.checked);
        });
        this.source.addEventListener("change", () => {
            this.update();
        });
        this.cadastre.addEventListener("change", () => {
            this.update();
        });
    }

    private update() : void {
        const base = DemoElements.FindEnum(this.source.value,
            [MapSource.ORTHOPHOTO, MapSource.TOPOGRAPHIC, MapSource.OSM]) ?? MapSource.OSM;
        this.map?.setSources(this.cadastre.checked ? [base, MapSource.CADASTRE] : [base]);
    }

    private dispose() : void {
        this.resize?.disconnect();
        this.view?.Dispose();
        this.map?.Dispose();
        delete this.resize;
        delete this.view;
        delete this.map;
    }
}

await new MapsDemo().Start();
