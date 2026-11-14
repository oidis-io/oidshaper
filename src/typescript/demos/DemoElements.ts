/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

interface IElementConstructor<T extends HTMLElement> {
    new() : T;
}

export class DemoElements {
    public static FindEnum<T extends string>(value : string, values : readonly T[]) : T | undefined {
        return values.find((candidate) => candidate === value);
    }

    public static ParseEnum<T extends string>(value : string, values : readonly T[]) : T {
        const result = DemoElements.FindEnum(value, values);
        if (result === undefined) {
            throw new RangeError(`Unsupported demo option: ${value}`);
        }
        return result;
    }

    public static getElement<T extends HTMLElement>(id : string, kind : IElementConstructor<T>) : T {
        const value = document.getElementById(id);
        if (!(value instanceof kind)) {
            throw new Error(`Missing demo control: ${id}`);
        }
        return value;
    }
}
