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
    DrawingArea, DrawingShapes, DrawingShape, DxfCodec, LocalOrigin, Viewport, NavigationCubeTheme
} from "@oidis-io/oidshaper";
import { AreaSelection } from "./AreaSelection.js";
import { VertexEditor } from "./VertexEditor.js";
import { DemoElements } from "../DemoElements.js";
import { DemoTheme } from "../DemoTheme.js";

import type { IDrawing, IVector3 } from "@oidis-io/oidshaper";

class DrawingDemo {
    private static readonly DEFAULT_VIEW_DISTANCE : number = 50;
    private static readonly CLICK_TOLERANCE_PIXELS : number = 4;
    private static readonly SAMPLE_ARC_SWEEP_FACTOR : number = 1.5;
    private static readonly DARK_LABEL_COLOUR : number = 0xffffff;
    private static readonly LIGHT_LABEL_COLOUR : number = 0x233447;
    private static readonly MIN_VIEW_DISTANCE : number = 10;
    private static readonly FIT_DISTANCE_FACTOR : number = 3;
    private static readonly MIN_GRID_SIZE : number = 10;

    private readonly canvas : HTMLCanvasElement;
    private readonly draw : HTMLInputElement;
    private readonly file : HTMLInputElement;
    private readonly status : HTMLElement;
    private readonly layers : HTMLElement;
    private readonly height : HTMLInputElement;
    private readonly snap : HTMLInputElement;
    private readonly closed : HTMLInputElement;
    private readonly tool : HTMLSelectElement;
    private readonly selection : HTMLSelectElement;
    private readonly selectionShape : HTMLSelectElement;
    private readonly editor? : VertexEditor;
    private shapeStart? : IVector3;
    private readonly origin : LocalOrigin;
    private readonly view : Viewport;
    private readonly area : DrawingArea;
    private theme : NavigationCubeTheme;
    private generation : number;
    private pointer? : readonly number[];
    private readonly areaSelection : AreaSelection;
    private readonly observer : ResizeObserver;

    constructor() {
        this.canvas = DemoElements.getElement("view", HTMLCanvasElement);
        this.draw = DemoElements.getElement("draw", HTMLInputElement);
        this.file = DemoElements.getElement("file", HTMLInputElement);
        this.status = DemoElements.getElement("status", HTMLElement);
        this.layers = DemoElements.getElement("layers", HTMLElement);
        this.height = DemoElements.getElement("height", HTMLInputElement);
        this.snap = DemoElements.getElement("snap", HTMLInputElement);
        this.closed = DemoElements.getElement("closed", HTMLInputElement);
        this.tool = DemoElements.getElement("tool", HTMLSelectElement);
        this.selection = DemoElements.getElement("selection", HTMLSelectElement);
        this.selectionShape = DemoElements.getElement("selection-shape", HTMLSelectElement);
        this.origin = new LocalOrigin({x: 0, y: 0, z: 0});
        this.view = new Viewport({canvas: this.canvas, origin: this.origin, navigationCube: true,
            preserveDrawingBuffer: true,
            navigationCubeTheme: NavigationCubeTheme.DARK, axisTriad: true, OnCameraChanged: () => {
                this.editor?.Position();
            }});
        this.area = new DrawingArea();
        this.view.LookAt(this.origin, DrawingDemo.DEFAULT_VIEW_DISTANCE);
        this.view.ShowGrid({centre: this.origin, size: 100});
        this.theme = NavigationCubeTheme.DARK;
        this.generation = 0;
        this.bindPointer();
        this.editor = new VertexEditor(this.area, this.view, this.selection, this.snap, this.status,
            this.paint.bind(this), () => {
                this.generation++;
                this.updateLayers();
                this.refresh();
            });
        this.areaSelection = new AreaSelection(this.canvas, this.editor, this.tool, this.selectionShape);
        this.bindConstruction();
        this.bindFiles();
        this.observer = new ResizeObserver(() => {
            this.view.Resize(this.canvas.clientWidth, this.canvas.clientHeight);
        });
        this.observer.observe(this.canvas);
        window.addEventListener("pagehide", () => {
            this.generation++;
            this.areaSelection.Dispose();
            this.editor?.Dispose();
            this.observer.disconnect();
            this.view.Dispose();
        }, {once: true});
        void this.loadSample().finally(() => {
            document.body.dataset["ready"] = "true";
        });
        DemoTheme.Configure(this.view, (value) => {
            this.theme = value;
            const message : string = this.status.textContent;
            this.refresh();
            this.status.textContent = message;
        });
    }

    private bindPointer() : void {
        this.canvas.addEventListener("pointerdown", (event) => {
            if (event.button === 0) {
                this.pointer = [event.clientX, event.clientY];
            } else {
                delete this.pointer;
            }
        });
        this.canvas.addEventListener("pointercancel", () => {
            delete this.pointer;
        });
        this.canvas.addEventListener("click", (event) => {
            const start = this.pointer;
            delete this.pointer;
            if (event.altKey || event.shiftKey || event.ctrlKey || event.metaKey || start === undefined ||
                Math.hypot(event.clientX - (start[0] ?? 0), event.clientY - (start[1] ?? 0)) >
                DrawingDemo.CLICK_TOLERANCE_PIXELS) {
                return;
            }
            if (this.tool.value === "edit") {
                this.editor?.Select(event.clientX, event.clientY);
                return;
            }
            if (!this.draw.checked) {
                return;
            }
            const point = this.view.PickPlane(event.clientX, event.clientY, Number(this.height.value));
            if (point !== null) {
                try {
                    const snapped = DrawingShapes.SnapDrawingPoint(point, Number(this.snap.value));
                    if (this.tool.value === "polyline") {
                        this.area.AddPoint(snapped);
                    } else if (this.shapeStart === undefined) {
                        this.shapeStart = snapped;
                    } else {
                        this.area.AddPath(DrawingShapes.CreateDrawingShape(
                            this.getShape(), this.shapeStart, snapped));
                        delete this.shapeStart;
                        this.updateLayers();
                    }
                    this.generation++;
                    this.refresh();
                } catch (error : unknown) {
                    this.status.textContent = String(error);
                }
            }
        });
    }

    private bindConstruction() : void {
        this.tool.addEventListener("change", this.activateTool.bind(this));
        this.activateTool();
        this.draw.addEventListener("change", () => {
            if (this.draw.checked && this.tool.value === "edit") {
                this.tool.value = "polyline";
                this.activateTool();
            } else {
                this.cancelConstruction();
            }
        });
        this.height.addEventListener("change", this.cancelConstruction.bind(this));
        this.canvas.addEventListener("pointermove", (event) => {
            if (this.shapeStart === undefined || !this.draw.checked || event.buttons !== 0) {
                return;
            }
            const hit = this.view.PickPlane(event.clientX, event.clientY, this.shapeStart.z);
            if (hit !== null) {
                try {
                    const path = DrawingShapes.CreateDrawingShape(this.getShape(), this.shapeStart,
                        DrawingShapes.SnapDrawingPoint(hit, Number(this.snap.value)));
                    const drawing = this.area.getVisibleDrawing();
                    this.paint({...drawing, paths: [...drawing.paths, {...path, colour: 0xffbb33}]});
                } catch {
                    this.paint(this.area.getVisibleDrawing());
                }
            }
        });
        document.querySelector("#finish")?.addEventListener("click", this.finish.bind(this));
        document.querySelector("#fit")?.addEventListener("click", this.fit.bind(this));
        document.querySelector("#undo")?.addEventListener("click", () => {
            if (this.shapeStart !== undefined) {
                delete this.shapeStart;
                this.refresh();
                return;
            }
            this.editor?.Cancel();
            this.area.Undo();
            this.generation++;
            this.updateLayers();
            this.refresh();
        });
        document.querySelector("#redo")?.addEventListener("click", () => {
            delete this.shapeStart;
            this.editor?.Cancel();
            this.area.Redo();
            this.generation++;
            this.updateLayers();
            this.refresh();
        });
        window.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                delete this.shapeStart;
                this.area.Cancel();
                this.generation++;
                this.refresh();
            } else if (event.key === "Enter" && event.target === document.body) {
                this.finish();
            }
        });
    }

    private bindFiles() : void {
        this.file.addEventListener("change", () => {
            const selected : File | undefined = this.file.files?.[0];
            if (selected === undefined) {
                return;
            }
            const request : number = ++this.generation;
            void selected.text().then((text) => {
                if (request !== this.generation) {
                    return;
                }
                const imported = new DxfCodec().Import(text);
                delete this.shapeStart;
                this.editor?.setSelection([]);
                this.area.Replace(imported);
                this.updateLayers();
                this.refresh();
                this.fit();
            }).catch((error : unknown) => {
                if (request === this.generation) {
                    this.status.textContent = String(error);
                }
            }).finally(() => {
                this.file.value = "";
            });
        });
        document.querySelector("#dxf-sample")?.addEventListener("click", () => {
            void this.loadSample();
        });
        document.querySelector("#new")?.addEventListener("click", () => {
            this.generation++;
            delete this.shapeStart;
            this.editor?.setSelection([]);
            this.area.Replace({paths: [], warnings: []});
            this.height.value = "0";
            this.view.LookAt(this.origin, DrawingDemo.DEFAULT_VIEW_DISTANCE);
            this.view.ShowGrid({centre: this.origin, size: 100});
            this.updateLayers();
            this.refresh();
        });
        document.querySelector("#sample")?.addEventListener("click", () => {
            delete this.shapeStart;
            const sample : IDrawing = {warnings: [], paths: [
                {layer: "boundary", closed: true, colour: 0x12b5cb, points: [
                    {x: 0, y: 0, z: 0}, {x: 25, y: 0, z: 0}, {x: 25, y: 15, z: 0}, {x: 0, y: 15, z: 0}
                ]},
                {layer: "face", closed: true, filled: true, colour: 0xb74b88,
                    points: [{x: 3, y: 3, z: 2}, {x: 12, y: 3, z: 2}, {x: 8, y: 10, z: 5}]},
                {layer: "arc", closed: false, points: [{x: 20, y: 8, z: 0}],
                    curve: {centre: {x: 18, y: 8, z: 0}, axisU: {x: 4, y: 0, z: 0}, axisV: {x: 0, y: 4, z: 0},
                        start: 0, sweep: Math.PI * DrawingDemo.SAMPLE_ARC_SWEEP_FACTOR}}
            ], labels: [{layer: "labels", position: {x: 0, y: 17, z: 0},
                text: "Oidshaper DXF", height: 1, rotation: 0}]};
            const codec : DxfCodec = new DxfCodec();
            this.editor?.setSelection([]);
            this.area.Replace(codec.Import(codec.Export(sample)));
            this.generation++;
            this.updateLayers();
            this.refresh();
            this.fit();
        });
        document.querySelector("#export")?.addEventListener("click", () => {
            const content : string = new DxfCodec().Export(this.area.getDrawing());
            const url : string = URL.createObjectURL(new Blob([content], {type: "application/dxf"}));
            const anchor : HTMLAnchorElement = document.createElement("a");
            anchor.href = url;
            anchor.download = "drawing.dxf";
            anchor.click();
            URL.revokeObjectURL(url);
        });
    }

    private getShape() : DrawingShape {
        return DemoElements.ParseEnum(this.tool.value, Object.values(DrawingShape));
    }

    private paint(drawing : IDrawing) : void {
        this.view.setDrawing({...drawing, labels: (drawing.labels ?? []).map((label) => ({...label,
            colour: label.colour ?? (this.theme === NavigationCubeTheme.DARK ?
                DrawingDemo.DARK_LABEL_COLOUR : DrawingDemo.LIGHT_LABEL_COLOUR)}))});
    }

    private refresh() : void {
        this.paint(this.area.getVisibleDrawing());
        const drawing = this.area.getDrawing();
        this.status.textContent = `${String(drawing.paths.length)} paths. ${drawing.warnings.join(" ")}`.trim();
        this.editor?.Refresh();
    }

    private updateLayers() : void {
        this.layers.replaceChildren();
        for (const name of this.area.getLayers()) {
            const label : HTMLLabelElement = document.createElement("label");
            const toggle : HTMLInputElement = document.createElement("input");
            toggle.type = "checkbox";
            toggle.checked = this.area.getLayerVisible(name);
            toggle.addEventListener("change", () => {
                this.area.setLayerVisible(name, toggle.checked);
                this.refresh();
            });
            label.append(toggle, document.createTextNode(name));
            this.layers.append(label);
        }
    }

    private fit() : void {
        const bounds = this.area.getBounds();
        if (bounds !== null) {
            const distance = Math.max(DrawingDemo.MIN_VIEW_DISTANCE, bounds.radius * DrawingDemo.FIT_DISTANCE_FACTOR);
            this.view.LookAt(bounds.centre, distance);
            this.view.ShowGrid({centre: bounds.centre, size: Math.max(DrawingDemo.MIN_GRID_SIZE, bounds.radius * 2)});
            this.height.value = String(bounds.centre.z);
        }
    }

    private finish() : void {
        this.area.Finish(this.closed.checked);
        this.generation++;
        this.updateLayers();
        this.refresh();
    }

    private cancelConstruction() : void {
        this.areaSelection.Cancel();
        delete this.shapeStart;
        this.area.Cancel();
        this.editor?.Cancel();
        this.refresh();
    }

    private activateTool() : void {
        this.cancelConstruction();
        this.draw.checked = this.tool.value !== "edit";
        this.editor?.setEnabled(this.tool.value === "edit");
        document.querySelector(".edit-controls")?.toggleAttribute("hidden", this.tool.value !== "edit");
    }

    private async loadSample() : Promise<void> {
        const request : number = ++this.generation;
        this.status.textContent = "Loading sample DXF…";
        try {
            const response : Response = await fetch(new URL("../../../html/demos/drawing/sample.dxf", import.meta.url));
            if (!response.ok) {
                throw new Error(`Sample DXF could not be loaded (${String(response.status)}).`);
            }
            const content : string = new TextDecoder("windows-1250").decode(await response.arrayBuffer());
            if (request !== this.generation) {
                return;
            }
            delete this.shapeStart;
            this.editor?.setSelection([]);
            this.area.Replace(new DxfCodec().Import(content));
            this.updateLayers();
            this.refresh();
            this.fit();
        } catch (error : unknown) {
            if (request === this.generation) {
                this.status.textContent = String(error);
            }
        }
    }
}

new DrawingDemo();
