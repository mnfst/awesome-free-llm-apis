import { describe, it, expect } from 'vitest';
import { UniversalTabularSchemaFlattener } from '../src/utils/UniversalTabularSchemaFlattener.js';

describe('UniversalTabularSchemaFlattener (100% Dynamic Flattener)', () => {
    it('dynamically flattens arbitrary nested objects without domain hardcoding', () => {
        const nestedPayload = {
            passes: [
                {
                    playerCoordinates: { x: 66.1, y: 8.1 },
                    passEndCoordinates: { x: 42.9, y: 34.9 },
                    eventActionType: 'pass',
                    outcome: true,
                    keypass: false
                }
            ],
            dribbles: [
                {
                    playerCoordinates: { x: 74.6, y: 8.4 },
                    eventActionType: 'dribble',
                    outcome: true
                }
            ]
        };

        const flatRows = UniversalTabularSchemaFlattener.flattenPayloadToRows('Josué', '77726', nestedPayload);

        expect(flatRows).toHaveLength(2);

        // Check Row 1 (Passes)
        expect(flatRows[0].entityName).toBe('Josué');
        expect(flatRows[0].categoryKey).toBe('passes');
        expect(flatRows[0].playerCoordinates_x).toBe(66.1);
        expect(flatRows[0].playerCoordinates_y).toBe(8.1);
        expect(flatRows[0].passEndCoordinates_x).toBe(42.9);
        expect(flatRows[0].passEndCoordinates_y).toBe(34.9);
        expect(flatRows[0].eventActionType).toBe('pass');

        // Check Row 2 (Dribbles)
        expect(flatRows[1].categoryKey).toBe('dribbles');
        expect(flatRows[1].playerCoordinates_x).toBe(74.6);
        expect(flatRows[1].eventActionType).toBe('dribble');
    });

    it('handles non-sports arbitrary nested payloads (e-commerce products)', () => {
        const ecommercePayload = {
            specifications: [
                { dimension: { width: 10, height: 20 }, weight_kg: 1.5, color: 'Black' }
            ]
        };

        const flatRows = UniversalTabularSchemaFlattener.flattenPayloadToRows('Laptop Stand', 'SKU-100', ecommercePayload);

        expect(flatRows).toHaveLength(1);
        expect(flatRows[0].entityName).toBe('Laptop Stand');
        expect(flatRows[0].categoryKey).toBe('specifications');
        expect(flatRows[0].dimension_width).toBe(10);
        expect(flatRows[0].dimension_height).toBe(20);
        expect(flatRows[0].weight_kg).toBe(1.5);
    });
});
