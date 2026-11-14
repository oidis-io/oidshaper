/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import type { IVector3 } from "../LocalOrigin.js";

// Column-major affine matrix; numbers remain doubles until rendering.
export type EntityTransform = readonly number[];

export class EntityTransforms {
    private static readonly MATRIX_ORDER : number = 4;
    private static readonly ELEMENT_COUNT : number = 16;
    private static readonly AUGMENTED_ROW_LENGTH : number = 8;
    private static readonly MIN_PIVOT_MAGNITUDE : number = 1e-15;

    public static Identity() : EntityTransform {
        return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    }

    public static Validate(matrix : EntityTransform) : void {
        if (matrix.length !== EntityTransforms.ELEMENT_COUNT || !matrix.every(Number.isFinite) ||
            matrix[3] !== 0 || matrix[7] !== 0 ||
            matrix[11] !== 0 || matrix[15] !== 1) {
            throw new RangeError("Expected a finite affine matrix.");
        }
        EntityTransforms.Inverse(matrix);
    }

    public static Multiply(a : EntityTransform, b : EntityTransform) : EntityTransform {
        const result : number[] = Array<number>(EntityTransforms.ELEMENT_COUNT).fill(0);
        for (let column = 0; column < EntityTransforms.MATRIX_ORDER; column++) {
            for (let row = 0; row < EntityTransforms.MATRIX_ORDER; row++) {
                for (let index = 0; index < EntityTransforms.MATRIX_ORDER; index++) {
                    const target = (column * EntityTransforms.MATRIX_ORDER) + row;
                    const left = (index * EntityTransforms.MATRIX_ORDER) + row;
                    const right = (column * EntityTransforms.MATRIX_ORDER) + index;
                    result[target] = (result[target] ?? 0) + ((a[left] ?? 0) * (b[right] ?? 0));
                }
            }
        }
        return result;
    }

    public static TransformPoint(matrix : EntityTransform, point : IVector3, direction : boolean = false) : IVector3 {
        const w = direction ? 0 : 1;
        return {x: ((matrix[0] ?? 0) * point.x) + ((matrix[4] ?? 0) * point.y) + ((matrix[8] ?? 0) * point.z) +
            ((matrix[12] ?? 0) * w),
        y: ((matrix[1] ?? 0) * point.x) + ((matrix[5] ?? 0) * point.y) + ((matrix[9] ?? 0) * point.z) +
            ((matrix[13] ?? 0) * w),
        z: ((matrix[2] ?? 0) * point.x) + ((matrix[6] ?? 0) * point.y) + ((matrix[10] ?? 0) * point.z) +
            ((matrix[14] ?? 0) * w)};
    }

    public static Inverse(matrix : EntityTransform) : EntityTransform {
        const rows = Array.from({length: EntityTransforms.MATRIX_ORDER}, (_, row) =>
            Array.from({length: EntityTransforms.AUGMENTED_ROW_LENGTH}, (_, column) =>
                column < EntityTransforms.MATRIX_ORDER ? matrix[(column * EntityTransforms.MATRIX_ORDER) + row] ?? 0 :
                    Number(column - EntityTransforms.MATRIX_ORDER === row)));
        for (let column = 0; column < EntityTransforms.MATRIX_ORDER; column++) {
            let pivot = column;
            for (let row = column + 1; row < EntityTransforms.MATRIX_ORDER; row++) {
                if (Math.abs(rows[row]?.[column] ?? 0) > Math.abs(rows[pivot]?.[column] ?? 0)) {
                    pivot = row;
                }
            }
            const pivotRow = rows[pivot];
            const currentRow = rows[column];
            if (pivotRow === undefined || currentRow === undefined ||
                Math.abs(pivotRow[column] ?? 0) < EntityTransforms.MIN_PIVOT_MAGNITUDE) {
                throw new RangeError("Entity transform is singular.");
            }
            rows[pivot] = currentRow;
            rows[column] = pivotRow;
            const divisor = pivotRow[column] ?? 1;
            for (let index = 0; index < EntityTransforms.AUGMENTED_ROW_LENGTH; index++) {
                pivotRow[index] = (pivotRow[index] ?? 0) / divisor;
            }
            for (let row = 0; row < EntityTransforms.MATRIX_ORDER; row++) {
                const target = rows[row];
                if (row === column || target === undefined) {
                    continue;
                }
                const factor = target[column] ?? 0;
                for (let index = 0; index < EntityTransforms.AUGMENTED_ROW_LENGTH; index++) {
                    target[index] = (target[index] ?? 0) - (factor * (pivotRow[index] ?? 0));
                }
            }
        }
        return Array.from({length: EntityTransforms.ELEMENT_COUNT}, (_, index) => {
            const row = index % EntityTransforms.MATRIX_ORDER;
            const column = Math.floor(index / EntityTransforms.MATRIX_ORDER) + EntityTransforms.MATRIX_ORDER;
            return rows[row]?.[column] ?? 0;
        });
    }

    public static Translation(offset : IVector3) : EntityTransform {
        const result = [...EntityTransforms.Identity()];
        result[12] = offset.x;
        result[13] = offset.y;
        result[14] = offset.z;
        return result;
    }

    public static Rotation(rotation : IVector3) : EntityTransform {
        const cx = Math.cos(rotation.x), sx = Math.sin(rotation.x);
        const cy = Math.cos(rotation.y), sy = Math.sin(rotation.y);
        const cz = Math.cos(rotation.z), sz = Math.sin(rotation.z);
        return [cz * cy, sz * cy, -sy, 0,
            (cz * sy * sx) - (sz * cx), (sz * sy * sx) + (cz * cx), cy * sx, 0,
            (cz * sy * cx) + (sz * sx), (sz * sy * cx) - (cz * sx), cy * cx, 0, 0, 0, 0, 1];
    }

    public static Scale(scale : IVector3) : EntityTransform {
        return [scale.x, 0, 0, 0, 0, scale.y, 0, 0, 0, 0, scale.z, 0, 0, 0, 0, 1];
    }
}
