import type { Message } from '../providers/types.js';

/**
 * Safely extracts text content from a Message, handling both string and multi-modal (array) content.
 */
/**
 * Safely extracts text content from a Message or raw content, handling strings, multi-modal (array) content, and structured objects.
 */
export function getMessageContent(input: any): string {
    if (input === undefined || input === null) return '';

    // Handle full Message object
    let content = input;
    if (typeof input === 'object' && 'content' in input && input.content !== undefined) {
        content = input.content;
    }

    if (content === undefined || content === null) return '';
    
    // 1. String content
    if (typeof content === 'string') return content;
    
    // 2. Array-based multi-modal content
    if (Array.isArray(content)) {
        return content
            .map((part: any) => {
                if (typeof part === 'string') return part;
                if (part && typeof part === 'object') {
                    return extractTextField(part);
                }
                return String(part);
            })
            .filter(Boolean)
            .join(' ');
    }

    // 3. Single-object content (some models/parsers return this)
    if (typeof content === 'object') {
        return extractTextField(content) || JSON.stringify(content);
    }

    return String(content);
}

/**
 * Pulls a text-like field (`text`/`task`/`content`) off an object and guarantees a
 * string back — recursing through getMessageContent() when that field is itself a
 * nested array/object instead of returning it raw. Returning the raw value here was
 * the actual bug: `part.text || part.task || part.content || ''` looks safe but if
 * e.g. `part.content` is itself an array of content-parts (a nested/malformed
 * multi-modal payload), it got returned as-is, silently violating this function's
 * `string` contract — and wherever a caller interpolated that into a template
 * literal or joined it with other strings, JS's implicit Array/Object.toString()
 * produced "[object Object],[object Object],..." (one per nested part).
 */
function extractTextField(obj: any): string {
    const val = obj?.text ?? obj?.task ?? obj?.content;
    if (val === undefined || val === null || val === '') return '';
    if (typeof val === 'string') return val;
    return getMessageContent(val);
}

/**
 * Safely prepends a string to a message's content, preserving multi-modal structure if present.
 */
export function prependToMessageContent(msg: any, prefix: string): void {
    if (!prefix) return;
    
    if (typeof msg.content === 'string') {
        msg.content = (prefix + (msg.content || '')).trim();
    } else if (Array.isArray(msg.content)) {
        // If it's an array, prepend a text part
        msg.content = [{ type: 'text', text: prefix }, ...msg.content];
    } else if (msg.content && typeof msg.content === 'object') {
        // If it's a single object, convert to array or wrap
        if ('text' in msg.content) {
            msg.content.text = prefix + msg.content.text;
        } else {
            msg.content = [
                { type: 'text', text: prefix },
                msg.content
            ];
        }
    } else {
        // Fallback for null/undefined or other types
        msg.content = prefix + (msg.content ? String(msg.content) : '');
    }
}

/**
 * Safely appends a string to a message's content, preserving multi-modal structure if present.
 */
export function appendToMessageContent(msg: any, suffix: string): void {
    if (!suffix) return;
    
    if (typeof msg.content === 'string') {
        msg.content = ((msg.content || '') + suffix).trim();
    } else if (Array.isArray(msg.content)) {
        msg.content = [...msg.content, { type: 'text', text: suffix }];
    } else if (msg.content && typeof msg.content === 'object') {
        if ('text' in msg.content) {
            msg.content.text = msg.content.text + suffix;
        } else {
            msg.content = [
                msg.content,
                { type: 'text', text: suffix }
            ];
        }
    } else {
        msg.content = (msg.content ? String(msg.content) : '') + suffix;
    }
}

/**
 * Detects if a text prompt is considered "confused" (i.e. contains no actual instructions,
 * consists only of file path references like file:///..., or uses default vision template boilerplates).
 */
export function isUserConfused(text?: string): boolean {
    if (!text) return true;
    const trimmed = text.trim();
    if (trimmed.length === 0) return true;

    // Check if it contains file paths
    const hasFiles = /file:\/\/\/\S+/i.test(trimmed);
    const cleanOfFiles = trimmed.replace(/file:\/\/\/\S+/g, '').trim();
    
    if (hasFiles && cleanOfFiles.length < 15) {
        return true;
    }

    // Check if it contains default vision boilerplates or simple image instructions
    const boilerplates = [
        'analyze this image and provide a concise technical markdown report',
        'analyze this image',
        'what is this',
        'describe this image',
        'analyze the image',
        'read this file',
        'explain this'
    ];
    const lower = cleanOfFiles.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").trim();
    if (boilerplates.includes(lower)) {
        return true;
    }

    return false;
}
