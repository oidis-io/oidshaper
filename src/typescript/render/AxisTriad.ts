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
    CanvasTexture, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, OrthographicCamera, Scene, Sprite,
    SpriteMaterial, SRGBColorSpace, Vector3, type Camera, type WebGLRenderer
} from "three";
import { AXIS_COLOURS } from "./AxisColours.js";
import { disposeTree } from "./DisposeTree.js";

const SIZE : number = 112;
const MARGIN : number = 8;

interface IAxis {
    readonly direction : Vector3;
    readonly colour : string;
    readonly label : string;
}

function createArrow(axis : IAxis) : Group {
    const material : MeshBasicMaterial = new MeshBasicMaterial({color: axis.colour});
    const shaft : Mesh = new Mesh(new CylinderGeometry(0.035, 0.035, 0.8, 12), material);
    shaft.position.y = 0.4;
    const head : Mesh = new Mesh(new ConeGeometry(0.1, 0.25, 16), material);
    head.position.y = 0.9;
    const arrow : Group = new Group().add(shaft, head);
    arrow.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), axis.direction);
    return arrow;
}

function createLabel(axis : IAxis) : Sprite {
    const canvas : HTMLCanvasElement = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context : CanvasRenderingContext2D | null = canvas.getContext("2d");
    if (context !== null) {
        context.font = "600 40px system-ui, sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = axis.colour;
        context.fillText(axis.label, 32, 34);
    }
    const texture : CanvasTexture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const label : Sprite = new Sprite(new SpriteMaterial({map: texture, depthTest: false}));
    label.position.copy(axis.direction).multiplyScalar(1.22);
    label.scale.set(0.42, 0.42, 1);
    return label;
}

export class AxisTriad {
    private readonly scene : Scene = new Scene();
    private readonly camera : OrthographicCamera = new OrthographicCamera(-1.45, 1.45, 1.45, -1.45, 0.1, 10);

    constructor() {
        const axes : IAxis[] = [
            {direction: new Vector3(1, 0, 0), colour: AXIS_COLOURS.x, label: "X"},
            {direction: new Vector3(0, 1, 0), colour: AXIS_COLOURS.y, label: "Y"},
            {direction: new Vector3(0, 0, 1), colour: AXIS_COLOURS.z, label: "Z"}
        ];
        axes.forEach((axis) => {
            this.scene.add(createArrow(axis), createLabel(axis));
        });
    }

    // Draws over the current frame; the renderer must not clear automatically.
    public Render(renderer : WebGLRenderer, view : Camera, width : number, height : number) : void {
        this.camera.quaternion.copy(view.quaternion);
        this.camera.position.set(0, 0, 4).applyQuaternion(view.quaternion);
        this.camera.updateMatrixWorld();
        renderer.setScissorTest(true);
        renderer.setScissor(MARGIN, MARGIN, SIZE, SIZE);
        renderer.setViewport(MARGIN, MARGIN, SIZE, SIZE);
        renderer.clearDepth();
        renderer.render(this.scene, this.camera);
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, width, height);
    }

    public Dispose() : void {
        disposeTree(this.scene);
    }
}
