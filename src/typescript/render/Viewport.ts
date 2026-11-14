/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { AxisConstraint } from "../core/AxisConstraint.js";
import {
    BoxGeometry, BufferGeometry, Color, DirectionalLight, EdgesGeometry, Float32BufferAttribute, Group,
    HemisphereLight, LineBasicMaterial, LineSegments, Mesh, MeshLambertMaterial, PerspectiveCamera, Points,
    PointsMaterial, Raycaster, Scene, Vector2, Vector3, WebGLRenderer
} from "three";
import { LocalOrigin } from "../core/LocalOrigin.js";
import { NavigationPreset } from "../core/NavigationPreset.js";
import { NavigationCube } from "./NavigationCube.js";
import { AxisTriad } from "./AxisTriad.js";
import { DrawingGeometry } from "./DrawingGeometry.js";
import { DisposeTree } from "./DisposeTree.js";
import { Grid } from "./Grid.js";
import { PointerNavigation } from "./PointerNavigation.js";
import { ViewCamera } from "./ViewCamera.js";
import { WorkingPlane } from "../core/WorkingPlane.js";
import { EntityTransforms } from "../core/entities/EntityTransform.js";

import type { Intersection } from "three";
import type { IDrawing } from "../core/IDrawing.js";
import type { ICameraState } from "../core/ICameraState.js";
import type { IVector3 } from "../core/LocalOrigin.js";
import type { NavigationCubeTheme } from "./NavigationCubeTheme.js";
import type { IGridOptions } from "./IGridOptions.js";

export interface IEntityPick {
    readonly faceId? : string;
    readonly id : string;
    readonly position : IVector3;
    readonly distance : number;
}

export interface ICameraChangedHandler {
    (state : ICameraState) : void;
}

export interface IViewportOptions {
    readonly canvas : HTMLCanvasElement;
    readonly origin : LocalOrigin;
    readonly background? : string;
    readonly transparent? : boolean;
    readonly OnCameraChanged? : ICameraChangedHandler;
    readonly preserveDrawingBuffer? : boolean;
    /** Fusion 360 by default; null turns navigation off. */
    readonly navigation? : NavigationPreset | null;
    readonly axisTriad? : boolean;
    readonly navigationCube? : boolean;
    readonly navigationCubeTheme? : NavigationCubeTheme;
}

export interface IBoxOptions {
    readonly centre : IVector3;
    readonly size : number;
    readonly colour : string;
}

export class Viewport {
    private static readonly POSITION_COMPONENTS : number = 3;
    private static readonly SUN_Y : number = -2;
    private static readonly SUN_Z : number = 4;
    private static readonly DEGREES_PER_TURN : number = 360;
    private static readonly DEGREES_PER_HALF_TURN : number = 180;
    private static readonly DEFAULT_VERTICAL_FOV : number = 45;
    private static readonly DEFAULT_ASPECT : number = 1;
    private static readonly INITIAL_NEAR_DISTANCE : number = 0.1;
    private static readonly INITIAL_FAR_DISTANCE : number = 10000;
    private static readonly PIVOT_SIZE_PIXELS : number = 7;
    private static readonly SKY_INTENSITY : number = 1.5;
    private static readonly SUN_INTENSITY : number = 1.8;
    private static readonly PICK_TOLERANCE_SCALE : number = 6;
    private static readonly DEFAULT_PIXEL_RATIO : number = 1;
    private static readonly POLYGON_OFFSET_FACTOR : number = 1;
    private static readonly POLYGON_OFFSET_UNITS : number = 1;
    private static readonly EDGE_SHADE : number = 0.5;
    private readonly origin : LocalOrigin;
    private readonly onCameraChanged? : ICameraChangedHandler;
    private readonly renderer : WebGLRenderer;
    private readonly scene : Scene = new Scene();
    private readonly content : Group = new Group();
    private readonly view : ViewCamera = new ViewCamera(new PerspectiveCamera(
        Viewport.DEFAULT_VERTICAL_FOV, Viewport.DEFAULT_ASPECT,
        Viewport.INITIAL_NEAR_DISTANCE, Viewport.INITIAL_FAR_DISTANCE));
    private readonly raycaster : Raycaster = new Raycaster();
    private readonly pivot : Points = Viewport.createPivotMarker();
    private readonly triad? : AxisTriad;
    private readonly navigationCube? : NavigationCube;
    private navigation? : PointerNavigation;
    private grid? : LineSegments;
    private drawing : Group = new Group();
    private frame? : number;
    private disposed : boolean = false;

    private static createPivotMarker() : Points {
        const geometry : BufferGeometry = new BufferGeometry();
        geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0], Viewport.POSITION_COMPONENTS));
        const marker : Points = new Points(geometry, new PointsMaterial({
            color: "#ffffff",
            size: Viewport.PIVOT_SIZE_PIXELS,
            sizeAttenuation: false,
            depthTest: false
        }));
        marker.renderOrder = 1;
        marker.visible = false;
        return marker;
    }

    constructor(options : IViewportOptions) {
        this.origin = options.origin;
        if (options.OnCameraChanged !== undefined) {
            this.onCameraChanged = options.OnCameraChanged;
        }
        this.renderer = new WebGLRenderer({
            canvas: options.canvas,
            antialias: true,
            alpha: options.transparent ?? false,
            preserveDrawingBuffer: options.preserveDrawingBuffer ?? false
        });
        // Cleared by hand; the axis triad draws over the frame.
        this.renderer.autoClear = false;
        this.renderer.setClearColor(new Color(options.background ?? "#202124"), options.transparent === true ? 0 : 1);

        const sky : HemisphereLight = new HemisphereLight("#ffffff", "#5f6368", Viewport.SKY_INTENSITY);
        sky.position.set(0, 0, 1);
        const sun : DirectionalLight = new DirectionalLight("#ffffff", Viewport.SUN_INTENSITY);
        sun.position.set(-1, Viewport.SUN_Y, Viewport.SUN_Z);
        this.scene.add(sky, sun, this.content, this.pivot, this.drawing);

        if (options.axisTriad === true) {
            this.triad = new AxisTriad();
        }
        if (options.navigationCube === true) {
            this.navigationCube = new NavigationCube(options.canvas, (direction) => {
                this.view.setDirection(direction);
                this.Invalidate();
            }, () => {
                this.Invalidate();
            }, options.navigationCubeTheme);
        }
        const preset : NavigationPreset | null = options.navigation === undefined ?
            NavigationPreset.Default() :
            options.navigation;
        if (preset !== null) {
            this.setNavigation(preset);
        }
        const canvas : HTMLCanvasElement = options.canvas;
        this.Resize(canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height);
    }

    public setNavigation(preset : NavigationPreset) : void {
        if (this.navigation !== undefined) {
            this.navigation.setPreset(preset);
            return;
        }
        this.navigation = new PointerNavigation(this.renderer.domElement, this.view, preset, {
            Pick: (ndc) => this.pick(ndc),
            Changed: () => {
                this.Invalidate();
            },
            ShowPivot: (pivot) => {
                this.showPivot(pivot);
            }
        });
    }

    public AddBox(options : IBoxOptions) : void {
        const local : IVector3 = this.origin.ToLocal(options.centre);
        const colour : Color = new Color(options.colour);
        const geometry : BoxGeometry = new BoxGeometry(options.size, options.size, options.size);
        // Pushed back in depth, so the edges stay on top.
        const box : Mesh = new Mesh(geometry, new MeshLambertMaterial({
            color: colour,
            polygonOffset: true,
            polygonOffsetFactor: Viewport.POLYGON_OFFSET_FACTOR,
            polygonOffsetUnits: Viewport.POLYGON_OFFSET_UNITS
        }));
        box.add(new LineSegments(
            new EdgesGeometry(geometry),
            new LineBasicMaterial({color: colour.clone().multiplyScalar(Viewport.EDGE_SHADE)})
        ));
        box.position.set(local.x, local.y, local.z);
        this.content.add(box);
        this.Invalidate();
    }

    public setBackground(colour : string) : void {
        this.renderer.setClearColor(new Color(colour), this.renderer.getClearAlpha());
        this.Invalidate();
    }

    public setNavigationCubeTheme(theme : NavigationCubeTheme) : void {
        this.navigationCube?.setTheme(theme);
    }

    public setModelsVisible(visible : boolean) : void {
        this.content.visible = visible;
        this.Invalidate();
    }

    public setDrawing(drawing : IDrawing) : void {
        const first : IVector3 | undefined = drawing.paths[0]?.points[0] ??
            drawing.meshes?.[0]?.vertices[0] ?? drawing.labels?.[0]?.position;
        const origin : LocalOrigin = first === undefined ? this.origin : new LocalOrigin(first);
        const replacement : Group = DrawingGeometry.Create(drawing, origin);
        const offset : IVector3 = this.origin.ToLocal(origin);
        replacement.position.set(offset.x, offset.y, offset.z);
        this.scene.remove(this.drawing);
        DisposeTree.Dispose(this.drawing);
        this.drawing = replacement;
        this.scene.add(replacement);
        this.Invalidate();
    }

    // Client coordinates, or null outside the camera depth range.
    public ProjectPoint(point : IVector3) : IVector3 | null {
        const local = this.origin.ToLocal(point);
        const projected = new Vector3(local.x, local.y, local.z).project(this.view.camera);
        if (!Number.isFinite(projected.x) || projected.z < -1 || projected.z > 1) {
            return null;
        }
        const bounds = this.renderer.domElement.getBoundingClientRect();
        return {x: bounds.left + (((projected.x + 1) * bounds.width) / 2),
            y: bounds.top + (((1 - projected.y) * bounds.height) / 2), z: projected.z};
    }

    public PickEntity(clientX : number, clientY : number) : IEntityPick | null {
        const bounds = this.renderer.domElement.getBoundingClientRect();
        if (bounds.width === 0 || bounds.height === 0) {
            return null;
        }
        this.raycaster.setFromCamera(new Vector2(((2 * (clientX - bounds.left)) / bounds.width) - 1,
            1 - ((2 * (clientY - bounds.top)) / bounds.height)), this.view.camera);
        const distance = this.view.camera.position.distanceTo(this.view.getTarget());
        const tolerance = (Viewport.PICK_TOLERANCE_SCALE * distance *
            Math.tan((this.view.camera.fov * Math.PI) / Viewport.DEGREES_PER_TURN)) / bounds.height;
        this.raycaster.params.Line.threshold = tolerance;
        this.raycaster.params.Points.threshold = tolerance;
        this.drawing.updateMatrixWorld(true);
        for (const hit of this.raycaster.intersectObject(this.drawing, true)) {
            const id : unknown = hit.object.userData["entityId"];
            if (typeof id === "string") {
                const faces : unknown = hit.object.userData["triangleFaces"];
                const face : unknown = Array.isArray(faces) && hit.faceIndex !== undefined && hit.faceIndex !== null ?
                    faces[hit.faceIndex] : undefined;
                return {id, position: this.origin.ToWorld(hit.point), distance: hit.distance,
                    ...(typeof face === "string" ? {faceId: face} : {})};
            }
        }
        return null;
    }

    public PickAxis(clientX : number, clientY : number, pivot : IVector3, axis : IVector3) : number | null {
        const bounds = this.renderer.domElement.getBoundingClientRect();
        if (bounds.width === 0 || bounds.height === 0) {
            return null;
        }
        const ray = this.view.getRay(new Vector2(
            ((2 * (clientX - bounds.left)) / bounds.width) - 1,
            1 - ((2 * (clientY - bounds.top)) / bounds.height)));
        return AxisConstraint.AxisRayParameter(this.origin.ToWorld(ray.origin), ray.direction, pivot, axis);
    }

    public PickPlane(clientX : number, clientY : number, height : number) : IVector3 | null {
        return this.PickWorkingPlane(clientX, clientY,
            new WorkingPlane(EntityTransforms.Translation({x: 0, y: 0, z: height})));
    }

    public PickWorkingPlane(clientX : number, clientY : number, plane : WorkingPlane) : IVector3 | null {
        const bounds : DOMRect = this.renderer.domElement.getBoundingClientRect();
        if (bounds.width === 0 || bounds.height === 0) {
            return null;
        }
        const ray = this.view.getRay(new Vector2(
            ((2 * (clientX - bounds.left)) / bounds.width) - 1,
            1 - ((2 * (clientY - bounds.top)) / bounds.height)
        ));
        return plane.Intersect(this.origin.ToWorld(ray.origin), ray.direction);
    }

    // Replaces the previous grid.
    public ShowGrid(options : IGridOptions) : void {
        if (this.grid !== undefined) {
            this.scene.remove(this.grid);
            DisposeTree.Dispose(this.grid);
        }
        const local : IVector3 = this.origin.ToLocal(options.centre);
        this.grid = Grid.Create(options);
        this.grid.position.set(local.x, local.y, local.z);
        this.scene.add(this.grid);
        this.Invalidate();
    }

    public LookAt(target : IVector3, distance : number) : void {
        const local : IVector3 = this.origin.ToLocal(target);
        this.view.LookAt(new Vector3(local.x, local.y, local.z), distance);
        this.Invalidate();
    }

    public Resize(width : number, height : number) : void {
        this.renderer.setPixelRatio(globalThis.devicePixelRatio || Viewport.DEFAULT_PIXEL_RATIO);
        this.renderer.setSize(width, height, false);
        this.view.camera.aspect = height > 0 ? width / height : Viewport.DEFAULT_ASPECT;
        this.view.camera.updateProjectionMatrix();
        this.Invalidate();
    }

    public Invalidate() : void {
        if (this.disposed) {
            return;
        }
        this.frame ??= requestAnimationFrame(() => {
            delete this.frame;
            this.Render();
        });
    }

    public Render() : void {
        if (this.disposed) {
            return;
        }
        if (this.frame !== undefined) {
            cancelAnimationFrame(this.frame);
            delete this.frame;
        }
        this.onCameraChanged?.({
            position: this.origin.ToWorld(this.view.camera.position),
            target: this.origin.ToWorld(this.view.getTarget()),
            up: {x: this.view.camera.up.x, y: this.view.camera.up.y, z: this.view.camera.up.z},
            verticalFov: (this.view.camera.fov * Math.PI) / Viewport.DEGREES_PER_HALF_TURN,
            aspect: this.view.camera.aspect,
            near: this.view.camera.near,
            far: this.view.camera.far
        });
        this.renderer.clear();
        this.renderer.render(this.scene, this.view.camera);
        if (this.triad !== undefined) {
            const size : Vector2 = this.renderer.getSize(new Vector2());
            this.triad.Render(this.renderer, this.view.camera, size.x, size.y);
        }
        const size : Vector2 = this.renderer.getSize(new Vector2());
        this.navigationCube?.Render(this.renderer, this.view.camera, size.x, size.y);
    }

    public Dispose() : void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.navigation?.Dispose();
        if (this.frame !== undefined) {
            cancelAnimationFrame(this.frame);
            delete this.frame;
        }
        this.navigationCube?.Dispose();
        this.triad?.Dispose();
        DisposeTree.Dispose(this.scene);
        this.scene.clear();
        this.renderer.dispose();
        this.renderer.forceContextLoss();
    }

    private pick(ndc : Vector2) : Vector3 | null {
        this.raycaster.setFromCamera(ndc, this.view.camera);
        this.scene.updateMatrixWorld(true);
        // Edges are lines with a wide hit tolerance; only faces count.
        const objects = this.content.visible ? [this.content, this.drawing] : [this.drawing];
        const hit : Intersection | undefined = this.raycaster.intersectObjects(objects, true)
            .find((intersection) => intersection.object instanceof Mesh);
        return hit === undefined ? null : hit.point.clone();
    }

    private showPivot(pivot : Vector3 | null) : void {
        this.pivot.visible = pivot !== null;
        if (pivot !== null) {
            this.pivot.position.copy(pivot);
        }
    }
}
