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
    BoxGeometry, BufferGeometry, Color, DirectionalLight, EdgesGeometry, Float32BufferAttribute, Group, HemisphereLight,
    LineBasicMaterial, LineSegments, Mesh, MeshLambertMaterial, PerspectiveCamera, Points, PointsMaterial, Raycaster,
    Scene, Vector2, Vector3, WebGLRenderer, type Intersection
} from "three";
import type { IVector3, LocalOrigin } from "../core/LocalOrigin.js";
import { NavigationPreset } from "../core/NavigationPreset.js";
import { AxisTriad } from "./AxisTriad.js";
import { disposeTree } from "./DisposeTree.js";
import { createGrid } from "./Grid.js";
import type { IGridOptions } from "./IGridOptions.js";
import { PointerNavigation } from "./PointerNavigation.js";
import { ViewCamera } from "./ViewCamera.js";

export interface IViewportOptions {
    readonly canvas : HTMLCanvasElement;
    readonly origin : LocalOrigin;
    readonly background? : string;
    readonly preserveDrawingBuffer? : boolean;
    /** Fusion 360 by default; null turns navigation off. */
    readonly navigation? : NavigationPreset | null;
    readonly axisTriad? : boolean;
}

export interface IBoxOptions {
    readonly centre : IVector3;
    readonly size : number;
    readonly colour : string;
}

const EDGE_SHADE : number = 0.5;

function createPivotMarker() : Points {
    const geometry : BufferGeometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0], 3));
    const marker : Points = new Points(geometry, new PointsMaterial({
        color: "#ffffff",
        size: 7,
        sizeAttenuation: false,
        depthTest: false
    }));
    marker.renderOrder = 1;
    marker.visible = false;
    return marker;
}

export class Viewport {
    private readonly origin : LocalOrigin;
    private readonly renderer : WebGLRenderer;
    private readonly scene : Scene = new Scene();
    private readonly content : Group = new Group();
    private readonly view : ViewCamera = new ViewCamera(new PerspectiveCamera(45, 1, 0.1, 10000));
    private readonly raycaster : Raycaster = new Raycaster();
    private readonly pivot : Points = createPivotMarker();
    private readonly triad : AxisTriad | null;
    private navigation : PointerNavigation | null = null;
    private grid : LineSegments | null = null;
    private frame : number | null = null;

    constructor(options : IViewportOptions) {
        this.origin = options.origin;
        this.renderer = new WebGLRenderer({
            canvas: options.canvas,
            antialias: true,
            preserveDrawingBuffer: options.preserveDrawingBuffer ?? false
        });
        // Cleared by hand; the axis triad draws over the frame.
        this.renderer.autoClear = false;
        this.renderer.setClearColor(new Color(options.background ?? "#202124"));

        const sky : HemisphereLight = new HemisphereLight("#ffffff", "#5f6368", 1.5);
        sky.position.set(0, 0, 1);
        const sun : DirectionalLight = new DirectionalLight("#ffffff", 1.8);
        sun.position.set(-1, -2, 4);
        this.scene.add(sky, sun, this.content, this.pivot);

        this.triad = options.axisTriad === true ? new AxisTriad() : null;
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
        if (this.navigation !== null) {
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
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1
        }));
        box.add(new LineSegments(
            new EdgesGeometry(geometry),
            new LineBasicMaterial({color: colour.clone().multiplyScalar(EDGE_SHADE)})
        ));
        box.position.set(local.x, local.y, local.z);
        this.content.add(box);
        this.Invalidate();
    }

    // Replaces the previous grid.
    public ShowGrid(options : IGridOptions) : void {
        if (this.grid !== null) {
            this.scene.remove(this.grid);
            disposeTree(this.grid);
        }
        const local : IVector3 = this.origin.ToLocal(options.centre);
        this.grid = createGrid(options);
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
        this.renderer.setPixelRatio(globalThis.devicePixelRatio || 1);
        this.renderer.setSize(width, height, false);
        this.view.camera.aspect = height > 0 ? width / height : 1;
        this.view.camera.updateProjectionMatrix();
        this.Invalidate();
    }

    public Invalidate() : void {
        this.frame ??= requestAnimationFrame(() => {
            this.frame = null;
            this.Render();
        });
    }

    public Render() : void {
        if (this.frame !== null) {
            cancelAnimationFrame(this.frame);
            this.frame = null;
        }
        this.renderer.clear();
        this.renderer.render(this.scene, this.view.camera);
        if (this.triad !== null) {
            const size : Vector2 = this.renderer.getSize(new Vector2());
            this.triad.Render(this.renderer, this.view.camera, size.x, size.y);
        }
    }

    public Dispose() : void {
        this.navigation?.Dispose();
        if (this.frame !== null) {
            cancelAnimationFrame(this.frame);
            this.frame = null;
        }
        this.triad?.Dispose();
        disposeTree(this.scene);
        this.scene.clear();
        this.renderer.dispose();
        this.renderer.forceContextLoss();
    }

    private pick(ndc : Vector2) : Vector3 | null {
        this.raycaster.setFromCamera(ndc, this.view.camera);
        // Edges are lines with a wide hit tolerance; only faces count.
        const hit : Intersection | undefined = this.raycaster.intersectObject(this.content, true)
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
