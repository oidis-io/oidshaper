/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

// The WebGL canvas must preserve its drawing buffer; x and y are drawing buffer pixels from the top left.
export function readPixel(source : HTMLCanvasElement, x : number, y : number) : number[] {
    const copy : HTMLCanvasElement = document.createElement("canvas");
    copy.width = source.width;
    copy.height = source.height;
    const context : CanvasRenderingContext2D | null = copy.getContext("2d");
    if (context === null) {
        throw new Error("2D canvas context is not available.");
    }
    context.drawImage(source, 0, 0);
    return Array.from(context.getImageData(x, y, 1, 1).data);
}
