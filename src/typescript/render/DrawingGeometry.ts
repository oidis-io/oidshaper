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
    BufferGeometry, CanvasTexture, DoubleSide, Float32BufferAttribute, Group, Line, LineBasicMaterial, LineLoop,
    Mesh, MeshBasicMaterial, MeshLambertMaterial, Points, PointsMaterial, Sprite, SpriteMaterial
} from "three";

import type { IDrawing } from "../core/IDrawing.js";
import type { LocalOrigin } from "../core/LocalOrigin.js";

export class DrawingGeometry {
    private static readonly POSITION_COMPONENTS : number = 3;
    private static readonly COLOUR_RADIX : number = 16;
    private static readonly COLOUR_HEX_DIGITS : number = 6;
    private static readonly DEGREES_PER_HALF_TURN : number = 180;
    private static readonly DEFAULT_PATH_COLOUR : number = 0x12b5cb;
    private static readonly DEFAULT_MESH_COLOUR : number = 0xe2a700;
    private static readonly DEFAULT_LABEL_COLOUR : number = 0xffffff;
    private static readonly POINT_SIZE_PIXELS : number = 5;
    private static readonly MAX_LABEL_TEXTURE_SIZE : number = 4096;
    private static readonly LABEL_FONT_SIZE : number = 48;
    private static readonly LABEL_LINE_HEIGHT : number = 60;
    private static readonly LABEL_PADDING : number = 4;
    private static readonly LABEL_TOTAL_PADDING : number = 8;

    public static Create(drawing : IDrawing, origin : LocalOrigin) : Group {
        const group : Group = new Group();
        for (const path of drawing.paths) {
            const geometry : BufferGeometry = new BufferGeometry();
            geometry.setAttribute("position", new Float32BufferAttribute(
                origin.ToLocalBuffer(path.points.flatMap((p) => [p.x, p.y, p.z])), DrawingGeometry.POSITION_COMPONENTS
            ));
            const colour : number = path.colour ?? DrawingGeometry.DEFAULT_PATH_COLOUR;
            if (path.points.length === 1) {
                group.add(new Points(geometry, new PointsMaterial({
                    color: colour, size: DrawingGeometry.POINT_SIZE_PIXELS, sizeAttenuation: false})));
            } else if (path.filled === true) {
                const indices : number[] = [];
                for (let i = 1; i < (path.points.length - 1); i++) {
                    indices.push(0, i, i + 1);
                }
                geometry.setIndex(indices);
                group.add(new Mesh(geometry, new MeshBasicMaterial({color: colour, side: DoubleSide})));
            } else {
                const material : LineBasicMaterial = new LineBasicMaterial({color: colour});
                group.add(path.closed ? new LineLoop(geometry, material) : new Line(geometry, material));
            }
            const object = group.children.at(-1);
            if (object !== undefined) {
                object.userData["entityId"] = path.entityId;
            }
        }
        for (const mesh of drawing.meshes ?? []) {
            const geometry = new BufferGeometry();
            geometry.setAttribute("position", new Float32BufferAttribute(
                origin.ToLocalBuffer(mesh.vertices.flatMap((point) => [point.x, point.y, point.z])),
                DrawingGeometry.POSITION_COMPONENTS));
            geometry.setIndex([...mesh.triangles]);
            geometry.computeVertexNormals();
            const object = new Mesh(geometry, new MeshLambertMaterial({
                color: mesh.colour ?? DrawingGeometry.DEFAULT_MESH_COLOUR,
                side: DoubleSide, flatShading: true}));
            object.userData["entityId"] = mesh.entityId;
            object.userData["triangleFaces"] = mesh.triangleFaces;
            group.add(object);
        }
        for (const label of drawing.labels ?? []) {
            const canvas : HTMLCanvasElement = document.createElement("canvas");
            const context : CanvasRenderingContext2D | null = canvas.getContext("2d");
            if (context === null) {
                throw new Error("Cannot create label canvas.");
            }
            const lines : string[] = label.text.split("\n");
            context.font = `${String(DrawingGeometry.LABEL_FONT_SIZE)}px sans-serif`;
            canvas.width = Math.min(DrawingGeometry.MAX_LABEL_TEXTURE_SIZE,
                Math.ceil(Math.max(1, ...lines.map((line) => context.measureText(line).width))) +
                DrawingGeometry.LABEL_TOTAL_PADDING);
            canvas.height = Math.min(DrawingGeometry.MAX_LABEL_TEXTURE_SIZE,
                (lines.length * DrawingGeometry.LABEL_LINE_HEIGHT) + DrawingGeometry.LABEL_TOTAL_PADDING);
            context.font = `${String(DrawingGeometry.LABEL_FONT_SIZE)}px sans-serif`;
            const colour = (label.colour ?? DrawingGeometry.DEFAULT_LABEL_COLOUR)
                .toString(DrawingGeometry.COLOUR_RADIX).padStart(DrawingGeometry.COLOUR_HEX_DIGITS, "0");
            context.fillStyle = `#${colour}`;
            context.textBaseline = "top";
            lines.forEach((line, index) => {
                context.fillText(line, DrawingGeometry.LABEL_PADDING,
                    (index * DrawingGeometry.LABEL_LINE_HEIGHT) + DrawingGeometry.LABEL_PADDING);
            });
            const texture : CanvasTexture = new CanvasTexture(canvas);
            const sprite : Sprite = new Sprite(new SpriteMaterial({map: texture,
                rotation: (label.rotation * Math.PI) / DrawingGeometry.DEGREES_PER_HALF_TURN}));
            const position = origin.ToLocal(label.position);
            sprite.position.set(position.x, position.y, position.z);
            sprite.center.set(0, 0);
            sprite.scale.set(
                (canvas.width / DrawingGeometry.LABEL_FONT_SIZE) * label.height,
                (canvas.height / DrawingGeometry.LABEL_FONT_SIZE) * label.height, 1);
            group.add(sprite);
        }
        return group;
    }
}
