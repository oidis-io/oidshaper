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
    CanvasTexture, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, OrthographicCamera, Scene,
    Sprite, SpriteMaterial, SRGBColorSpace, Vector3
} from "three";
import { AxisColours } from "./AxisColours.js";
import { DisposeTree } from "./DisposeTree.js";

import type { Camera, WebGLRenderer } from "three";

interface IAxis {
    readonly direction : Vector3;
    readonly colour : string;
    readonly label : string;
}

export class AxisTriad {
    private static readonly CAMERA_EXTENT : number = 1.45;
    private static readonly CAMERA_NEAR : number = 0.1;
    private static readonly CAMERA_FAR : number = 10;
    private static readonly CAMERA_DISTANCE : number = 4;
    private static readonly SHAFT_RADIUS : number = 0.035;
    private static readonly SHAFT_LENGTH : number = 0.8;
    private static readonly SHAFT_SEGMENTS : number = 12;
    private static readonly SHAFT_CENTRE : number = 0.4;
    private static readonly HEAD_RADIUS : number = 0.1;
    private static readonly HEAD_LENGTH : number = 0.25;
    private static readonly HEAD_SEGMENTS : number = 16;
    private static readonly HEAD_CENTRE : number = 0.9;
    private static readonly LABEL_TEXTURE_SIZE : number = 64;
    private static readonly LABEL_TEXT_X : number = 32;
    private static readonly LABEL_TEXT_Y : number = 34;
    private static readonly LABEL_DISTANCE : number = 1.22;
    private static readonly LABEL_SIZE : number = 0.42;
    private static readonly SIZE : number = 112;
    private static readonly MARGIN : number = 8;
    private readonly scene : Scene = new Scene();
    private readonly camera : OrthographicCamera = new OrthographicCamera(
        -AxisTriad.CAMERA_EXTENT, AxisTriad.CAMERA_EXTENT, AxisTriad.CAMERA_EXTENT, -AxisTriad.CAMERA_EXTENT,
        AxisTriad.CAMERA_NEAR, AxisTriad.CAMERA_FAR);

    private static createArrow(axis : IAxis) : Group {
        const material : MeshBasicMaterial = new MeshBasicMaterial({color: axis.colour});
        const shaft : Mesh = new Mesh(new CylinderGeometry(
            AxisTriad.SHAFT_RADIUS, AxisTriad.SHAFT_RADIUS,
            AxisTriad.SHAFT_LENGTH, AxisTriad.SHAFT_SEGMENTS), material);
        shaft.position.y = AxisTriad.SHAFT_CENTRE;
        const head : Mesh = new Mesh(new ConeGeometry(
            AxisTriad.HEAD_RADIUS, AxisTriad.HEAD_LENGTH, AxisTriad.HEAD_SEGMENTS), material);
        head.position.y = AxisTriad.HEAD_CENTRE;
        const arrow : Group = new Group().add(shaft, head);
        arrow.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), axis.direction);
        return arrow;
    }

    private static createLabel(axis : IAxis) : Sprite {
        const canvas : HTMLCanvasElement = document.createElement("canvas");
        canvas.width = AxisTriad.LABEL_TEXTURE_SIZE;
        canvas.height = AxisTriad.LABEL_TEXTURE_SIZE;
        const context : CanvasRenderingContext2D | null = canvas.getContext("2d");
        if (context !== null) {
            context.font = "600 40px system-ui, sans-serif";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillStyle = axis.colour;
            context.fillText(axis.label, AxisTriad.LABEL_TEXT_X, AxisTriad.LABEL_TEXT_Y);
        }
        const texture : CanvasTexture = new CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        const label : Sprite = new Sprite(new SpriteMaterial({map: texture, depthTest: false}));
        label.position.copy(axis.direction).multiplyScalar(AxisTriad.LABEL_DISTANCE);
        label.scale.set(AxisTriad.LABEL_SIZE, AxisTriad.LABEL_SIZE, 1);
        return label;
    }

    constructor() {
        const axes : IAxis[] = [
            {direction: new Vector3(1, 0, 0), colour: AxisColours.VALUES.x, label: "X"},
            {direction: new Vector3(0, 1, 0), colour: AxisColours.VALUES.y, label: "Y"},
            {direction: new Vector3(0, 0, 1), colour: AxisColours.VALUES.z, label: "Z"}
        ];
        axes.forEach((axis) => {
            this.scene.add(AxisTriad.createArrow(axis), AxisTriad.createLabel(axis));
        });
    }

    // Draws over the current frame; the renderer must not clear automatically.
    public Render(renderer : WebGLRenderer, view : Camera, width : number, height : number) : void {
        this.camera.quaternion.copy(view.quaternion);
        this.camera.position.set(0, 0, AxisTriad.CAMERA_DISTANCE).applyQuaternion(view.quaternion);
        this.camera.updateMatrixWorld();
        renderer.setScissorTest(true);
        renderer.setScissor(AxisTriad.MARGIN, AxisTriad.MARGIN, AxisTriad.SIZE, AxisTriad.SIZE);
        renderer.setViewport(AxisTriad.MARGIN, AxisTriad.MARGIN, AxisTriad.SIZE, AxisTriad.SIZE);
        renderer.clearDepth();
        renderer.render(this.scene, this.camera);
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, width, height);
    }

    public Dispose() : void {
        DisposeTree.Dispose(this.scene);
    }
}
