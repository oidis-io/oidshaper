/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

export enum CursorOperation {
    MOVE = "move",
    AXIS = "axis",
    ROTATE = "rotate",
    SCALE = "scale"
}

export class TransformCursor {
    private static readonly HALF_TURN_DEGREES : number = 180;
    private static readonly MIN_PROJECTION_PX : number = 8;
    private static readonly ANGLE_HYSTERESIS : number = 0.75;
    private static readonly RESIZE_STEP_DEGREES : number = 45;
    private static readonly RESIZE_DIRECTIONS : number = 4;
    private static readonly ACTIVE_HOTSPOT_PX : number = 16;

    private static readonly STEP : number = 15;
    private static readonly cache = new Map<string, string>();
    private static readonly ARROW : string = "M2 2V22L7.5 17L11 25L14.5 23.5L11 15.8H18Z";
    // Symbol path and native fallback; the axis fallback follows its angle.
    private static readonly SYMBOLS : ReadonlyMap<CursorOperation, readonly [string, string]> = new Map<CursorOperation,
        readonly [string, string]>([
        [CursorOperation.MOVE,
            ["M16 4V28M4 16H28M12 8L16 4L20 8M12 24L16 28L20 24M8 12L4 16L8 20M24 12L28 16L24 20", "move"]],
        [CursorOperation.AXIS, ["M4 16H28M9 11L4 16L9 21M23 11L28 16L23 21", "move"]],
        [CursorOperation.ROTATE, ["M8.5 21.5A9 9 0 1 1 23.5 21.5M23.5 15V21.5H17", "grabbing"]],
        [CursorOperation.SCALE, ["M6 26L26 6M6 19V26H13M19 6H26V13M13 13H19V19H13Z", "nwse-resize"]]
    ]);

    // CSS cursor: hover is an arrow with a small badge, active is the operation symbol only.
    public static TransformCursor(operation : CursorOperation, active : boolean, angle : number = 0) : string {
        const degrees = operation === CursorOperation.AXIS ?
            (((Math.round(angle / TransformCursor.STEP) * TransformCursor.STEP) %
                TransformCursor.HALF_TURN_DEGREES) + TransformCursor.HALF_TURN_DEGREES) %
                    TransformCursor.HALF_TURN_DEGREES : 0;
        const key = `${operation}:${String(active)}:${String(degrees)}`;
        let value = TransformCursor.cache.get(key);
        if (value === undefined) {
            const rotation = `rotate(${String(degrees)} 16 16)`;
            const fallback = operation === CursorOperation.AXIS ? TransformCursor.resize(degrees) :
                TransformCursor.SYMBOLS.get(operation)?.[1] ?? "move";
            value = active ? TransformCursor.encode(TransformCursor.symbol(operation, rotation),
                TransformCursor.ACTIVE_HOTSPOT_PX, TransformCursor.ACTIVE_HOTSPOT_PX, fallback) :
                TransformCursor.encode(`<path d="${TransformCursor.ARROW}" fill="#111" stroke="#fff" ` +
                    "stroke-width=\"1.5\" stroke-linejoin=\"round\"/>" +
                    TransformCursor.symbol(operation, `translate(15 15) scale(.5) ${rotation}`), 2, 2, "default");
            TransformCursor.cache.set(key, value);
        }
        return value;
    }

    // Screen angle in degrees, quantised; kept while the projection is too short or the change is small.
    public static StableCursorAngle(dx : number, dy : number, previous : number | null) : number | null {
        if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < TransformCursor.MIN_PROJECTION_PX) {
            return previous;
        }
        const raw = ((((Math.atan2(dy, dx) * TransformCursor.HALF_TURN_DEGREES) / Math.PI) %
            TransformCursor.HALF_TURN_DEGREES) + TransformCursor.HALF_TURN_DEGREES) % TransformCursor.HALF_TURN_DEGREES;
        if (previous !== null) {
            const difference = Math.abs(raw - previous) % TransformCursor.HALF_TURN_DEGREES;
            if (Math.min(difference, TransformCursor.HALF_TURN_DEGREES - difference) < TransformCursor.STEP *
                TransformCursor.ANGLE_HYSTERESIS) {
                return previous;
            }
        }
        return (Math.round(raw / TransformCursor.STEP) * TransformCursor.STEP) % TransformCursor.HALF_TURN_DEGREES;
    }

    // Draws a symbol with a contrasting underlay in the 32 px cursor box.
    private static symbol(operation : CursorOperation, transform : string) : string {
        const path = TransformCursor.SYMBOLS.get(operation)?.[0] ?? "";
        return `<g transform="${transform}" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
            `<path d="${path}" stroke="#fff" stroke-width="5"/><path d="${path}" stroke="#111" stroke-width="2"/></g>`;
    }

    private static encode(svg : string, x : number, y : number, fallback : string) : string {
        return `url("data:image/svg+xml,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${svg}</svg>`
        )}") ${String(x)} ${String(y)}, ${fallback}`;
    }

    private static resize(angle : number) : string {
        const index = Math.round((((angle % TransformCursor.HALF_TURN_DEGREES) +
            TransformCursor.HALF_TURN_DEGREES) % TransformCursor.HALF_TURN_DEGREES) /
                TransformCursor.RESIZE_STEP_DEGREES) % TransformCursor.RESIZE_DIRECTIONS;
        return ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"][index] ?? "move";
    }
}

/** Single document-wide cursor for a pressed gesture; restores the previous cursors when cleared. */
export class ActiveCursor {
    private readonly style = document.createElement("style");

    public setCursor(cursor : string) : void {
        this.style.textContent = `*, *::before, *::after { cursor: ${cursor} !important; }`;
        if (!this.style.isConnected) {
            document.head.append(this.style);
        }
    }

    public Clear() : void {
        this.style.remove();
    }

    public IsActive() : boolean {
        return this.style.isConnected;
    }
}
