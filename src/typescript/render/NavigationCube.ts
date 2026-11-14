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
    CanvasTexture, Group, Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Raycaster, Scene,
    SRGBColorSpace, Vector2, Vector3
} from "three";
import { AxisColours } from "./AxisColours.js";
import { DisposeTree } from "./DisposeTree.js";
import { NavigationCubeTheme } from "./NavigationCubeTheme.js";
import { NavigationView } from "./NavigationView.js";

import type { Camera, Intersection, WebGLRenderer } from "three";

interface ICubeSide {
    readonly view : NavigationView;
    readonly normal : Vector3;
    readonly up : Vector3;
    readonly colour : string;
}

interface ICubeFace {
    readonly side : ICubeSide;
    readonly mesh : Mesh<PlaneGeometry, MeshBasicMaterial>;
    readonly context : CanvasRenderingContext2D;
    readonly texture : CanvasTexture;
}

export interface ICubeOrientationHandler {
    (direction : Vector3) : void;
}

export interface ICubeInvalidationHandler {
    () : void;
}

export class NavigationCube {
    private static readonly BORDER_EXTENT : number = 254;
    private static readonly ACCENT_X : number = 92;
    private static readonly ACCENT_Y : number = 57;
    private static readonly ACCENT_WIDTH : number = 72;
    private static readonly ACCENT_HEIGHT : number = 8;
    private static readonly LABEL_Y : number = 138;
    private static readonly DIRECTION_REGION_THRESHOLD : number = 0.32;
    private static readonly REGION_CENTRE_OFFSET : number = 0.41;
    private static readonly FACE_HALF_SIZE : number = 0.5;
    private static readonly HIGHLIGHT_CENTRE_TOLERANCE : number = 0.1;
    private static readonly HIGHLIGHT_CENTRE_WIDTH : number = 0.64;
    private static readonly HIGHLIGHT_EDGE_WIDTH : number = 0.18;
    private static readonly CLICK_DISTANCE_PIXELS : number = 4;
    private static readonly VIEW_DIRECTION_TOLERANCE : number = 1e-6;
    private static readonly CAMERA_EXTENT : number = 1.05;
    private static readonly CAMERA_NEAR : number = 0.1;
    private static readonly CAMERA_FAR : number = 10;
    private static readonly CAMERA_DISTANCE : number = 4;
    private static readonly TEXTURE_SIZE : number = 256;
    private static readonly TEXTURE_CENTRE : number = 128;
    private static readonly SIZE : number = 144;
    private static readonly MARGIN : number = 12;
    private static readonly SIDES : readonly ICubeSide[] = [
        {view: NavigationView.RIGHT, normal: new Vector3(1, 0, 0),
            up: new Vector3(0, 0, 1), colour: AxisColours.VALUES.x},
        {view: NavigationView.LEFT, normal: new Vector3(-1, 0, 0),
            up: new Vector3(0, 0, 1), colour: AxisColours.VALUES.x},
        {view: NavigationView.BACK, normal: new Vector3(0, 1, 0),
            up: new Vector3(0, 0, 1), colour: AxisColours.VALUES.y},
        {view: NavigationView.FRONT, normal: new Vector3(0, -1, 0),
            up: new Vector3(0, 0, 1), colour: AxisColours.VALUES.y},
        {view: NavigationView.TOP, normal: new Vector3(0, 0, 1),
            up: new Vector3(0, 1, 0), colour: AxisColours.VALUES.z},
        {view: NavigationView.BOTTOM, normal: new Vector3(0, 0, -1),
            up: new Vector3(0, 1, 0), colour: AxisColours.VALUES.z}
    ];
    private readonly canvas : HTMLCanvasElement;
    private readonly orient : ICubeOrientationHandler;
    private readonly invalidate : ICubeInvalidationHandler;
    private readonly scene : Scene = new Scene();
    private readonly cube : Group = new Group();
    private readonly camera : OrthographicCamera = new OrthographicCamera(
        -NavigationCube.CAMERA_EXTENT, NavigationCube.CAMERA_EXTENT,
        NavigationCube.CAMERA_EXTENT, -NavigationCube.CAMERA_EXTENT,
        NavigationCube.CAMERA_NEAR, NavigationCube.CAMERA_FAR);
    private readonly raycaster : Raycaster = new Raycaster();
    private readonly element : HTMLDivElement = document.createElement("div");
    private readonly select : HTMLSelectElement = document.createElement("select");
    private readonly listeners : AbortController = new AbortController();
    private readonly faces : ICubeFace[] = [];
    private theme : NavigationCubeTheme;
    private hoverDirection? : Vector3;
    private down? : Vector2;

    // Identifies a face, an edge on two faces, or a corner on three faces.
    public static Direction(point : Vector3) : Vector3 {
        return new Vector3(
            Math.abs(point.x) > NavigationCube.DIRECTION_REGION_THRESHOLD ? Math.sign(point.x) : 0,
            Math.abs(point.y) > NavigationCube.DIRECTION_REGION_THRESHOLD ? Math.sign(point.y) : 0,
            Math.abs(point.z) > NavigationCube.DIRECTION_REGION_THRESHOLD ? Math.sign(point.z) : 0
        );
    }

    public static FaceRegion(direction : Vector3, normal : Vector3) : Vector3 | null {
        if (direction.dot(normal) <= 0) {
            return null;
        }
        const point : Vector3 = direction.clone().multiplyScalar(NavigationCube.REGION_CENTRE_OFFSET);
        return point.addScaledVector(normal, NavigationCube.FACE_HALF_SIZE - point.dot(normal));
    }

    private static createSide(side : ICubeSide) : ICubeFace {
        const canvas : HTMLCanvasElement = document.createElement("canvas");
        canvas.width = NavigationCube.TEXTURE_SIZE;
        canvas.height = NavigationCube.TEXTURE_SIZE;
        const context = canvas.getContext("2d");
        if (context === null) {
            throw new Error("Navigation cube requires a 2D canvas context.");
        }
        const texture = new CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        const face = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({map: texture, toneMapped: false}));
        face.name = side.view;
        face.position.copy(side.normal).multiplyScalar(NavigationCube.FACE_HALF_SIZE);
        face.up.copy(side.up);
        face.lookAt(side.normal);
        return {side, mesh: face, context, texture};
    }

    private static paintSide(face : ICubeFace, theme : NavigationCubeTheme, direction : Vector3 | null) : void {
        const context = face.context;
        const side = face.side;
        const mesh = face.mesh;
        const texture = face.texture;
        const dark : boolean = theme === NavigationCubeTheme.DARK;
        const shades : readonly string[] = dark ? ["#27313d", "#323e4c", "#404d5d"] :
            ["#d8e0e8", "#e8eef4", "#f7f9fc"];
        context.fillStyle = shades[side.normal.x !== 0 ? 0 : side.normal.y !== 0 ? 1 : 2] ?? "#e8eef4";
        context.fillRect(0, 0, NavigationCube.TEXTURE_SIZE, NavigationCube.TEXTURE_SIZE);
        const region : Vector3 | null = direction === null ? null : NavigationCube.FaceRegion(direction, side.normal);
        if (region !== null) {
            const local : Vector3 = mesh.worldToLocal(region);
            const x : number = Math.abs(local.x) < NavigationCube.HIGHLIGHT_CENTRE_TOLERANCE ? 0 : Math.sign(local.x);
            const y : number = Math.abs(local.y) < NavigationCube.HIGHLIGHT_CENTRE_TOLERANCE ? 0 : Math.sign(local.y);
            const width : number = (x === 0 ? NavigationCube.HIGHLIGHT_CENTRE_WIDTH :
                NavigationCube.HIGHLIGHT_EDGE_WIDTH) * NavigationCube.TEXTURE_SIZE;
            const height : number = (y === 0 ? NavigationCube.HIGHLIGHT_CENTRE_WIDTH :
                NavigationCube.HIGHLIGHT_EDGE_WIDTH) * NavigationCube.TEXTURE_SIZE;
            context.fillStyle = dark ? "#236db5" : "#a9d4ff";
            const offsetX = x * NavigationCube.REGION_CENTRE_OFFSET * NavigationCube.TEXTURE_SIZE;
            const offsetY = y * NavigationCube.REGION_CENTRE_OFFSET * NavigationCube.TEXTURE_SIZE;
            context.fillRect(NavigationCube.TEXTURE_CENTRE + offsetX - (width / 2),
                NavigationCube.TEXTURE_CENTRE - offsetY - (height / 2), width, height);
        }
        context.strokeStyle = dark ? "#647487" : "#9daebb";
        context.lineWidth = 2;
        context.strokeRect(1, 1, NavigationCube.BORDER_EXTENT, NavigationCube.BORDER_EXTENT);
        context.fillStyle = side.colour;
        context.fillRect(NavigationCube.ACCENT_X, NavigationCube.ACCENT_Y,
            NavigationCube.ACCENT_WIDTH, NavigationCube.ACCENT_HEIGHT);
        context.fillStyle = dark ? "#f0f5fc" : "#233447";
        context.font = "600 44px system-ui, sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(side.view, NavigationCube.TEXTURE_CENTRE, NavigationCube.LABEL_Y);
        texture.needsUpdate = true;
    }

    constructor(canvas : HTMLCanvasElement, orient : ICubeOrientationHandler,
        invalidate : ICubeInvalidationHandler, theme : NavigationCubeTheme = NavigationCubeTheme.LIGHT) {
        this.canvas = canvas;
        this.orient = orient;
        this.invalidate = invalidate;
        this.theme = theme;
        this.scene.add(this.cube);
        NavigationCube.SIDES.forEach((side) => {
            const face : ICubeFace = NavigationCube.createSide(side);
            this.faces.push(face);
            this.cube.add(face.mesh);
        });
        this.cube.updateMatrixWorld(true);
        this.element.className = "oidshaper-navigation-cube";
        this.element.setAttribute("aria-label", "Navigation cube");
        this.element.style.cssText = `position:fixed;width:${String(NavigationCube.SIZE)}px;` +
            `height:${String(NavigationCube.SIZE)}px;` +
            "z-index:10;touch-action:none;cursor:pointer;";
        this.select.setAttribute("aria-label", "View direction");
        this.select.style.cssText = "position:absolute;top:100%;width:100%;padding:5px;border:1px solid #b8c4d0;" +
            "border-radius:6px;background:#f8fafcee;color:#263646;font:12px system-ui;cursor:pointer;";
        const custom : HTMLOptionElement = new Option("Custom view", NavigationView.CUSTOM);
        custom.disabled = true;
        this.select.add(custom);
        this.select.add(new Option("Isometric", NavigationView.ISO));
        NavigationCube.SIDES.forEach((side) => {
            this.select.add(new Option(side.view, side.view));
        });
        this.setTheme(theme);
        this.element.appendChild(this.select);
        canvas.parentElement?.appendChild(this.element);
        const options : AddEventListenerOptions = {signal: this.listeners.signal};
        this.select.addEventListener("change", () => {
            this.orient(NavigationCube.SIDES.find((side) => side.view === this.select.value)?.normal ??
                new Vector3(-1, -1, 1));
        }, options);
        this.element.addEventListener("pointerdown", (event) => {
            event.stopPropagation();
            if (event.target === this.element && event.button === 0) {
                this.down = new Vector2(event.clientX, event.clientY);
                this.element.setPointerCapture(event.pointerId);
            }
        }, options);
        this.element.addEventListener("pointerup", (event) => {
            event.stopPropagation();
            if (this.down !== undefined &&
                this.down.distanceTo(new Vector2(event.clientX, event.clientY)) <
                NavigationCube.CLICK_DISTANCE_PIXELS) {
                const hit = this.hit(event);
                if (hit !== undefined) {
                    const direction : Vector3 = NavigationCube.Direction(hit.point);
                    this.orient(direction);
                    this.select.value = NavigationCube.SIDES.find((side) => side.normal.equals(direction))?.view ??
                        NavigationView.CUSTOM;
                }
            }
            delete this.down;
        }, options);
        this.element.addEventListener("pointercancel", () => {
            delete this.down;
        }, options);
        this.element.addEventListener("pointermove", (event) => {
            const hit = event.target === this.element ? this.hit(event) : undefined;
            const direction : Vector3 | null = hit === undefined ? null : NavigationCube.Direction(hit.point);
            const changed : boolean = direction === null ? this.hoverDirection !== undefined :
                !direction.equals(this.hoverDirection ?? new Vector3());
            if (changed) {
                if (direction === null) {
                    delete this.hoverDirection;
                } else {
                    this.hoverDirection = direction;
                }
                this.repaint();
                this.element.title = direction === null ? "Choose a face, edge or corner" : NavigationCube.SIDES
                    .filter((side) => direction.dot(side.normal) > 0).map((side) => side.view).join(" / ");
                this.invalidate();
            }
        }, options);
        this.element.addEventListener("pointerleave", () => {
            delete this.hoverDirection;
            this.repaint();
            this.invalidate();
        }, options);
        window.addEventListener("scroll", () => {
            this.Position();
        }, {...options, capture: true});
        this.Position();
    }

    public setTheme(theme : NavigationCubeTheme) : void {
        this.theme = theme;
        this.select.style.background = theme === NavigationCubeTheme.DARK ? "#27313d" : "#f7f9fc";
        this.select.style.color = theme === NavigationCubeTheme.DARK ? "#f0f5fc" : "#233447";
        this.select.style.borderColor = theme === NavigationCubeTheme.DARK ? "#647487" : "#9daebb";
        this.select.style.colorScheme = theme;
        this.repaint();
        this.invalidate();
    }

    public Position() : void {
        const bounds = this.canvas.getBoundingClientRect();
        this.element.style.left = `${String(bounds.right - NavigationCube.SIZE - NavigationCube.MARGIN)}px`;
        this.element.style.top = `${String(bounds.top + NavigationCube.MARGIN)}px`;
    }

    public Render(renderer : WebGLRenderer, view : Camera, width : number, height : number) : void {
        this.Position();
        this.camera.quaternion.copy(view.quaternion);
        this.camera.position.set(0, 0, NavigationCube.CAMERA_DISTANCE).applyQuaternion(view.quaternion);
        this.camera.updateMatrixWorld();
        const normal : Vector3 = this.camera.position.clone().normalize();
        this.select.value = NavigationCube.SIDES.find((side) =>
            side.normal.distanceTo(normal) < NavigationCube.VIEW_DIRECTION_TOLERANCE)?.view ??
            (normal.distanceTo(new Vector3(-1, -1, 1).normalize()) < NavigationCube.VIEW_DIRECTION_TOLERANCE ?
                NavigationView.ISO : NavigationView.CUSTOM);
        renderer.setScissorTest(true);
        renderer.setScissor(width - NavigationCube.SIZE - NavigationCube.MARGIN,
            height - NavigationCube.SIZE - NavigationCube.MARGIN, NavigationCube.SIZE, NavigationCube.SIZE);
        renderer.setViewport(width - NavigationCube.SIZE - NavigationCube.MARGIN,
            height - NavigationCube.SIZE - NavigationCube.MARGIN, NavigationCube.SIZE, NavigationCube.SIZE);
        renderer.clearDepth();
        renderer.render(this.scene, this.camera);
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, width, height);
    }

    public Dispose() : void {
        this.listeners.abort();
        this.element.remove();
        DisposeTree.Dispose(this.scene);
    }

    private repaint() : void {
        this.faces.forEach((face) => {
            NavigationCube.paintSide(face, this.theme, this.hoverDirection ?? null);
        });
    }

    private hit(event : PointerEvent) : Intersection | undefined {
        const bounds = this.element.getBoundingClientRect();
        this.raycaster.setFromCamera(new Vector2(
            (2 * (event.clientX - bounds.left) / NavigationCube.SIZE) - 1,
            1 - (2 * (event.clientY - bounds.top) / NavigationCube.SIZE)
        ), this.camera);
        return this.raycaster.intersectObject(this.cube, true)[0];
    }
}
