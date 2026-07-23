/**
 * UniversalTabularSchemaFlattener
 * 
 * 100% Dynamic, Domain-Agnostic JSON Flattener & Tabular Schema Generator.
 * Converts ANY arbitrary deeply nested JSON object or array of objects
 * into flat tabular key-value records for clean CSV export and relational storage.
 */

export class UniversalTabularSchemaFlattener {
    /**
     * Dynamically flattens a nested object into a single-level key-value map.
     * Example: { a: { b: 1, c: { d: 2 } } } -> { "a_b": 1, "a_c_d": 2 }
     */
    static flattenObject(obj: Record<string, any>, prefix: string = ''): Record<string, any> {
        const result: Record<string, any> = {};

        if (!obj || typeof obj !== 'object') {
            return result;
        }

        for (const [key, value] of Object.entries(obj)) {
            const newKey = prefix ? `${prefix}_${key}` : key;

            if (value === null || value === undefined) {
                result[newKey] = null;
            } else if (Array.isArray(value)) {
                if (value.length === 0) {
                    result[newKey] = '[]';
                } else if (typeof value[0] !== 'object') {
                    result[newKey] = value.join('; ');
                } else {
                    // For array of nested objects, serialize count and first item preview
                    result[`${newKey}_count`] = value.length;
                }
            } else if (typeof value === 'object') {
                const nested = this.flattenObject(value, newKey);
                Object.assign(result, nested);
            } else {
                result[newKey] = value;
            }
        }

        return result;
    }

    /**
     * Dynamically flattens an arbitrary payload containing arrays of nested items into flat tabular rows.
     * Zero hardcoded keys or domain field names.
     */
    static flattenPayloadToRows(
        entityName: string,
        entityId: string,
        rawPayload: Record<string, any>
    ): Record<string, any>[] {
        const flatRows: Record<string, any>[] = [];

        if (!rawPayload || typeof rawPayload !== 'object') {
            return flatRows;
        }

        // Iterate through all top-level keys dynamically
        for (const [categoryKey, categoryValue] of Object.entries(rawPayload)) {
            if (Array.isArray(categoryValue)) {
                for (let index = 0; index < categoryValue.length; index++) {
                    const item = categoryValue[index];
                    if (item && typeof item === 'object') {
                        const flattenedItem = this.flattenObject(item);
                        flatRows.push({
                            entityName,
                            entityId,
                            categoryKey,
                            itemIndex: index + 1,
                            ...flattenedItem
                        });
                    }
                }
            } else if (categoryValue && typeof categoryValue === 'object') {
                const flattenedItem = this.flattenObject(categoryValue);
                flatRows.push({
                    entityName,
                    entityId,
                    categoryKey,
                    itemIndex: 1,
                    ...flattenedItem
                });
            }
        }

        // Fallback: If no arrays were present, flatten the root object
        if (flatRows.length === 0) {
            flatRows.push({
                entityName,
                entityId,
                categoryKey: 'root',
                itemIndex: 1,
                ...this.flattenObject(rawPayload)
            });
        }

        return flatRows;
    }
}

// Export alias for backward compatibility
export const PlayerActionSchemaFlattener = UniversalTabularSchemaFlattener;
