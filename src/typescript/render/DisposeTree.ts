/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { Line, Mesh, Points, Sprite, SpriteMaterial, type BufferGeometry, type Material, type Object3D } from "three";

interface IDrawable {
    readonly geometry : BufferGeometry;
    readonly material : Material | Material[];
}

// The instanceof checks alone would type geometry and material as any.
function isDrawable(object : Object3D) : object is Object3D & IDrawable {
    return object instanceof Mesh || object instanceof Line || object instanceof Points || object instanceof Sprite;
}

export function disposeTree(root : Object3D) : void {
    root.traverse((object) => {
        if (isDrawable(object)) {
            object.geometry.dispose();
            [object.material].flat().forEach((material) => {
                if (material instanceof SpriteMaterial) {
                    material.map?.dispose();
                }
                material.dispose();
            });
        }
    });
}
