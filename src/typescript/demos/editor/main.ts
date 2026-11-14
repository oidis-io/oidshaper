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
    EntityDocument, EntityTypes, LocalOrigin, Viewport, EntityTransforms, EntityDrawingTool, DrawingPrimitive,
    WorkingPlane, EntitySnapResolver, EntityMoveTool, EntityAutosave, BrowserProjectStore, EntityTransformGizmo,
    TransformMode, ActiveCursor, TransformCursor, CursorOperation, NavigationCubeTheme
} from "@oidis-io/oidshaper";
import { AreaSelection } from "../drawing/AreaSelection.js";
import { DemoElements } from "../DemoElements.js";
import { DemoTheme } from "../DemoTheme.js";

import type {
    IEntity, IVector3, IPoint2, SelectionMode, SelectionOperation, IEntityDocumentData, IGripTarget
} from "@oidis-io/oidshaper";

interface IDemoAction {
    () : void;
}

class EditorDemo {
    private static readonly DEFAULT_VIEW_DISTANCE : number = 65;
    private static readonly CLICK_TOLERANCE_PIXELS : number = 4;
    private static readonly INSERTED_BOX_SIZE : number = 5;
    private static readonly DEGREES_PER_HALF_TURN : number = 180;
    private static readonly SNAP_RADIUS_PIXELS : number = 10;

    private readonly canvas : HTMLCanvasElement;
    private readonly tool : HTMLSelectElement;
    private readonly list : HTMLSelectElement;
    private readonly targetLayer : HTMLSelectElement;
    private readonly status : HTMLElement;
    private readonly scene : EntityDocument;
    private readonly snaps : EntitySnapResolver;
    private readonly store : BrowserProjectStore;
    private autosave? : EntityAutosave;
    private readonly handles : HTMLDivElement;
    private readonly positions : IVector3[];
    private selectedGrip? : IGripTarget;
    private readonly axisGizmo? : EntityTransformGizmo;
    private readonly view : Viewport;
    private drawing? : EntityDrawingTool;
    private down? : IPoint2;
    private cancelDrag? : IDemoAction;
    private readonly gripCursor : ActiveCursor;
    private readonly selection : AreaSelection;
    private move? : EntityMoveTool;
    private movePointer? : number;
    private readonly observer : ResizeObserver;

    constructor() {
        this.canvas = DemoElements.getElement("view", HTMLCanvasElement);
        this.tool = DemoElements.getElement("tool", HTMLSelectElement);
        this.list = DemoElements.getElement("object", HTMLSelectElement);
        this.targetLayer = DemoElements.getElement("target-layer", HTMLSelectElement);
        this.status = DemoElements.getElement("status", HTMLElement);
        this.scene = new EntityDocument();
        this.snaps = new EntitySnapResolver(this.scene);
        this.store = new BrowserProjectStore("oidshaper-editor");
        this.handles = document.createElement("div");
        this.handles.className = "vertex-handles";
        document.body.append(this.handles);
        this.positions = [];
        this.view = new Viewport({canvas: this.canvas, origin: new LocalOrigin({x: 0, y: 0, z: 0}),
            navigationCube: true,
            navigationCubeTheme: NavigationCubeTheme.DARK, preserveDrawingBuffer: true, OnCameraChanged: () => {
                this.positionHandles(); this.axisGizmo?.Position();
            }});
        this.view.LookAt({x: 0, y: 0, z: 0}, EditorDemo.DEFAULT_VIEW_DISTANCE);
        this.view.ShowGrid({centre: {x: 0, y: 0, z: 0}, size: 100});
        this.axisGizmo = new EntityTransformGizmo(this.scene, this.view, {
            GridStep: () => DemoElements.getElement("grid-snap", HTMLInputElement).checked ? this.number("snap") : 0,
            Previewed: (position) => {
                if (this.selectedGrip !== undefined) {
                    const grips = this.scene.getGrips(this.selectedGrip.entity);
                    const index = grips.findIndex((grip) => grip.id === this.selectedGrip?.grip);
                    const grip = grips[index];
                    if (grip !== undefined) {
                        this.positions[index] = position ?? grip.position;
                        this.positionHandles();
                    }
                }
            },
            Changed: () => {
                this.refresh();
            },
            Error: (error) => {
                this.status.textContent = String(error);
            },
            IsNavigationGesture: (event) => event.altKey,
            navigationTarget: this.canvas
        }, document.body);
        this.gripCursor = new ActiveCursor();
        this.selection = new AreaSelection(this.canvas, {
            Select: (x : number, y : number, operation : SelectionOperation) => {
                delete this.selectedGrip;
                const hit = this.view.PickEntity(x, y);
                if (hit === null) {
                    this.scene.Select([], operation);
                } else {
                    let entity = this.scene.getEntity(hit.id);
                    while (entity.parentId !== null) {
                        entity = this.scene.getEntity(entity.parentId);
                    }
                    this.scene.Select([entity.id], operation);
                }
                this.refresh();
            },
            SelectRegion: (region : readonly IPoint2[], mode : SelectionMode, operation : SelectionOperation) => {
                delete this.selectedGrip;
                this.scene.SelectRegion(region, mode, operation, (point) => this.view.ProjectPoint(point));
                this.refresh();
            }
        }, this.tool, DemoElements.getElement("selection-shape", HTMLSelectElement));
        this.bindSelection();
        this.bindMove();
        this.bindDrawing();
        this.bindHistory();
        this.bindLayers();
        this.bindTransforms();
        this.bindGrouping();
        this.bindDrawingPreview();
        this.bindPersistence();
        this.observer = new ResizeObserver(() => {
            this.view.Resize(this.canvas.clientWidth, this.canvas.clientHeight);
        });
        this.observer.observe(this.canvas);
        this.scene.AddEntities({entities: [
            {id: "box", type: "mesh", name: "Box", data: EntityTypes.BoxMesh({x: 6, y: 8, z: 6}),
                transform: EntityTransforms.Translation({x: 8, y: 0, z: 3})},
            {id: "rectangle", type: "rectangle", name: "Rectangle",
                data: {a: {x: -15, y: -5, z: 0}, b: {x: -5, y: 5, z: 0}}},
            {id: "circle", type: "circle", name: "Circle", data: {centre: {x: 0, y: 10, z: 0}, radius: 4}}
        ]});
        DemoTheme.Configure(this.view);
        this.refresh();
        document.body.dataset["ready"] = "true";
        window.addEventListener("pagehide", () => {
            this.axisGizmo?.Dispose(); this.gripCursor.Clear(); this.autosave?.Dispose(); this.selection.Dispose();
            this.observer.disconnect(); this.view.Dispose(); this.handles.remove();
        }, {once: true});
    }

    private bindSelection() : void {
        this.list.addEventListener("change", () => {
            this.act(() => {
                delete this.selectedGrip;
                this.scene.Select([this.list.value]);
            });
        });
        this.tool.addEventListener("change", () => {
            delete this.selectedGrip;
            this.drawing?.Cancel(); delete this.drawing; this.cancelDrag?.(); this.cancelMove();
        });
        for (const id of ["plane", "height", "target-layer"]) {
            DemoElements.getElement(id, HTMLElement).addEventListener("change", () => {
                this.drawing?.Cancel(); delete this.drawing; this.cancelDrag?.(); this.cancelMove();
            });
        }
    }

    private bindMove() : void {
        this.canvas.addEventListener("pointerdown", (event) => {
            if (this.getTransformMode() !== TransformMode.MOVE || event.button !== 0 || event.altKey ||
                this.scene.getSelection().length === 0) {
                return;
            }
            const plane = this.workingPlane();
            const hit = this.view.PickWorkingPlane(event.clientX, event.clientY, plane);
            if (hit !== null) {
                event.preventDefault(); event.stopImmediatePropagation();
                this.move = new EntityMoveTool(this.scene, this.scene.getSelection(),
                    this.snapped(hit, event.clientX, event.clientY, plane));
                this.movePointer = event.pointerId;
                this.canvas.setPointerCapture(event.pointerId);
            }
        }, {capture: true});
        this.canvas.addEventListener("pointermove", (event) => {
            if (this.move === undefined || event.pointerId !== this.movePointer) {
                return;
            }
            event.stopImmediatePropagation();
            const plane = this.workingPlane();
            const hit = this.view.PickWorkingPlane(event.clientX, event.clientY, plane);
            if (hit !== null) {
                try {
                    this.view.setDrawing(this.move.Preview(this.snapped(hit, event.clientX, event.clientY, plane,
                        new Set(this.scene.getSelection()))));
                } catch (error : unknown) {
                    this.cancelMove(); this.status.textContent = String(error);
                }
            }
        }, {capture: true});
        this.canvas.addEventListener("pointerup", (event) => {
            if (this.move === undefined || event.pointerId !== this.movePointer) {
                return;
            }
            event.stopImmediatePropagation();
            const session = this.move; delete this.move;
            this.cancelMove(); this.act(() => {
                session.Commit();
            });
        }, {capture: true});
        for (const name of ["pointercancel", "lostpointercapture"]) {
            this.canvas.addEventListener(name, () => {
                if (this.move !== undefined) {
                    this.cancelMove();
                }
            });
        }
        window.addEventListener("blur", () => {
            this.cancelDrag?.();
            if (this.move !== undefined) {
                this.cancelMove();
            }
        });
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                this.cancelDrag?.();
                if (this.move !== undefined) {
                    this.cancelMove();
                }
            }
        });
    }

    private bindDrawing() : void {
        this.canvas.addEventListener("pointerdown", (event) => {
            if (event.button === 0) {
                this.down = {x: event.clientX, y: event.clientY};
            } else {
                delete this.down;
            }
        });
        this.canvas.addEventListener("click", (event) => {
            if (this.tool.value === "edit" || this.getTransformMode() !== undefined || this.down === undefined ||
                event.altKey || event.shiftKey || event.ctrlKey ||
                Math.hypot(this.down.x - event.clientX, this.down.y - event.clientY) >
                EditorDemo.CLICK_TOLERANCE_PIXELS) {
                return;
            }
            delete this.down;
            this.act(() => {
                const plane = this.workingPlane();
                const hit = this.view.PickWorkingPlane(event.clientX, event.clientY, plane);
                if (hit === null) {
                    return;
                }
                const point = this.snapped(hit, event.clientX, event.clientY, plane);
                if (this.tool.value === "box") {
                    this.scene.AddEntities({entities: [{type: "mesh", name: "Box",
                        layer: this.targetLayer.value,
                        data: EntityTypes.BoxMesh({x: EditorDemo.INSERTED_BOX_SIZE,
                            y: EditorDemo.INSERTED_BOX_SIZE, z: EditorDemo.INSERTED_BOX_SIZE}),
                        transform: EntityTransforms.Translation({...point,
                            z: point.z + (EditorDemo.INSERTED_BOX_SIZE / 2)})}]});
                } else {
                    this.drawing ??= new EntityDrawingTool(this.scene, {primitive: this.getPrimitive(),
                        layer: this.targetLayer.value, plane: plane.getTransform()});
                    if (this.drawing.AddPoint(point)) {
                        delete this.drawing;
                    }
                }
            });
        });
    }

    private bindHistory() : void {
        DemoElements.getElement("undo", HTMLElement).addEventListener("click", () => {
            this.act(() => {
                if (this.drawing !== undefined) {
                    this.drawing.UndoPoint();
                } else {
                    this.scene.Undo();
                }
            });
        });
        DemoElements.getElement("redo", HTMLElement).addEventListener("click", () => {
            this.act(() => {
                this.scene.Redo();
            });
        });
        DemoElements.getElement("delete", HTMLElement).addEventListener("click", () => {
            this.act(() => {
                this.scene.RemoveEntities({ids: this.scene.getSelection()});
            });
        });
        DemoElements.getElement("empty", HTMLElement).addEventListener("click", () => {
            this.act(() => {
                this.scene.RemoveEntities({
                    ids: this.scene.getChildren(null).map((entity) => entity.id)});
            });
        });
    }

    private bindLayers() : void {
        DemoElements.getElement("add-layer", HTMLElement).addEventListener("click", () => {
            this.act(() => {
                const name = DemoElements.getElement("layer-name", HTMLInputElement).value;
                if (this.scene.getLayers().some((layer) => layer.name === name)) {
                    throw new Error("Layer already exists.");
                }
                this.scene.setLayer({layer: {name, visible: true, locked: false}});
            });
        });
        DemoElements.getElement("move-layer", HTMLElement).addEventListener("click", () => {
            this.act(() => {
                this.scene.MoveEntitiesToLayer({ids: this.scene.getSelection(),
                    layer: this.targetLayer.value});
            });
        });
        DemoElements.getElement("rename-layer", HTMLElement).addEventListener("click", () => {
            this.act(() => {
                this.scene.RenameLayer({name: this.targetLayer.value,
                    replacement: DemoElements.getElement("layer-name", HTMLInputElement).value});
            });
        });
        DemoElements.getElement("remove-layer", HTMLElement).addEventListener("click", () => {
            this.act(() => {
                this.scene.RemoveLayer({name: this.targetLayer.value, target: "default"});
            });
        });
    }

    private bindTransforms() : void {
        DemoElements.getElement("operation", HTMLElement).addEventListener("change", () => {
            const mode = DemoElements.FindEnum(DemoElements.getElement("operation", HTMLSelectElement).value,
                Object.values(TransformMode));
            const value = mode === TransformMode.SCALE ? "1" : "0";
            for (const id of ["tx", "ty", "tz"]) {
                DemoElements.getElement(id, HTMLInputElement).value = value;
            }
        });
        DemoElements.getElement("apply", HTMLElement).addEventListener("click", () => {
            this.act(() => {
                const value = {x: this.number("tx"), y: this.number("ty"), z: this.number("tz")};
                const vertices = this.scene.getSelection().flatMap((id) =>
                    this.scene.getGeometry(id).flatMap((part) => part.points));
                if (vertices.length === 0) {
                    return;
                }
                const pivot = {x: 0, y: 0, z: 0};
                for (const axis of <const>["x", "y", "z"]) {
                    let min = Infinity, max = -Infinity;
                    for (const point of vertices) {
                        min = Math.min(min, point[axis]); max = Math.max(max, point[axis]);
                    }
                    pivot[axis] = (min + max) / 2;
                }
                const operation = DemoElements.getElement("operation", HTMLSelectElement).value;
                const mode = operation === "copy" ? TransformMode.MOVE :
                    DemoElements.ParseEnum(operation, Object.values(TransformMode));
                const translating = mode === TransformMode.MOVE;
                const change = translating ? EntityTransforms.Translation(value) : mode === TransformMode.SCALE ?
                    EntityTransforms.Scale(value) : EntityTransforms.Rotation({
                        x: (value.x * Math.PI) / EditorDemo.DEGREES_PER_HALF_TURN,
                        y: (value.y * Math.PI) / EditorDemo.DEGREES_PER_HALF_TURN,
                        z: (value.z * Math.PI) / EditorDemo.DEGREES_PER_HALF_TURN});
                const delta = translating ? change : EntityTransforms.Multiply(EntityTransforms.Translation(pivot),
                    EntityTransforms.Multiply(change,
                        EntityTransforms.Translation({x: -pivot.x, y: -pivot.y, z: -pivot.z})));
                const ids = this.scene.getSelection();
                if (operation === "copy") {
                    this.scene.CopyEntities({ids, delta});
                } else {
                    this.scene.TransformEntities({ids, delta});
                }
            });
        });
    }

    private bindGrouping() : void {
        DemoElements.getElement("group", HTMLElement).addEventListener("click", () => {
            this.act(() => {
                const id = this.scene.NewId();
                this.scene.GroupEntities({id, name: "Group", ids: this.scene.getSelection()});
                this.scene.Select([id]);
            });
        });
        DemoElements.getElement("ungroup", HTMLElement).addEventListener("click", () => {
            this.act(() => {
                const id = this.scene.getSelection()[0];
                if (id !== undefined) {
                    this.scene.UngroupEntity({id});
                }
            });
        });
    }

    private bindDrawingPreview() : void {
        DemoElements.getElement("finish", HTMLElement).addEventListener("click", this.finishDrawing.bind(this));
        this.canvas.addEventListener("pointermove", (event) => {
            if (this.drawing === undefined) {
                return;
            }
            const plane = this.workingPlane();
            const point = this.view.PickWorkingPlane(event.clientX, event.clientY, plane);
            if (point !== null) {
                try {
                    this.view.setDrawing(this.drawing.Preview(
                        this.snapped(point, event.clientX, event.clientY, plane)));
                } catch (error : unknown) {
                    this.drawing.Cancel(); delete this.drawing; this.refresh(); this.status.textContent = String(error);
                }
            }
        });
        window.addEventListener("keydown", (event) => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement ||
                event.target instanceof HTMLTextAreaElement ||
                (event.target instanceof HTMLElement && event.target.isContentEditable) ||
                event.ctrlKey || event.metaKey || event.altKey) {
                return;
            }
            const key = event.key.toLowerCase();
            const mode = key === "g" ? TransformMode.MOVE : key === "r" ? TransformMode.ROTATE :
                key === "s" ? TransformMode.SCALE : undefined;
            if (mode !== undefined && this.scene.getSelection().length > 0) {
                event.preventDefault(); this.activateTransform(mode); return;
            }
            if (event.key === "Enter" && this.drawing !== undefined) {
                event.preventDefault(); this.finishDrawing();
            }
            if (event.key === "Escape") {
                this.drawing?.Cancel(); delete this.drawing; this.cancelDrag?.();
                if (this.tool.value === "edit" && this.selectedGrip === undefined) {
                    this.scene.Select([]);
                }
                delete this.selectedGrip; this.tool.value = "edit"; this.cancelMove(); this.refresh();
            }
        });
    }

    private bindPersistence() : void {
        DemoElements.getElement("save", HTMLElement).addEventListener("click", () => {
            const content = JSON.stringify(this.scene.Serialize());
            const url = URL.createObjectURL(new Blob([content], {type: "application/json"}));
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "scene.json";
            anchor.click();
            URL.revokeObjectURL(url);
        });
        DemoElements.getElement("load", HTMLInputElement).addEventListener("change", () => {
            const file = DemoElements.getElement("load", HTMLInputElement).files?.[0];
            if (file === undefined) {
                return;
            }
            const revision = this.scene.getRevision();
            void file.text().then((text) => {
                this.act(() => {
                    if (revision !== this.scene.getRevision()) {
                        throw new Error("Scene changed while loading the file.");
                    }
                    this.scene.ReplaceDocument({document: <IEntityDocumentData>JSON.parse(text)});
                    this.scene.Select([]);
                });
            }).catch((error : unknown) => {
                this.status.textContent = String(error);
            });
        });
        DemoElements.getElement("insert", HTMLInputElement).addEventListener("change", () => {
            const file = DemoElements.getElement("insert", HTMLInputElement).files?.[0];
            if (file === undefined) {
                return;
            }
            const revision = this.scene.getRevision();
            void file.text().then((text) => {
                this.act(() => {
                    if (this.scene.getRevision() !== revision) {
                        throw new Error("Document changed while reading the model.");
                    }
                    const id = this.scene.NewId();
                    this.scene.ImportDocument({id, name: file.name,
                        document: <IEntityDocumentData>JSON.parse(text)});
                    this.scene.Select([id]);
                });
            }).catch((error : unknown) => {
                this.status.textContent = String(error);
            });
        });
        DemoElements.getElement("autosave", HTMLInputElement).addEventListener("change", () => {
            this.autosave?.Dispose(); delete this.autosave;
            if (DemoElements.getElement("autosave", HTMLInputElement).checked) {
                this.autosave = new EntityAutosave(this.scene, {Write: async (snapshot) => {
                    await this.store.Write(snapshot);
                    DemoElements.getElement("storage-status", HTMLElement).textContent =
                        `Saved revision ${String(snapshot.revision)}`;
                }}, (error : unknown) => {
                    DemoElements.getElement("storage-status", HTMLElement).textContent = String(error);
                });
                this.autosave.SaveCurrent();
            }
        });
        DemoElements.getElement("restore", HTMLElement).addEventListener("click", () => {
            const revision = this.scene.getRevision();
            void this.store.Read().then((snapshot) => {
                this.act(() => {
                    if (snapshot === null) {
                        throw new Error("No saved project.");
                    }
                    if (this.scene.getRevision() !== revision) {
                        throw new Error("Document changed while reading the saved project.");
                    }
                    this.scene.ReplaceDocument({document: snapshot.document});
                });
            }).catch((error : unknown) => {
                this.status.textContent = String(error);
            });
        });
    }

    private getTransformMode() : TransformMode | undefined {
        return DemoElements.FindEnum(this.tool.value, Object.values(TransformMode));
    }

    private getPrimitive() : DrawingPrimitive {
        return DemoElements.ParseEnum(this.tool.value, Object.values(DrawingPrimitive));
    }

    private workingPlane() : WorkingPlane {
        const name = DemoElements.getElement("plane", HTMLSelectElement).value;
        const rotation = EntityTransforms.Rotation({x: name === "XZ" ? Math.PI / 2 : 0,
            y: name === "YZ" ? Math.PI / 2 : 0, z: 0});
        const offset = EntityTransforms.Translation({x: 0, y: 0, z: this.number("height")});
        return new WorkingPlane(EntityTransforms.Multiply(offset, rotation));
    }

    private snapped(point : IVector3, x : number, y : number, plane : WorkingPlane,
        excluded : ReadonlySet<string> = new Set()) : IVector3 {
        const grid = DemoElements.getElement("grid-snap", HTMLInputElement).checked ? this.number("snap") : 0;
        const result = this.snaps.Resolve(point, plane, grid, {x, y},
            (value) => this.view.ProjectPoint(value), EditorDemo.SNAP_RADIUS_PIXELS, excluded);
        DemoElements.getElement("snap-kind", HTMLElement).textContent = result.kind;
        return result.position;
    }

    private positionHandles() : void {
        Array.from(this.handles.children).forEach((child, index) => {
            const point = this.positions[index];
            const projected = point === undefined ? null : this.view.ProjectPoint(point);
            const handle = <HTMLButtonElement>child;
            handle.hidden = projected === null;
            if (projected !== null) {
                handle.style.left = `${String(projected.x)}px`;
                handle.style.top = `${String(projected.y)}px`;
            }
        });
    }

    private makeHandles(entity : IEntity) : void {
        this.scene.getGrips(entity.id).forEach((grip) => {
            const point = grip.position;
            const matrix = this.workingPlane().getTransform();
            const local = new WorkingPlane(matrix).ToLocal(point);
            const dragPlane = new WorkingPlane(grip.plane ?? EntityTransforms.Multiply(matrix,
                EntityTransforms.Translation({x: 0, y: 0, z: local.z})));
            const slot = this.positions.push(point) - 1;
            const handle = document.createElement("button");
            handle.className = "vertex-handle";
            handle.style.cursor = TransformCursor.TransformCursor(CursorOperation.MOVE, false);
            handle.setAttribute("aria-label", `${grip.role} ${grip.id}`);
            handle.setAttribute("aria-pressed",
                String(this.selectedGrip?.entity === entity.id && this.selectedGrip.grip === grip.id));
            let moving : boolean = false;
            let final : IVector3 = point;
            let revision : number = 0;
            handle.addEventListener("pointerdown", (event) => {
                if (event.button !== 0) {
                    return;
                }
                event.preventDefault();
                this.selectedGrip = {entity: entity.id, grip: grip.id};
                moving = true;
                revision = this.scene.getRevision();
                handle.setPointerCapture(event.pointerId);
                this.gripCursor.setCursor(TransformCursor.TransformCursor(CursorOperation.MOVE, true));
                this.cancelDrag = () => {
                    moving = false; delete this.cancelDrag; this.gripCursor.Clear(); this.refresh();
                };
            });
            handle.addEventListener("pointermove", (event) => {
                if (!moving) {
                    return;
                }
                const hit = this.view.PickWorkingPlane(event.clientX, event.clientY, dragPlane);
                if (hit === null) {
                    return;
                }
                try {
                    final = this.snapped(hit, event.clientX, event.clientY,
                        dragPlane, new Set([entity.id]));
                    this.view.setDrawing(this.scene.PreviewGrip(entity.id, grip.id, final, revision));
                    this.positions[slot] = final;
                    this.positionHandles();
                } catch (error : unknown) {
                    this.cancelDrag?.();
                    this.status.textContent = String(error);
                }
            });
            handle.addEventListener("pointerup", () => {
                if (moving) {
                    moving = false;
                    delete this.cancelDrag;
                    this.gripCursor.Clear();
                    this.act(() => {
                        if (final.x !== point.x || final.y !== point.y || final.z !== point.z) {
                            this.scene.MoveGrip({id: entity.id, grip: grip.id,
                                position: final, expectedRevision: revision});
                        }
                    });
                }
            });
            handle.addEventListener("pointercancel", () => this.cancelDrag?.());
            handle.addEventListener("lostpointercapture", () => {
                if (moving) {
                    this.cancelDrag?.();
                }
            });
            this.handles.append(handle);
        });
        this.positionHandles();
    }

    private refresh() : void {
        this.view.setDrawing(this.scene.getDrawing());
        this.handles.replaceChildren();
        this.positions.length = 0;
        const entities = this.scene.getEntities();
        const selected = this.scene.getSelection();
        DemoElements.getElement("selection-count", HTMLElement).textContent = `${String(selected.length)} selected`;
        this.status.textContent = `${String(entities.length)} entities.`;
        this.list.replaceChildren(new Option("Select an entity", ""));
        this.appendEntities(entities, null, 0);
        this.list.value = selected.length === 1 ? selected[0] ?? "" : "";
        const entity = selected.length === 1 ? entities.find((item) => item.id === selected[0]) : undefined;
        if (this.selectedGrip !== undefined && (entity?.id !== this.selectedGrip.entity ||
            !this.scene.getGrips(this.selectedGrip.entity).some((grip) => grip.id === this.selectedGrip?.grip))) {
            delete this.selectedGrip;
        }
        if (entity !== undefined && (this.tool.value === "edit" || this.selectedGrip !== undefined)) {
            this.makeHandles(entity);
        }
        const mode = this.getTransformMode() ?? null;
        this.axisGizmo?.Refresh(mode, this.selectedGrip ?? null);
        const previous = this.targetLayer.value;
        this.targetLayer.replaceChildren();
        const layers = DemoElements.getElement("layers", HTMLElement);
        layers.replaceChildren();
        this.scene.getLayers().forEach((layer) => {
            this.targetLayer.add(new Option(layer.name, layer.name));
            const row = document.createElement("div");
            row.className = "row";
            for (const kind of <const>["visible", "locked"]) {
                const label = document.createElement("label");
                const input = document.createElement("input");
                input.type = "checkbox";
                input.checked = layer[kind];
                input.setAttribute("aria-label", `${layer.name} ${kind}`);
                input.addEventListener("change", () => {
                    this.act(() => {
                        this.scene.setLayer({layer: {
                            name: layer.name, visible: kind === "visible" ? input.checked : layer.visible,
                            locked: kind === "locked" ? input.checked : layer.locked}});
                    });
                });
                label.append(input, document.createTextNode(kind === "visible" ? layer.name : "Lock"));
                row.append(label);
            }
            layers.append(row);
        });
        if (this.scene.getLayers().some((layer) => layer.name === previous)) {
            this.targetLayer.value = previous;
        }
    }

    private appendEntities(entities : readonly IEntity[], parent : string | null, depth : number) : void {
        for (const entity of entities.filter((item) => item.parentId === parent)) {
            const label = `${"— ".repeat(depth)}${entity.name} (${entity.type}) · ${entity.layer}`;
            this.list.add(new Option(label, entity.id));
            this.appendEntities(entities, entity.id, depth + 1);
        }
    }

    private act(action : IDemoAction) : void {
        try {
            action(); this.refresh();
        } catch (error : unknown) {
            this.status.textContent = String(error);
        }
    }

    private number(id : string) : number {
        const value = Number(DemoElements.getElement(id, HTMLInputElement).value);
        if (!Number.isFinite(value)) {
            throw new Error("Enter a finite number.");
        }
        return value;
    }

    private activateTransform(mode : TransformMode) : void {
        if (this.scene.getSelection().length === 0) {
            return;
        }
        if (mode !== TransformMode.MOVE && this.selectedGrip !== undefined) {
            this.status.textContent = "Select the object to rotate or scale it; a single grip supports movement.";
            return;
        }
        this.drawing?.Cancel(); delete this.drawing; this.cancelDrag?.();
        this.tool.value = mode; this.cancelMove();
    }

    private cancelMove() : void {
        this.move?.Cancel(); delete this.move;
        if (this.movePointer !== undefined && this.canvas.hasPointerCapture(this.movePointer)) {
            this.canvas.releasePointerCapture(this.movePointer);
        }
        delete this.movePointer;
        this.refresh();
    }

    private finishDrawing() : void {
        this.act(() => {
            this.drawing?.Finish(); delete this.drawing;
        });
    }
}

new EditorDemo();
