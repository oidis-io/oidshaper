/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { NavigationCube } from "../../../src/typescript/render/NavigationCube.js";

const normals : Vector3[] = [new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 1, 0),
    new Vector3(0, -1, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1)];

describe("Navigation cube regions", () => {
    it("highlights all adjacent faces for every edge and corner, but never opposite faces", () => {
        for (const x of [-1, 0, 1]) {
            for (const y of [-1, 0, 1]) {
                for (const z of [-1, 0, 1]) {
                    const direction = new Vector3(x, y, z);
                    const regions = normals.map((normal) => NavigationCube.FaceRegion(direction, normal));
                    expect(regions.filter((region) => region !== null))
                        .toHaveLength(Math.abs(x) + Math.abs(y) + Math.abs(z));
                    normals.forEach((normal, index) => {
                        const region = regions[index];
                        if (region !== null && region !== undefined) {
                            expect(region.dot(normal)).toBeCloseTo(0.5);
                            expect(region.toArray().every((value) => Math.abs(value) <= 0.5)).toBe(true);
                        }
                    });
                }
            }
        }
    });

    it("identifies the same corner and edge from either incident face", () => {
        expect(NavigationCube.Direction(new Vector3(-0.5, -0.45, 0.46))).toEqual(new Vector3(-1, -1, 1));
        expect(NavigationCube.Direction(new Vector3(-0.46, -0.5, 0.45))).toEqual(new Vector3(-1, -1, 1));
        expect(NavigationCube.Direction(new Vector3(-0.45, -0.46, 0.5))).toEqual(new Vector3(-1, -1, 1));
        expect(NavigationCube.Direction(new Vector3(-0.5, 0.1, 0.45))).toEqual(new Vector3(-1, 0, 1));
        expect(NavigationCube.Direction(new Vector3(-0.45, 0.1, 0.5))).toEqual(new Vector3(-1, 0, 1));
    });
});
